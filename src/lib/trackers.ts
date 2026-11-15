import { prisma } from "@/lib/db";
import type { Ticket } from "@prisma/client";

// Optional trackers. BMAD's ticket tree stays the source of truth; these mirror it.
// Linear syncs live (create, move). Jira is a one-way export the person confirms.

export function trackerStatus() {
  return {
    linear: Boolean(process.env.LINEAR_API_KEY),
    jira: Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN),
  };
}

// ---------- Linear ----------

async function linear<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: process.env.LINEAR_API_KEY || "" },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (!r.ok || j.errors?.length) throw new Error(`Linear: ${j.errors?.map((e) => e.message).join("; ") || r.status}`);
  return j.data as T;
}

type LinearTeam = { id: string; states: { nodes: { id: string; name: string; type: string }[] } };
let teamCache: { key: string; team: LinearTeam } | null = null;

async function linearTeam(key: string) {
  if (teamCache?.key === key) return teamCache.team;
  const d = await linear<{ teams: { nodes: LinearTeam[] } }>(
    `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id states { nodes { id name type } } } } }`,
    { key },
  );
  const team = d.teams.nodes[0];
  if (!team) throw new Error(`Linear: no team with key ${key}`);
  teamCache = { key, team };
  return team;
}

function linearState(team: LinearTeam, column: string) {
  const s = team.states.nodes;
  const byType = (t: string) => s.find((x) => x.type === t);
  const byName = (re: RegExp) => s.find((x) => re.test(x.name));
  switch (column) {
    case "backlog":
      return byType("backlog") ?? byType("unstarted");
    case "ready":
      return byName(/^(todo|ready)/i) ?? byType("unstarted");
    case "in_progress":
      return byName(/in progress/i) ?? byType("started");
    case "built":
      return byName(/review/i) ?? byType("started");
    case "done":
      return byType("completed");
  }
  return undefined;
}

function describe(t: Ticket) {
  return [
    `BMAD ${t.kind} ${t.ref}.`,
    t.verify ? `Verify: ${t.verify}` : "",
    t.unknown ? `Open question: ${t.unknown}` : "",
    t.after.length ? `Waits on: ${t.after.join(", ")}` : "",
    "Source of truth: the BMAD ticket tree in the BMAD Accelerator.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function pushLinear(t: Ticket, teamKey: string) {
  const team = await linearTeam(teamKey);
  const state = linearState(team, t.status);
  if (t.trackerId.startsWith("linear:")) {
    await linear(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
      id: t.trackerId.slice(7),
      input: { title: t.title, stateId: state?.id },
    });
    return;
  }
  let parentId: string | undefined;
  if (t.kind !== "epic" && t.epicRef) {
    const epic = await prisma.ticket.findUnique({ where: { useCaseId_ref: { useCaseId: t.useCaseId, ref: t.epicRef } } });
    if (epic && !epic.trackerId.startsWith("linear:")) await pushLinear(epic, teamKey);
    const fresh = epic && (await prisma.ticket.findUnique({ where: { id: epic.id } }));
    if (fresh?.trackerId.startsWith("linear:")) parentId = fresh.trackerId.slice(7);
  }
  const d = await linear<{ issueCreate: { issue: { id: string; url: string } } }>(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id url } } }`,
    { input: { teamId: team.id, title: t.title, description: describe(t), stateId: state?.id, parentId } },
  );
  await prisma.ticket.update({
    where: { id: t.id },
    data: { trackerId: `linear:${d.issueCreate.issue.id}`, trackerUrl: d.issueCreate.issue.url },
  });
}

export async function pushTicketToTracker(ticketId: string) {
  const prefs = await prisma.preferences.findUnique({ where: { id: "global" } });
  if (prefs?.tracker !== "linear" || !prefs.trackerProjectKey || !trackerStatus().linear) return;
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (t) await pushLinear(t, prefs.trackerProjectKey);
}

export async function syncUseCaseToLinear(useCaseId: string) {
  const prefs = await prisma.preferences.findUnique({ where: { id: "global" } });
  if (prefs?.tracker !== "linear" || !prefs.trackerProjectKey || !trackerStatus().linear) return 0;
  const tickets = await prisma.ticket.findMany({ where: { useCaseId }, orderBy: [{ kind: "asc" }, { position: "asc" }] });
  const ordered = [...tickets.filter((t) => t.kind === "epic"), ...tickets.filter((t) => t.kind !== "epic")];
  for (const t of ordered) {
    const fresh = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    await pushLinear(fresh, prefs.trackerProjectKey);
  }
  return ordered.length;
}

// ---------- Jira (export) ----------

async function jira<T>(pathname: string, body: unknown): Promise<T> {
  const base = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  const r = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Jira ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j as T;
}

function adf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
}

export async function exportToJira(useCaseId: string, projectKey: string) {
  if (!trackerStatus().jira) throw new Error("Jira is not connected. Add JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN.");
  const tickets = await prisma.ticket.findMany({ where: { useCaseId, kind: { not: "feedback" } }, orderBy: { position: "asc" } });
  const epics = tickets.filter((t) => t.kind === "epic");
  const keys = new Map<string, string>();
  let created = 0;
  for (const e of epics) {
    if (e.trackerId.startsWith("jira:")) {
      keys.set(e.ref, e.trackerId.slice(5));
      continue;
    }
    const r = await jira<{ key: string }>("/rest/api/3/issue", {
      fields: { project: { key: projectKey }, summary: e.title, issuetype: { name: "Epic" }, description: adf(describe(e)) },
    });
    keys.set(e.ref, r.key);
    created++;
    await prisma.ticket.update({
      where: { id: e.id },
      data: { trackerId: `jira:${r.key}`, trackerUrl: `${process.env.JIRA_BASE_URL}/browse/${r.key}` },
    });
  }
  for (const t of tickets.filter((x) => x.kind !== "epic")) {
    if (t.trackerId.startsWith("jira:")) continue;
    const parent = keys.get(t.epicRef);
    const r = await jira<{ key: string }>("/rest/api/3/issue", {
      fields: {
        project: { key: projectKey },
        summary: t.title,
        issuetype: { name: t.kind === "bug" ? "Bug" : t.kind === "spike" ? "Task" : "Story" },
        description: adf(describe(t)),
        ...(parent ? { parent: { key: parent } } : {}),
      },
    });
    created++;
    await prisma.ticket.update({
      where: { id: t.id },
      data: { trackerId: `jira:${r.key}`, trackerUrl: `${process.env.JIRA_BASE_URL}/browse/${r.key}` },
    });
  }
  return created;
}

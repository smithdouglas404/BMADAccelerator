import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { appDir } from "@/lib/preview";
import { workspacePath } from "@/lib/workspace";
import { project, specChanges, stableId, type ProjectionState, type SpecDiffRecord } from "./projection";

type SpecRow = Parameters<typeof specChanges>[0][number];
type SyncState = ProjectionState & { capabilities?: Record<string, string>; specGit?: SpecRow[]; specLinear?: SpecRow[]; specIssues?: Record<string, string> };

async function specRows(useCaseId: string): Promise<SpecRow[]> {
  const rows = await prisma.specSection.findMany({ where: { useCaseId }, orderBy: [{ tab: "asc" }, { position: "asc" }] });
  return rows.map((r) => ({ key: r.key, ref: r.ref, tab: r.tab, title: r.title, content: r.content, status: r.status, basis: r.basis, review: r.review, trace: r.trace }));
}

/** What the next sync would project: backlog records and the specification diffs since the last sync. */
export async function syncPreview(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const state = (await readState(uc.slug)) as SyncState;
  const backlog = await prisma.backlogItem.findMany({ where: { useCaseId, state: { not: "suggested" }, kind: { not: "distraction" } }, orderBy: { createdAt: "asc" } });
  const current = await specRows(useCaseId);
  const gitDiffs = specChanges(state.specGit ?? [], current);
  const linearDiffs = specChanges(state.specLinear ?? [], current);
  const synced = (id: string) => Boolean(state.git[stableId("git", id)]);
  return {
    backlog: backlog.map((b) => ({ id: b.id, title: b.title, group: b.group, synced: synced(b.id) })),
    gitDiffs,
    linearDiffs,
    gitRecords: Object.keys(state.git).length,
    linearRecords: Object.keys(state.linear).length,
  };
}

const run = promisify(execFile);

export function connectionStatus() {
  return { linear: Boolean(process.env.LINEAR_API_KEY), github: Boolean(process.env.GITHUB_TOKEN), voice: Boolean(process.env.ELEVENLABS_API_KEY) };
}

// ---------- Git: the durable implementation handoff ----------

function remoteFor(url: string) {
  const u = url.trim().replace(/\/$/, "");
  if (/^https:\/\//.test(u)) return u.endsWith(".git") ? u : `${u}.git`;
  const m = u.match(/^git@github\.com:(.+)$/);
  if (m) return `https://github.com/${m[1].replace(/\.git$/, "")}.git`;
  return "";
}

/** Writes the Studio projection into the app repository (prototype/), commits, and pushes the branch. */
export async function pushToGit(useCaseId: string) {
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  const remote = remoteFor(uc.repoUrl);
  if (!remote) throw new Error("Add your repository's https address on Connections first.");
  const dir = appDir(uc.slug);
  await fs.mkdir(dir, { recursive: true });
  // The latest package and one file per backlog item, traced back to the Studio.
  const pkgDir = workspacePath(uc.slug, "studio", "package");
  const dest = path.join(dir, "prototype");
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.join(dest, "backlog"), { recursive: true });
  for (const f of await fs.readdir(pkgDir).catch(() => [] as string[])) await fs.copyFile(path.join(pkgDir, f), path.join(dest, f)).catch(() => {});
  const backlog = await prisma.backlogItem.findMany({ where: { useCaseId, state: { not: "suggested" } } });
  const prev = (await readState(uc.slug)) as SyncState;
  // The specification travels too: the living PRD, TRD and trace, plus one record per change since the last push.
  const current = await specRows(useCaseId);
  const diffs = specChanges(prev.specGit ?? [], current);
  const { state, created, updated } = project(
    backlog.map((b) => ({ id: b.id, title: b.title, group: b.group, kind: b.kind })),
    prev,
    diffs,
  );
  for (const rec of Object.values(state.git)) {
    const item = backlog.find((b) => b.id === rec.sourceId);
    if (item) await fs.writeFile(path.join(dir, rec.packagePath), JSON.stringify({ ...rec, item }, null, 2) + "\n");
  }
  await fs.mkdir(path.join(dest, "spec", "changes"), { recursive: true });
  for (const f of ["PRD.md", "TRD.md", "SPEC_TRACE.json", "SPEC_DIFF.md"]) await fs.copyFile(path.join(pkgDir, f), path.join(dest, "spec", f)).catch(() => {});
  for (const d of diffs) await fs.writeFile(path.join(dest, "spec", "changes", `${d.id}.json`), JSON.stringify({ ...d, branch: `studio/spec/${d.id}`, packagePath: `prototype/spec/${d.file}` }, null, 2) + "\n");
  await writeState(uc.slug, { ...prev, ...state, specGit: current });
  try {
    await fs.access(path.join(dir, ".git"));
  } catch {
    await run("git", ["init", "-q"], { cwd: dir });
    await fs.writeFile(path.join(dir, ".gitignore"), "node_modules/\n.next/\ndist/\n*.db\n.env*\n", { flag: "wx" }).catch(() => {});
  }
  await run("git", ["add", "-A"], { cwd: dir });
  await run("git", ["-c", "user.name=Working Backwards Studio", "-c", "user.email=studio@working-backwards.local", "commit", "-q", "--allow-empty", "-m", `Studio sync: iteration ${uc.packageCount}, ${backlog.length} backlog items, ${diffs.length} spec changes`], { cwd: dir });
  const token = process.env.GITHUB_TOKEN || "";
  const auth = token ? ["-c", `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`] : [];
  const branch = uc.gitBranch || "studio";
  try {
    // Never forced: a branch with other history is left alone and reported.
    await run("git", [...auth, "push", remote, `HEAD:refs/heads/${branch}`], { cwd: dir, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const why = /rejected|non-fast-forward|fetch first/i.test(msg)
      ? `The branch "${branch}" already has other work on it. Pick a new branch name on Connections, or merge it first.`
      : /Authentication|403|401|could not read Username/i.test(msg)
        ? "GitHub refused the push. Add a GitHub token with write access in Settings > Models and keys."
        : `Push failed: ${msg.split("\n").filter(Boolean).pop()?.slice(0, 200)}`;
    await prisma.useCase.update({ where: { id: useCaseId }, data: { gitStatus: why } });
    throw new Error(why);
  }
  const status = `Pushed iteration ${uc.packageCount} to ${branch}: ${created} new and ${updated} updated records (${backlog.length} backlog items, ${diffs.length} spec changes), traceable by Studio id.`;
  await prisma.useCase.update({ where: { id: useCaseId }, data: { gitStatus: status, gitPushedAt: new Date() } });
  return { created, updated, branch, specDiffs: diffs.length };
}

async function readState(slug: string): Promise<SyncState> {
  try {
    return JSON.parse(await fs.readFile(workspacePath(slug, "studio", "sync-state.json"), "utf8"));
  } catch {
    return { git: {}, linear: {} };
  }
}
async function writeState(slug: string, s: SyncState) {
  await fs.mkdir(workspacePath(slug, "studio"), { recursive: true });
  await fs.writeFile(workspacePath(slug, "studio", "sync-state.json"), JSON.stringify(s, null, 2) + "\n");
}

// ---------- Linear: a projection of capabilities, epics and stories ----------

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

async function linearTeam(key: string) {
  const d = await linear<{ teams: { nodes: LinearTeam[] } }>(
    `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id states { nodes { id name type } } } } }`,
    { key },
  );
  const team = d.teams.nodes[0];
  if (!team) throw new Error(`Linear has no team with the key ${key}.`);
  return team;
}

function linearState(team: LinearTeam, status: string) {
  const s = team.states.nodes;
  const byType = (t: string) => s.find((x) => x.type === t);
  const byName = (re: RegExp) => s.find((x) => re.test(x.name));
  if (status === "ready") return byName(/^(todo|ready)/i) ?? byType("unstarted");
  if (status === "building") return byName(/in progress/i) ?? byType("started");
  if (status === "review") return byName(/review/i) ?? byType("started");
  if (status === "done" || status === "built") return byType("completed");
  return byType("backlog") ?? byType("unstarted");
}

async function upsertIssue(team: LinearTeam, trackerId: string, input: { title: string; description: string; status: string; parentId?: string }) {
  const stateId = linearState(team, input.status)?.id;
  if (trackerId.startsWith("linear:")) {
    await linear(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
      id: trackerId.slice(7),
      input: { title: input.title, description: input.description, stateId },
    });
    return null;
  }
  const d = await linear<{ issueCreate: { issue: { id: string; url: string } } }>(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id url } } }`,
    { input: { teamId: team.id, title: input.title, description: input.description, stateId, parentId: input.parentId } },
  );
  return d.issueCreate.issue;
}

/** Projects capabilities (as parent issues), backlog items and build moves into a Linear team. Repeatable. */
export async function syncToLinear(useCaseId: string) {
  if (!process.env.LINEAR_API_KEY) throw new Error("Add your Linear key in Settings > Models and keys first.");
  const uc = await prisma.useCase.findUniqueOrThrow({ where: { id: useCaseId } });
  if (!uc.linearTeam) throw new Error("Add your Linear team key on Connections first.");
  const team = await linearTeam(uc.linearTeam);
  let created = 0;
  let updated = 0;
  // Capabilities become parent issues; their Linear ids live in the sync state.
  const state = (await readState(uc.slug)) as SyncState;
  const capIds = (state.capabilities ??= {});
  const caps = await prisma.capability.findMany({ where: { useCaseId }, orderBy: { position: "asc" } });
  for (const c of caps) {
    const issue = await upsertIssue(team, capIds[c.key] ? `linear:${capIds[c.key]}` : "", {
      title: `Capability: ${c.label}`,
      description: `${c.description}\n\n${c.readiness}% ready.\n\nProjected from the Working Backwards Studio (source of truth). Studio capability: ${c.key}.`,
      status: "queued",
    });
    if (issue) {
      capIds[c.key] = issue.id;
      created++;
    } else updated++;
  }
  const parentFor = (group: string) => {
    const c = caps.find((x) => x.label === group || x.key === group);
    return c ? capIds[c.key] : undefined;
  };
  const items = await prisma.backlogItem.findMany({ where: { useCaseId, state: { not: "suggested" }, kind: { not: "distraction" } } });
  for (const b of items) {
    const issue = await upsertIssue(team, b.trackerId, {
      title: b.title,
      description: `${b.note}\n\n${b.kind === "epic" ? "Epic" : "Story"} in ${b.group}. Source: ${b.source}.\n\nProjected from the Working Backwards Studio; Studio item ${b.id}.`,
      status: b.state === "built" ? "done" : b.state === "ready" ? "ready" : "queued",
      parentId: parentFor(b.group),
    });
    if (issue) {
      await prisma.backlogItem.update({ where: { id: b.id }, data: { trackerId: `linear:${issue.id}`, trackerUrl: issue.url } });
      created++;
    } else updated++;
  }
  const moves = await prisma.move.findMany({ where: { useCaseId } });
  for (const m of moves) {
    const issue = await upsertIssue(team, m.trackerId, {
      title: m.title,
      description: `Build move for ${m.capability}. Decision: ${m.decision || "—"}. Owner: ${m.owner}.\n\nProjected from the Working Backwards Studio; Studio move ${m.id}.`,
      status: m.status,
      parentId: parentFor(m.capability),
    });
    if (issue) {
      await prisma.move.update({ where: { id: m.id }, data: { trackerId: `linear:${issue.id}`, trackerUrl: issue.url } });
      created++;
    } else updated++;
  }
  // Specification changes become spec-change issues: the file, before and after, and the Studio trace.
  const current = await specRows(useCaseId);
  const diffs: SpecDiffRecord[] = specChanges(state.specLinear ?? [], current);
  const specIds = (state.specIssues ??= {});
  for (const d of diffs) {
    const issue = await upsertIssue(team, specIds[d.id] ? `linear:${specIds[d.id]}` : "", {
      title: `Spec change: ${d.summary}`,
      description: `File: ${d.file}\nBefore: ${d.from}\nAfter: ${d.to}\n\nStudio trace: ${d.trace ?? d.id}. Projected from the Working Backwards Studio; Studio spec record ${d.id}.`,
      status: "review",
    });
    if (issue) {
      specIds[d.id] = issue.id;
      created++;
    } else updated++;
  }
  const { state: projected } = project(
    items.map((b) => ({ id: b.id, title: b.title, group: b.group, kind: b.kind })),
    state,
    diffs,
  );
  await writeState(uc.slug, { ...state, ...projected, specLinear: current });
  const status = `Synced to Linear team ${uc.linearTeam}: ${created} created, ${updated} updated.`;
  await prisma.useCase.update({ where: { id: useCaseId }, data: { linearStatus: status, linearSyncedAt: new Date() } });
  return { created, updated };
}

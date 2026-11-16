import { z } from "zod";

// The Studio's tools for outside assistants: one list, served as the MCP connector (/api/mcp) and as the
// REST API (/api/v1/<tool>, described by /api/v1/openapi.json). Pure: no I/O, so the rules are testable.
//
// Rules (Doug, Nov 16): read-only by default; approving, building, withdrawing, reopening and sending a
// card back show what would happen and need `confirm: true`; every call is scoped to the token's customer
// and logged; a write by the connector lands in the Truth Graph under the person's name.

const id = z.string().trim().min(10).max(40);
const confirm = z.boolean().optional().describe("Leave out first to see what would happen. Send true only after the person has said yes to that exact action.");

export const TOOLS = {
  list_use_cases: {
    title: "List use cases",
    description: "The use cases this access can see, by customer, with what is waiting on people in each. Start here to find a use case's id.",
    write: false,
    input: z.object({ customer: z.string().max(120).optional().describe("Only this customer's use cases.") }),
  },
  whats_waiting: {
    title: "What's waiting on me",
    description: "Open decisions and checkpoints, cards waiting for human review, and builds running, across the use cases this access can see (or one).",
    write: false,
    input: z.object({ use_case_id: id.optional() }),
  },
  brief: {
    title: "Brief me",
    description: "Where a use case stands: what it is, what was decided, what is open, held thoughts, the board, the last build and the latest conversation.",
    write: false,
    input: z.object({ use_case_id: id }),
  },
  why_changed: {
    title: "Why did this change?",
    description: "The explained change timeline from the Product Truth Graph: what changed, who changed it, and the chain of causes. Filter by a node id (decision:…, backlog:…, spec:prd-…) or words.",
    write: false,
    input: z.object({ use_case_id: id, about: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }),
  },
  read_spec: {
    title: "Read the spec, backlog or board",
    description: "Read one part of a use case: the PRD, the TRD, the PR/FAQ, the backlog, or the board.",
    write: false,
    input: z.object({ use_case_id: id, part: z.enum(["prd", "trd", "prfaq", "backlog", "board"]) }),
  },
  agent_status: {
    title: "Agent status",
    description: "The product's agents (with their Letta persona), their recent runs, and approvals waiting for a person.",
    write: false,
    input: z.object({ use_case_id: id }),
  },
  capture: {
    title: "Capture a thought",
    description: "Hold a thought in the use case's backlog in the person's own words. Socra curates it; nothing becomes a requirement silently.",
    write: true,
    input: z.object({ use_case_id: id, text: z.string().trim().min(1).max(4000) }),
  },
  add_evidence: {
    title: "Add evidence",
    description: "Record what real use showed (an observation, a metric, an interview note, or something that felt wrong). Socra feeds it back into the PRD and TRD.",
    write: true,
    input: z.object({ use_case_id: id, kind: z.enum(["observation", "metric", "interview", "felt-wrong"]).optional(), text: z.string().trim().min(2).max(8000) }),
  },
  start_use_case: {
    title: "Start a use case",
    description: "Start a new use case from the person's words. Socra opens it with one question.",
    write: true,
    input: z.object({
      customer: z.string().trim().max(120).optional(),
      name: z.string().trim().max(120).optional(),
      business_area: z.string().trim().max(120).optional(),
      summary: z.string().trim().max(2000).optional(),
      description: z.string().max(20000).describe("The idea in the person's own words."),
    }),
  },
  answer: {
    title: "Answer Socra",
    description: "Say something to Socra in the person's name: an answer, a new thought, or a number from Socra's numbered options. A bare yes or a number approves what Socra proposed, so it needs confirm.",
    write: true,
    input: z.object({ use_case_id: id, text: z.string().trim().min(1).max(20000), confirm }),
  },
  decide: {
    title: "Approve or reject",
    description: "Approve or reject an open decision or human-in-the-loop checkpoint, with an optional comment. Without confirm it shows what the decision touches.",
    write: true,
    input: z.object({ use_case_id: id, decision_id: id, decision: z.enum(["approve", "reject"]), comment: z.string().max(4000).optional(), confirm }),
  },
  change_item: {
    title: "Change an earlier choice",
    description: "Edit a backlog item in new words, withdraw it (kept in history), reopen a decision, or send a board card back. Socra ripples the change through the spec. Withdraw, reopen and send back need confirm.",
    write: true,
    input: z.object({
      use_case_id: id,
      action: z.enum(["edit", "withdraw", "reopen_decision", "send_back_card"]),
      item_id: id.describe("The backlog item, decision or card id."),
      text: z.string().trim().min(2).max(300).optional().describe("For edit: the new wording."),
      why: z.string().max(400).optional(),
      confirm,
    }),
  },
  build: {
    title: "Build the next version",
    description: "Have Claude Code build the next version from the approved requirements (or redesign the look, or start fresh). Without confirm it shows what the build would include.",
    write: true,
    input: z.object({ use_case_id: id, mode: z.enum(["next", "redesign", "fresh"]).optional(), confirm }),
  },
} as const;

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

/** Actions that show a preview first and run only with confirm: true. */
export function needsConfirm(tool: ToolName, input: Record<string, unknown>, isApproval: (text: string) => boolean): boolean {
  if (input.confirm === true) return false;
  if (tool === "decide" || tool === "build") return true;
  if (tool === "change_item") return input.action !== "edit";
  if (tool === "answer") return isApproval(String(input.text ?? ""));
  return false;
}

export type Gate = { ok: true } | { ok: false; outcome: "denied"; error: string };

/** Who may call what: read-only access and the Viewer role can only look. */
export function gate(tool: ToolName, access: { scope: string; role: string }): Gate {
  if (!TOOLS[tool].write) return { ok: true };
  if (access.scope !== "write") return { ok: false, outcome: "denied", error: "This access is read-only. Ask the Studio's owner for write access on Settings > Connect." };
  if (/^viewer$/i.test(access.role.trim())) return { ok: false, outcome: "denied", error: "Viewers can look but not change anything." };
  return { ok: true };
}

/** A use case is visible when the access is for every customer or for its customer. */
export const inScope = (accessCustomer: string, useCaseCustomer: string) =>
  !accessCustomer || accessCustomer.trim().toLowerCase() === useCaseCustomer.trim().toLowerCase();

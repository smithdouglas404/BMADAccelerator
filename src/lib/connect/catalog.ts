import { z } from "zod";

// The Studio's tools for outside assistants: one list, served as the MCP connector (/api/mcp) and as the
// REST API (/api/v1/<tool>, described by /api/v1/openapi.json). Pure: no I/O, so the rules are testable.
//
// Rules (Doug, Nov 16): read-only by default; anything hard to undo shows what would happen and needs
// `confirm: true`; every call is scoped to the token's customer and logged; a write by the connector lands
// in the Truth Graph under the person's name.
//
// Access (Doug, Nov 16 19:28Z): an admin can do through an assistant everything they can do on screen,
// including archiving and deleting use cases. Every tool needs one of three levels (look, change, admin).
// What a caller may reach is the lower of two things: the level its token was given, and the most its
// role allows (ROLE_RULES). Roles cover people and, later, agent types, in one table.

export const LEVELS = ["read", "write", "admin"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { read: "Look only", write: "Look and make changes", admin: "Admin, full access" };
const rank = (l: Level) => LEVELS.indexOf(l);
export const lower = (a: Level, b: Level): Level => (rank(a) <= rank(b) ? a : b);
export const asLevel = (s: string): Level => (s === "admin" ? "admin" : s === "write" ? "write" : "read");

/** The most each role may do. People first, then agent types (for assistants and automations acting alone). */
export const ROLE_RULES: { role: string; kind: "person" | "agent"; max: Level; note: string }[] = [
  { role: "Admin", kind: "person", max: "admin", note: "Everything, on every use case: archive, restore and delete use cases, people, the call log." },
  { role: "Product owner", kind: "person", max: "write", note: "Shape and build: answer Socra, approve, build, edit the spec, Board and Story map." },
  { role: "Product engineer", kind: "person", max: "write", note: "Same as a product owner." },
  { role: "Business analyst", kind: "person", max: "write", note: "Same as a product owner." },
  { role: "Solution architect", kind: "person", max: "write", note: "Same as a product owner." },
  { role: "UX/UI designer", kind: "person", max: "write", note: "Same as a product owner." },
  { role: "Domain expert", kind: "person", max: "write", note: "Same as a product owner." },
  { role: "Viewer", kind: "person", max: "read", note: "Can look at everything in scope, change nothing." },
  { role: "Agent: watcher", kind: "agent", max: "read", note: "An automation that only reads (status checks, digests)." },
  { role: "Agent: helper", kind: "agent", max: "write", note: "An automation that captures thoughts, evidence and answers, with confirmation." },
  { role: "Agent: operator", kind: "agent", max: "admin", note: "A trusted automation with admin rights. Use sparingly." },
];
/** The most a role may do. Unknown roles keep the old rule: they may change things, but not administer. */
export function roleMax(role: string): Level {
  const r = ROLE_RULES.find((x) => x.role.toLowerCase() === role.trim().toLowerCase());
  return r ? r.max : "write";
}
/** What a token may actually do: the lower of its level and its role's maximum. */
export const effectiveLevel = (access: { scope: string; role: string }): Level => lower(asLevel(access.scope), roleMax(access.role));

const id = z.string().trim().min(10).max(40);
const confirm = z.boolean().optional().describe("Leave out first to see what would happen. Send true only after the person has said yes to that exact action.");
const BOARD_COLUMNS = ["ready", "queued", "building", "review", "done"] as const;
const SPEC_STATUS = ["draft", "exploring", "evidence-backed", "owner-approved", "engineer-reviewed", "ready-prototype", "ready-pilot", "production-ready"] as const;
const LINK_KINDS = ["depends_on", "split_from", "related"] as const;

type Tool = { title: string; description: string; need: Level; input: z.ZodObject<z.ZodRawShape> };
const tool = <T extends Tool>(t: T) => t;

export const TOOLS = {
  // ---- Look ----
  my_access: tool({
    title: "What may I do?",
    description: "Who this access acts as, its role and level, which customer it covers, and the tools it may use. Call this first if unsure.",
    need: "read",
    input: z.object({}),
  }),
  list_use_cases: tool({
    title: "List use cases",
    description: "The use cases this access can see, by customer, with what is waiting on people in each. Start here to find a use case's id. Archived use cases are left out unless include_archived is true.",
    need: "read",
    input: z.object({ customer: z.string().max(120).optional().describe("Only this customer's use cases."), include_archived: z.boolean().optional() }),
  }),
  open_use_case: tool({
    title: "Open a use case",
    description: "Everything about one use case in one call: its facts, the link that opens it in the Studio, people, decisions and checkpoints with ids, held thoughts, Board cards with ids, documents, spec versions, build and preview status.",
    need: "read",
    input: z.object({ use_case_id: id }),
  }),
  whats_waiting: tool({
    title: "What's waiting on me",
    description: "Open decisions and checkpoints, cards waiting for human review, Socra's unanswered questions (the latest one, and every question about a backlog item or Board card, under item_questions, with the item_id and question_id to answer it), and builds running, across the use cases this access can see (or one).",
    need: "read",
    input: z.object({ use_case_id: id.optional() }),
  }),
  brief: tool({
    title: "Brief me",
    description: "Where a use case stands: what it is, what was decided, what is open, held thoughts, the board, the last build and the latest conversation.",
    need: "read",
    input: z.object({ use_case_id: id }),
  }),
  item_trace: tool({
    title: "An item's Traceability",
    description: "Everything that happened to one backlog item or Board card: what was said, the specialist sent, the skills loaded and used, Socra's questions, the answers, and every move with who and why. Also its open question, if any.",
    need: "read",
    input: z.object({ use_case_id: id, item_id: z.string().describe('The item, as "backlog:<id>" or "move:<id>" (or a bare id).') }),
  }),
  why_changed: tool({
    title: "Why did this change?",
    description: "The explained change timeline from the Product Truth Graph: what changed, who changed it, and the chain of causes. Filter by a node id (decision:…, backlog:…, move:…, spec:prd-…) or words.",
    need: "read",
    input: z.object({ use_case_id: id, about: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }),
  }),
  read_spec: tool({
    title: "Read part of a use case",
    description:
      "Read one part of a use case: prd, trd, prfaq, backlog, board, story_map (stories and links), truth_graph (nodes, edges, confidence), decisions (all, with status), members, documents, evidence, spec_versions, or conversation (the full message history, newest last; use limit).",
    need: "read",
    input: z.object({
      use_case_id: id,
      part: z.enum(["prd", "trd", "prfaq", "backlog", "board", "story_map", "truth_graph", "decisions", "members", "documents", "evidence", "spec_versions", "conversation"]),
      limit: z.number().int().min(1).max(500).optional().describe("For conversation: how many of the latest messages (default 50)."),
    }),
  }),
  read_card: tool({
    title: "Read a Board card",
    description: "One Board card in full: what it builds, its column, who moved it and why, its history and its attached files.",
    need: "read",
    input: z.object({ use_case_id: id, card_id: id }),
  }),
  agent_status: tool({
    title: "Agent status",
    description: "The product's agents (with their Letta persona), their recent runs, and approvals waiting for a person.",
    need: "read",
    input: z.object({ use_case_id: id }),
  }),

  // ---- Change ----
  capture: tool({
    title: "Add to the backlog",
    description: "Add a requirement, idea or need to the use case's backlog in the person's own words. Use this whenever the person asks to add to or create a backlog, or describes something the product should do: call it once per separate need, never as one Board card. Socra has the right specialist look at it and asks what is missing; nothing becomes a requirement silently. The call waits for Socra's questions and returns them (questions, with item_id and question_id): put them to the person right away and send their reply with answer (item_id, question_id).",
    need: "write",
    input: z.object({ use_case_id: id, text: z.string().trim().min(1).max(4000), wait_seconds: z.number().int().min(0).max(110).optional().describe("How long to wait for Socra's questions before answering (default 50 seconds; 0 answers at once).") }),
  }),
  add_evidence: tool({
    title: "Add evidence",
    description: "Record what real use showed (an observation, a metric, an interview note, or something that felt wrong). Socra feeds it back into the PRD and TRD.",
    need: "write",
    input: z.object({ use_case_id: id, kind: z.enum(["observation", "metric", "interview", "felt-wrong"]).optional(), text: z.string().trim().min(2).max(8000) }),
  }),
  start_use_case: tool({
    title: "Start a use case",
    description: "Start a new use case from the person's words. Socra opens it with one question.",
    need: "write",
    input: z.object({
      customer: z.string().trim().max(120).optional(),
      name: z.string().trim().max(120).optional(),
      business_area: z.string().trim().max(120).optional(),
      summary: z.string().trim().max(2000).optional(),
      description: z.string().max(20000).describe("The idea in the person's own words."),
    }),
  }),
  update_use_case: tool({
    title: "Rename or edit a use case",
    description: "Change a use case's name, customer, business area, short description, PR/FAQ, lens (owner or engineer), the capability Socra focuses on, or its Git and Linear settings. Only the fields sent change.",
    need: "write",
    input: z.object({
      use_case_id: id,
      name: z.string().trim().min(1).max(120).optional(),
      customer: z.string().trim().max(120).optional(),
      business_area: z.string().trim().max(120).optional(),
      summary: z.string().max(2000).optional(),
      prfaq: z.string().max(200000).optional().describe("The whole PR/FAQ in Markdown; replaces the current one."),
      lens: z.enum(["owner", "engineer"]).optional(),
      focus: z.string().max(80).optional(),
      repo_url: z.string().max(500).optional(),
      git_branch: z.string().trim().min(1).max(120).regex(/^[\w./-]+$/).optional(),
      linear_team: z.string().max(120).optional(),
    }),
  }),
  answer: tool({
    title: "Answer Socra",
    description: "Say something to Socra in the person's name: an answer, a new thought, or a number from Socra's numbered options. Address a specialist with `to`. A bare yes or a number approves what Socra proposed, so it needs confirm. The call waits for Socra's reply and returns it, with any new questions: put them to the person right away.",
    need: "write",
    input: z.object({
      use_case_id: id,
      text: z.string().trim().min(1).max(20000),
      to: z.string().max(40).optional().describe("A specialist's key to address directly (ba, architect, engineer, ux, domain)."),
      item_id: z.string().max(60).optional().describe('When answering a question about a backlog item or card: its item_id from whats_waiting ("backlog:<id>" or "move:<id>"). The answer goes onto that item.'),
      question_id: z.string().max(40).optional().describe("The question_id being answered, so a number picks from that question's options."),
      wait_seconds: z.number().int().min(0).max(110).optional().describe("How long to wait for Socra's questions before answering (default 50 seconds; 0 answers at once)."),
      confirm,
    }),
  }),
  decide: tool({
    title: "Approve or reject",
    description: "Approve or reject an open decision or human-in-the-loop checkpoint, with an optional comment. Without confirm it shows what the decision touches.",
    need: "write",
    input: z.object({ use_case_id: id, decision_id: id, decision: z.enum(["approve", "reject"]), comment: z.string().max(4000).optional(), confirm }),
  }),
  change_item: tool({
    title: "Change an earlier choice",
    description:
      "Change a backlog item or decision. edit: new wording for a held thought. withdraw: take a thought out (kept in history). set_kind: capture, epic or distraction. pull_recommendation: pull a recommendation into the plan. include_in_build / exclude_from_build: a thought or decision in or out of the next build. edit_decision: new wording for a decision. reopen_decision: open an approved or rejected decision again. undo_approval: undo a yes that approved a decision. send_back_card: send a Board card back to Ready to shape. Withdraw, reopen, undo and send back need confirm.",
    need: "write",
    input: z.object({
      use_case_id: id,
      action: z.enum(["edit", "withdraw", "set_kind", "pull_recommendation", "include_in_build", "exclude_from_build", "edit_decision", "reopen_decision", "undo_approval", "send_back_card"]),
      item_id: id.describe("The backlog item, decision or card id."),
      text: z.string().trim().min(2).max(2000).optional().describe("For edit and edit_decision: the new wording."),
      kind: z.enum(["capture", "epic", "distraction"]).optional().describe("For set_kind."),
      why: z.string().max(400).optional(),
      confirm,
    }),
  }),
  board_card: tool({
    title: "Add, edit or move a Board card",
    description:
      "Work the Board. Only when the person asks for a Board card by name: a new requirement or a backlog goes in with capture instead. create: a new card (title, optional details and column). edit: change a card's title, capability, decision, build prompt or owner. move: move it to another column (ready = Ready to shape, the first column; queued = Backlog; building = Being made real, review = Human review, done = Done) with a reason; moving to done needs confirm. Create and move wait for Socra's questions about the card and return them: put them to the person right away. attach: attach a small file (text, or base64) as evidence on the card.",
    need: "write",
    input: z.object({
      use_case_id: id,
      action: z.enum(["create", "edit", "move", "attach"]),
      card_id: id.optional().describe("Needed for edit, move and attach."),
      title: z.string().trim().min(1).max(200).optional(),
      capability: z.string().max(120).optional(),
      decision: z.string().max(600).optional(),
      prompt: z.string().max(8000).optional().describe("What Claude Code should build for this card."),
      owner: z.string().max(80).optional(),
      column: z.enum(BOARD_COLUMNS).optional(),
      why: z.string().max(400).optional(),
      file_name: z.string().trim().min(1).max(120).optional(),
      file_text: z.string().max(600000).optional().describe("For attach: the file's text."),
      wait_seconds: z.number().int().min(0).max(110).optional().describe("How long to wait for Socra's questions before answering (default 50 seconds; 0 answers at once)."),
      file_base64: z.string().max(800000).optional().describe("For attach: the file's bytes in base64 (up to about 600 KB)."),
      confirm,
    }),
  }),
  review_spec: tool({
    title: "Review or edit a spec section",
    description: "Act on one PRD or TRD section (key from read_spec, e.g. prd-problem): review it (keep, revise, challenge, remove) with a note, rewrite its content, or set its status. Remove needs confirm.",
    need: "write",
    input: z.object({
      use_case_id: id,
      section: z.string().trim().min(3).max(60).describe("The section key, e.g. prd-problem or trd-risks."),
      review: z.enum(["keep", "revise", "challenge", "remove"]).optional(),
      note: z.string().max(4000).optional(),
      content: z.string().max(40000).optional().describe("New text for the section (Markdown)."),
      status: z.enum(SPEC_STATUS).optional(),
      confirm,
    }),
  }),
  restore_spec: tool({
    title: "Restore an earlier spec version",
    description: "Put the PRD and TRD back to an earlier saved version (see read_spec part spec_versions). The current version is kept in history. Needs confirm.",
    need: "write",
    input: z.object({ use_case_id: id, version: z.number().int().min(1), confirm }),
  }),
  story_map: tool({
    title: "Link stories on the Story map",
    description: "connect: link two stories (from, to: ids from read_spec story_map) as depends_on, split_from or related. accept or dismiss a suggested link, remove a link (needs confirm), or suggest: ask Socra to propose links.",
    need: "write",
    input: z.object({
      use_case_id: id,
      action: z.enum(["connect", "accept", "dismiss", "remove", "suggest"]),
      from: z.string().min(3).max(60).optional(),
      to: z.string().min(3).max(60).optional(),
      kind: z.enum(LINK_KINDS).optional(),
      link_id: z.string().min(3).max(60).optional(),
      confirm,
    }),
  }),
  people: tool({
    title: "Add or remove people",
    description: "Add a person to a use case with a role (or change their role), or remove them (needs confirm). Socra answers each person at their level.",
    need: "write",
    input: z.object({ use_case_id: id, action: z.enum(["add", "remove"]), name: z.string().trim().min(1).max(80).optional(), role: z.string().trim().min(2).max(60).optional(), member_id: z.string().max(40).optional(), confirm }),
  }),
  agent_control: tool({
    title: "Run the product's agents",
    description: "Switch one of the product's agents on or off, or its Letta persona on or off; or approve or reject an approval an agent is waiting on (needs confirm). Agent keys and approval ids come from agent_status.",
    need: "write",
    input: z.object({
      use_case_id: id,
      action: z.enum(["switch", "approve", "reject"]),
      agent_key: z.string().max(60).optional(),
      on: z.boolean().optional(),
      persona: z.boolean().optional(),
      approval_id: z.string().max(80).optional(),
      comment: z.string().max(2000).optional(),
      confirm,
    }),
  }),
  build: tool({
    title: "Build the next version",
    description: "Have Claude Code build the next version from the approved requirements (or redesign the look, or start fresh). Without confirm it shows what the build would include.",
    need: "write",
    input: z.object({ use_case_id: id, mode: z.enum(["next", "redesign", "fresh"]).optional(), confirm }),
  }),
  preview: tool({
    title: "Start the preview",
    description: "Start (or restart) the live preview of the latest build and say where it runs.",
    need: "write",
    input: z.object({ use_case_id: id }),
  }),
  mark_up: tool({
    title: "Mark up the preview",
    description: "Give feedback on the built app, as if marking it up on screen: what should feel different, on which page and element. Socra sorts it into a new requirement, a change or a bug.",
    need: "write",
    input: z.object({ use_case_id: id, comment: z.string().trim().min(1).max(20000), page: z.string().max(2000).optional(), element: z.string().max(400).optional() }),
  }),
  retry_socra: tool({
    title: "Nudge Socra",
    description: "Run Socra's last turn again when it looks stuck or failed.",
    need: "write",
    input: z.object({ use_case_id: id }),
  }),
  sync: tool({
    title: "Push to Git or Linear",
    description: "Push the use case's code to its Git repository, or its cards to its Linear team. This leaves the Studio, so it needs confirm.",
    need: "write",
    input: z.object({ use_case_id: id, to: z.enum(["git", "linear"]), confirm }),
  }),

  // ---- Admin ----
  archive_use_case: tool({
    title: "Archive or restore a use case",
    description: "Archive a use case (hidden from the home list, nothing is lost, can be restored) or restore an archived one. Archiving needs confirm. Admin only.",
    need: "admin",
    input: z.object({ use_case_id: id, action: z.enum(["archive", "restore"]), confirm }),
  }),
  delete_use_case: tool({
    title: "Delete a use case for good",
    description:
      "Permanently delete a use case and everything in it (conversation, spec, Board, documents, history). This cannot be undone; archive_use_case is the safe choice. Without confirm it shows what would be lost. To delete, send confirm: true and confirm_name equal to the use case's exact name. Admin only.",
    need: "admin",
    input: z.object({ use_case_id: id, confirm, confirm_name: z.string().max(120).optional().describe("The use case's exact name, typed back.") }),
  }),
  call_log: tool({
    title: "Connector call log",
    description: "The latest calls made through the connector and API: who, which tool, which use case, and how it ended. Admin only.",
    need: "admin",
    input: z.object({ limit: z.number().int().min(1).max(200).optional() }),
  }),
} as const;

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];
/** True when a tool changes something (anything above look). */
export const isWrite = (t: ToolName) => TOOLS[t].need !== "read";

/** Actions that show a preview first and run only with confirm: true. */
export function needsConfirm(tool: ToolName, input: Record<string, unknown>, isApproval: (text: string) => boolean): boolean {
  if (tool === "delete_use_case") return !(input.confirm === true && typeof input.confirm_name === "string" && input.confirm_name.trim().length > 0);
  if (input.confirm === true) return false;
  switch (tool) {
    case "decide":
    case "build":
    case "restore_spec":
    case "sync":
      return true;
    case "change_item":
      return ["withdraw", "reopen_decision", "undo_approval", "send_back_card"].includes(String(input.action));
    case "answer":
      return isApproval(String(input.text ?? ""));
    case "board_card":
      return input.action === "move" && input.column === "done";
    case "review_spec":
      return input.review === "remove";
    case "story_map":
      return input.action === "remove";
    case "people":
      return input.action === "remove";
    case "agent_control":
      return input.action !== "switch";
    case "archive_use_case":
      return input.action === "archive";
    default:
      return false;
  }
}

export type Gate = { ok: true } | { ok: false; outcome: "denied"; error: string };

/** Who may call what: the lower of the token's level and its role's maximum must reach the tool's need. */
export function gate(tool: ToolName, access: { scope: string; role: string }): Gate {
  const need = TOOLS[tool].need;
  const have = effectiveLevel(access);
  if (rank(have) >= rank(need)) return { ok: true };
  if (need === "admin") return { ok: false, outcome: "denied", error: `Only admin access can do this. This access is “${LEVEL_LABEL[have]}” as ${access.role || "no role"}. The Studio's owner can change it on Settings > Connect.` };
  if (roleMax(access.role) === "read") return { ok: false, outcome: "denied", error: `A ${access.role} can look but not change anything.` };
  return { ok: false, outcome: "denied", error: "This access is read-only. Ask the Studio's owner for write access on Settings > Connect." };
}

/** A use case is visible when the access is for every customer or for its customer. */
export const inScope = (accessCustomer: string, useCaseCustomer: string) =>
  !accessCustomer || accessCustomer.trim().toLowerCase() === useCaseCustomer.trim().toLowerCase();

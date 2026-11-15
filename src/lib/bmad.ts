// BMAD v7 vocabulary used across the accelerator.
// Source: https://docs.bmad-method.org (skills and agents, ticket tree, planning paths).

export type StageKey = "clarify" | "plan" | "build" | "learn";

export const STAGES: {
  key: StageKey;
  label: string;
  docs: { key: string; label: string }[];
  gates: string[];
}[] = [
  {
    key: "clarify",
    label: "Clarify",
    docs: [
      { key: "intake", label: "Use-case brief" },
      { key: "brief", label: "Product brief" },
      { key: "prfaq", label: "PRFAQ" },
      { key: "research", label: "Research" },
    ],
    gates: ["PRFAQ verdict"],
  },
  {
    key: "plan",
    label: "Plan",
    docs: [
      { key: "prd", label: "PRD" },
      { key: "ux", label: "UX (DESIGN + EXPERIENCE)" },
      { key: "architecture", label: "Architecture spine" },
      { key: "tickets", label: "Epics and stories" },
    ],
    gates: ["PRD validation", "Architecture review", "Ticket breakdown approval"],
  },
  {
    key: "build",
    label: "Build and verify",
    docs: [
      { key: "plans", label: "Story plans" },
      { key: "tests", label: "Tests" },
    ],
    gates: [],
  },
  {
    key: "learn",
    label: "Learn and adjust",
    docs: [
      { key: "retro", label: "Retrospective" },
      { key: "readiness", label: "Production readiness (TEA)" },
    ],
    gates: ["Retrospective verdict"],
  },
];

export type AgentKey =
  | "concierge"
  | "analyst"
  | "pm"
  | "po"
  | "architect"
  | "ux"
  | "dev"
  | "bmad"
  | "generator";

// Where an upload belongs: anywhere (general) or one BMAD stage.
export const DOC_STAGES: { key: string; label: string }[] = [
  { key: "general", label: "General (any stage)" },
  { key: "clarify", label: "Stage 1: Clarify" },
  { key: "plan", label: "Stage 2: Plan" },
  { key: "build", label: "Stage 3: Build and verify" },
  { key: "learn", label: "Stage 4: Learn and adjust" },
];

// The BMAD agents a document can be routed to.
export const ROUTABLE_AGENTS = ["analyst", "pm", "ux", "architect", "po", "dev"] as const;
export type Routing = { agent: string; why: string }[];

export const AGENTS: Record<
  AgentKey,
  { name: string; role: string; skill: string; stage: StageKey; color: string }
> = {
  concierge: { name: "Concierge", role: "Your guide", skill: "bacc-agent-concierge", stage: "clarify", color: "#7c5cff" },
  analyst: { name: "Mary", role: "Analyst", skill: "bmad-agent-analyst", stage: "clarify", color: "#22c3a6" },
  pm: { name: "John", role: "Product Manager", skill: "bmad-agent-pm", stage: "plan", color: "#3d8bff" },
  po: { name: "Sofia", role: "Product Owner", skill: "bmad-agent-po", stage: "plan", color: "#f59e0b" },
  architect: { name: "Winston", role: "Architect", skill: "bmad-agent-architect", stage: "plan", color: "#ef6aa1" },
  ux: { name: "Sally", role: "UX Designer", skill: "bmad-agent-ux-designer", stage: "plan", color: "#a3e635" },
  dev: { name: "Amelia", role: "Developer", skill: "bmad-agent-dev", stage: "build", color: "#38bdf8" },
  bmad: { name: "BMad", role: "Method guide", skill: "bmad", stage: "clarify", color: "#94a3b8" },
  generator: { name: "Generate", role: "Claude Code builder", skill: "claude-code", stage: "build", color: "#f97316" },
};

// "Bring the documents you have": each upload is tagged with a BMAD type and
// routed to the agent that uses it.
export const BMAD_DOC_TYPES: {
  key: string;
  label: string;
  routesTo: string;
  hint: string;
}[] = [
  { key: "prd", label: "Existing PRD", routesTo: "John (validate)", hint: "prd, requirements, product requirements" },
  { key: "businesscase", label: "Business case", routesTo: "Mary, John", hint: "business case, business-case, businesscase, proposal, investment" },
  { key: "brief", label: "Brief or BRD", routesTo: "Mary", hint: "brief, business requirements, brd, charter" },
  { key: "research", label: "Research report", routesTo: "Deep Recon (process)", hint: "research, market, competitor, survey, analysis" },
  { key: "design", label: "Design system or brand", routesTo: "bmad-ux", hint: "design, brand, style, figma, ui, mock" },
  { key: "architecture", label: "Architecture doc", routesTo: "bmad-architecture", hint: "architecture, technical, system, diagram, api" },
  { key: "notes", label: "Meeting notes or transcript", routesTo: "bmad-ingest", hint: "notes, meeting, transcript, minutes" },
  { key: "tickets", label: "Tickets or backlog export", routesTo: "Sofia", hint: "backlog, jira, tickets, stories, epics" },
  { key: "policy", label: "Policies and standards", routesTo: "Project context", hint: "policy, compliance, standard, security, guideline" },
  { key: "other", label: "Other", routesTo: "Concierge", hint: "" },
];

export function guessDocType(fileName: string): string {
  const n = fileName.toLowerCase();
  for (const t of BMAD_DOC_TYPES) {
    if (!t.hint) continue;
    if (t.hint.split(",").some((h) => n.includes(h.trim()))) return t.key;
  }
  if (/\.(pptx?|key)$/.test(n)) return "brief";
  if (/\.(xlsx?|csv)$/.test(n)) return "research";
  if (/\.(png|jpe?g|fig|sketch)$/.test(n)) return "design";
  return "other";
}

// Kanban columns map to BMAD ticket statuses. "built" is shown as Review;
// only the user moves work to Done.
export const KANBAN_COLUMNS: { key: string; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "in_progress", label: "In progress" },
  { key: "built", label: "Review" },
  { key: "done", label: "Done" },
];

export const REVIEW_KINDS: Record<string, string> = {
  document: "Document summary",
  assumption: "Assumption",
  question: "Open question",
  unknown: "Ticket question",
  context: "Project context",
  breakdown: "Ticket breakdown",
  plan: "Build plan",
  architecture: "Architecture choice",
  tests: "Test scenarios",
  done: "Mark done",
  gate: "Sign-off",
  move: "Card moved",
};

export const GLOSSARY: Record<string, string> = {
  Epic: "A big feature. Stories are the pieces of it.",
  Story: "One small, buildable piece of an epic.",
  Spike: "A short investigation to answer a question before building.",
  PRD: "Product requirements document: what we are building and why.",
  "Acceptance criteria": "The checks that prove a story works.",
};

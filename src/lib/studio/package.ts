// Assembles the Claude Code package: product truth plus implementation guardrails, to the design
// team's contract (agentic-working-backwards-studio skill, references/package-contract.md).
// Pure: no database or files, so it is tested directly (tests/package.test.mjs).

import { specMarkdown } from "./spec.ts";

export const PACKAGE_FILES = [
  "README.md",
  "PRFAQ.md",
  "VALIDATED_USE_CASE.md",
  "PRD.md",
  "TRD.md",
  "SPEC_TRACE.json",
  "TRUTH_GRAPH.json",
  "VIBE_LOOP.json",
  "SPEC_DIFF.md",
  "TECHNICAL_REQUIREMENTS.md",
  "COMPONENT_MAP.json",
  "AGENT_KIT_ROUTING.json",
  "AGENTS.json",
  "KANBAN.json",
  "EVIDENCE.json",
  "VISUAL_ANNOTATIONS.json",
  "CONVERSATION.json",
  "BACKLOG.json",
  "PACKAGE_MANIFEST.json",
  "CLAUDE_CODE_PROMPT.md",
] as const;

export type PackageInput = {
  iteration: number;
  productName: string;
  statement: string;
  category: string;
  audience: string;
  customerQuote: string;
  useCase: string;
  readiness: number;
  validationScore: number;
  repositoryUrl: string;
  gitBranch: string;
  prfaq: string;
  capabilities: { key: string; label: string; readiness: number; description: string; items: { id: string; text: string; state: string }[] }[];
  decisions: { id: string; text: string; status: string; capability: string; words: string; agent: string; answer: string }[];
  backlog: { id: string; title: string; note: string; kind: string; group: string; source: string; recKind: string; state: string; hidden: string; includeInBuild: boolean }[];
  evidence: { source: string; type: string; insight: string; confidence: string; trace: string }[];
  moves: { id: string; title: string; capability: string; decision: string; status: string; owner: string; hidden: string; components: string[]; routes: string[]; prompt: string }[];
  routes: { agent: string; action: string; state: string; detail: string }[];
  // The approved agents, as the shared agent service's configuration (and its self-host file).
  agents: { useCase: string; customer: string; name: string; agents: unknown[] };
  messages: { role: string; agent: string; content: string; createdAt: string }[];
  annotations: { target: string; note: string; shape: string; frame?: string; frameFile?: string }[];
  components: string[];
  technicalNotes: string[];
  spec: { key: string; ref: string; tab: string; title: string; content: string; completeness: number; confidence: string; basis: string; status: string; review: string; capability: string; related: string[]; trace: { label: string; detail: string; type: string }[] }[];
  specVersion: number;
  specDiff: string;
  /** The Product Truth Graph of this product: the team's schema with real nodes and edges only. */
  truthGraph: { schema: unknown; nodes: { id: string }[]; edges: { id: string; from: string; to: string }[] };
  /** Each mark on the prototype and how far it has gone round the loop (select, describe, interpret, shape, regenerate). */
  vibeLoop: { annotation: string; target: string; shape: string; stage: string; observation: string; behaviour: string; acceptance: string[]; component: string; changes: string[]; question: string }[];
  /** What each specialist asked (its skill's areas) and what the people answered or let it assume. */
  coverage?: { name: string; areas: { label: string; status: string; note: string }[] }[];
};

/** The team's questions in the PRD: answered areas are requirements in the people's words; assumed ones carry their default. */
function coverageMarkdown(input: PackageInput) {
  const team = (input.coverage ?? []).filter((c) => c.areas.some((a) => a.note || a.status !== "open"));
  if (!team.length) return "";
  const line = (a: { label: string; status: string; note: string }) => `- **${a.label}** (${a.status === "covered" ? "answered" : a.status === "partly" ? "partly answered" : a.status === "assumed" ? "assumed, default below" : "still open: use what the leading products do"})${a.note ? `: ${a.note}` : ""}`;
  return `\n## What the team asked, and what was answered or assumed\n\n${team.map((c) => `### ${c.name}\n${c.areas.map(line).join("\n")}`).join("\n\n")}\n`;
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

function floorMarkdown(input: PackageInput) {
  return input.capabilities
    .map((c) => {
      const items = c.items.map((i) => `- ${i.id} [${i.state}] ${i.text}`).join("\n");
      return `### ${c.label} (${c.readiness}% ready)\n${c.description ? `${c.description}\n` : ""}${items || "- (no floor items yet)"}`;
    })
    .join("\n\n");
}

export function firstMove(input: PackageInput) {
  return (
    input.moves.find((m) => m.status === "building")?.title ??
    input.moves.find((m) => m.status === "ready")?.title ??
    "Build the complete product the capability floor describes, starting with the highest-confidence customer moment."
  );
}

export function assemblePackage(input: PackageInput): Record<(typeof PACKAGE_FILES)[number], string> {
  const open = input.decisions.filter((d) => d.status === "open");
  const approved = input.decisions.filter((d) => d.status === "approved");
  const assumed = input.decisions.filter((d) => d.status === "assumed");
  const workflows = input.backlog.filter((b) => b.recKind === "workflow" && b.state !== "suggested");
  const manifest = {
    packageVersion: "1.0.0",
    iteration: input.iteration,
    generatedFor: input.productName,
    generatedAt: new Date().toISOString(),
    target: "claude-code",
    repositoryUrl: input.repositoryUrl || "not-connected",
    gitBranch: input.gitBranch,
    sourceOfTruth: ["PRFAQ.md", "VALIDATED_USE_CASE.md", "PRD.md", "TRD.md", "SPEC_TRACE.json", "TRUTH_GRAPH.json", "VIBE_LOOP.json", "TECHNICAL_REQUIREMENTS.md", "KANBAN.json"],
    specVersion: input.specVersion,
    agentKit: {
      router: "@inngest/agent-kit",
      workflows: workflows.map((w) => w.title),
      humanInTheLoop: open.map((d) => d.text),
    },
    uiBaseline: ["shadcn/ui", ...input.components],
    files: [...PACKAGE_FILES],
  };

  const prfaq =
    input.prfaq.trim() ||
    `# ${input.productName}\n\n${input.statement}\n\n## Customer promise\n${input.customerQuote || "(not written yet)"}\n`;

  const technical = `# Technical requirements

Iteration ${input.iteration}. ${input.productName}${input.category ? `, ${input.category}` : ""}.

## Baseline
- UI: shadcn/ui on React, Vite and Tailwind CSS, Google web fonts, themed for this product.
- Agents: @inngest/agent-kit for every agentic workflow (agents, tools, networks, routers, state, human in the loop). Fixed if-then rules stay plain code.
- Runs with no accounts or paid services: \`npm install\`, \`npm run build\`, \`npm start\` on \`process.env.PORT\`; SQLite or files for data.

## Capability floor (the minimum, never the ceiling)
Build every [confirmed] and [assumed] item; never an [out] one.

${floorMarkdown(input) || "No capabilities yet: build the complete product a leading company in this category ships."}

## Approved decisions
${approved.map((d) => `- ${d.text}${d.words ? ` (owner: "${d.words}")` : ""}`).join("\n") || "- none yet"}

## Assumptions to confirm
${assumed.map((d) => `- ${d.text}`).join("\n") || "- none"}

## Open human decisions (keep explicit and reversible)
${open.map((d) => `- ${d.text}${d.answer ? ` → answered: ${d.answer}` : ""}`).join("\n") || "- none"}
${input.technicalNotes.length ? `\n## Product engineer notes\n${input.technicalNotes.map((n) => `- ${n}`).join("\n")}\n` : ""}`;

  const useCase = `# Validated use case

## Use case
${input.useCase || input.statement || "(not validated yet)"}

## Product promise
${input.statement}

## Audience
${input.audience || "(not named yet)"}

## Readiness
${input.validationScore}% use-case confidence; ${input.readiness}% overall product readiness. This is a recommendation, not a gate.

## Evidence
${input.evidence.map((e) => `- ${e.insight} (${e.source}, ${e.confidence})`).join("\n") || "- none yet"}

## Open questions
${open.map((d) => `- ${d.text}`).join("\n") || "- What is the smallest customer-visible proof of value?\n- Which decision should remain human-controlled in the first pilot?"}
`;

  const prompt = `# Claude Code execution prompt

You are the implementation agent for ${input.productName}. Build the thinnest production-minded pilot that proves the validated use case: a thin slice on a complete professional floor. The floor is in scope: the capability floor in TECHNICAL_REQUIREMENTS.md, the PRD and TRD sections, and what the leading products in this category all have. It is the minimum, never the ceiling. Do not invent product scope beyond the files in this package and that floor. Silence never removes anything; only an [out] item or an explicit "no" from the owner does.

## Guardrails
- Preserve the customer language from PRFAQ.md.
- Build what PRD.md and TRD.md say. Confirmed and Recommended sections are requirements; Inferred ones are your starting point unless the owner removed them; Open decisions stay visible and reversible in the app; Not-yet-researched sections fall back to what the leading products in this category do. Every requirement traces through SPEC_TRACE.json (the PRD and TRD section refs) to the conversation and evidence it came from. PRD.md ends with what the team asked and what the people answered: build answered areas exactly as answered, in their words, and assumed areas with the stated default, visibly changeable. Before seeding data, read .claude/skills/studio-sample-data/SKILL.md (realistic volumes, every state and exception, no real people); automate the acceptance tests marked automated per .claude/skills/studio-acceptance-tests/SKILL.md; show the pilot's main measure where studio-pilot-metrics says.
- Use the selected shadcn/ui baseline (COMPONENT_MAP.json) for the interface.
- Use the Agent Kit route definitions (AGENT_KIT_ROUTING.json) as the prototype orchestration baseline. The approved agents run in the Studio's shared agent service (AGENTS.json: AgentKit, each with a Letta persona and Mem0 memory); the app calls them, it does not host them.
- Keep human-in-the-loop decisions explicit and reversible.
- Trace every implemented story to a capability in KANBAN.json.
- Prefer a working vertical slice over broad scaffolding: every screen you add works end to end.
- Build in every visual annotation in VISUAL_ANNOTATIONS.json and every backlog item marked includeInBuild in BACKLOG.json.

## First move
${firstMove(input)}
`;

  const readme = `# ${input.productName} — Claude Code Prototype Package

Assembled by the Agentic Working Backwards Studio (iteration ${input.iteration}). It keeps product intent, evidence, decisions, technical interpretation and traceable execution together so Claude Code can build the pilot without losing the why.

## Start here
1. Read PRFAQ.md, VALIDATED_USE_CASE.md, and PRD.md.
2. Review TRD.md, SPEC_TRACE.json, TECHNICAL_REQUIREMENTS.md, and COMPONENT_MAP.json. SPEC_DIFF.md says what changed since the last version.
3. Inspect KANBAN.json for the build lanes.
4. Run the prompt in CLAUDE_CODE_PROMPT.md.

Repository: ${input.repositoryUrl || "Connect a repository on the Studio's Connections view before pushing."}
`;

  return {
    "README.md": readme,
    "PRFAQ.md": prfaq.endsWith("\n") ? prfaq : prfaq + "\n",
    "VALIDATED_USE_CASE.md": useCase,
    "PRD.md": specMarkdown(input.spec, "prd", input.productName) + coverageMarkdown(input),
    "TRD.md": specMarkdown(input.spec, "trd", input.productName),
    // Provenance edges in the design team's exact shape: { section, label, detail, type }. Only edges of
    // real events are stored (see lib/studio/trace.ts), so nothing seeded ever reaches an export.
    "SPEC_TRACE.json": json(
      input.spec
        .filter((s) => s.review !== "remove")
        .flatMap((s) => s.trace.map((t) => ({ section: s.title, label: t.label, detail: t.detail, type: t.type }))),
    ),
    // The Product Truth Graph: one node per real record, edges only from explicit links and logged causes.
    "TRUTH_GRAPH.json": json(input.truthGraph),
    "VIBE_LOOP.json": json(input.vibeLoop),
    "SPEC_DIFF.md": `# Specification changes (version ${input.specVersion})\n\n${input.specDiff || "- First version of the specification."}\n`,
    "TECHNICAL_REQUIREMENTS.md": technical,
    "COMPONENT_MAP.json": json({ baseline: "shadcn/ui", components: input.components, rationale: "Mapped from the conversation, the capabilities and the validated use case by the UX / Component Mapper." }),
    "AGENT_KIT_ROUTING.json": json({
      framework: "@inngest/agent-kit",
      workflows: workflows.map((w) => ({ title: w.title, why: w.note, capability: w.group })),
      humanInTheLoop: open.map((d) => d.text),
      studioRoutes: input.routes,
    }),
    "AGENTS.json": json({
      ...input.agents,
      service: "Working Backwards Studio shared agent service (agent-service/): Inngest AgentKit, Letta persona, Mem0 memory",
      selfHost: "Run agent-service/ with AGENTS_FILE pointing at this file, AGENT_SERVICE_TOKEN set to the app's token and APP_CALLBACK_URL set to the app; the app keeps AGENT_SERVICE_URL and AGENT_SERVICE_TOKEN.",
    }),
    "KANBAN.json": json(
      input.moves.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        capability: m.capability,
        decision: m.decision,
        owner: m.owner,
        type: m.hidden,
        shadcnComponents: m.components,
        agentKitRoutes: m.routes,
        claudeCodePrompt: m.prompt,
      })),
    ),
    "EVIDENCE.json": json(input.evidence),
    "VISUAL_ANNOTATIONS.json": json(
      input.annotations.map((a) => ({
        target: a.target || "unselected surface",
        note: a.note,
        shape: a.shape,
        ...(a.frame ? { frame: a.frame } : {}),
        ...(a.frameFile ? { frameFile: a.frameFile } : {}),
      })),
    ),
    "CONVERSATION.json": json(input.messages),
    "BACKLOG.json": json(input.backlog),
    "PACKAGE_MANIFEST.json": json(manifest),
    "CLAUDE_CODE_PROMPT.md": prompt,
  };
}

/** The design team's package checks (scripts/inspect_package.py), as a function. */
export const PROMPT_PHRASES = ["thinnest production-minded pilot", "PRFAQ.md", "shadcn/ui", "Agent Kit", "human-in-the-loop", "KANBAN.json", "working vertical slice"];

export function inspectPackage(files: Record<string, string>) {
  const missing = PACKAGE_FILES.filter((f) => !(f in files));
  const prompt = files["CLAUDE_CODE_PROMPT.md"] ?? "";
  const promptMissing = PROMPT_PHRASES.filter((p) => !prompt.includes(p));
  const annotationErrors: string[] = [];
  let annotations: unknown[] = [];
  try {
    annotations = JSON.parse(files["VISUAL_ANNOTATIONS.json"] ?? "[]");
  } catch {
    annotationErrors.push("VISUAL_ANNOTATIONS.json is not JSON");
  }
  annotations.forEach((a, i) => {
    if (!a || typeof a !== "object") return annotationErrors.push(`${i}: not an object`);
    const o = a as Record<string, unknown>;
    for (const f of ["target", "note", "shape"]) if (!o[f]) annotationErrors.push(`${i}: missing ${f}`);
    if (!["object", "circle", "full-screen"].includes(String(o.shape))) annotationErrors.push(`${i}: invalid shape ${String(o.shape)}`);
  });
  // Session-scoped provenance: the team's edge shape, and annotation edges exactly when an annotation exists.
  const traceErrors: string[] = [];
  let trace: unknown[] = [];
  try {
    const t = JSON.parse(files["SPEC_TRACE.json"] ?? "[]");
    if (Array.isArray(t)) trace = t;
    else traceErrors.push("SPEC_TRACE.json is not an array");
  } catch {
    traceErrors.push("SPEC_TRACE.json is not JSON");
  }
  const types = ["conversation", "evidence", "annotation", "inference", "backlog", "execution"];
  trace.forEach((e, i) => {
    const o = (e ?? {}) as Record<string, unknown>;
    for (const f of ["section", "label", "detail", "type"]) if (typeof o[f] !== "string" || !o[f]) traceErrors.push(`${i}: missing ${f}`);
    if (!types.includes(String(o.type))) traceErrors.push(`${i}: invalid type ${String(o.type)}`);
  });
  const annotationEdges = trace.filter((e) => (e as Record<string, unknown>)?.type === "annotation").length;
  if (annotationEdges && !annotations.length) traceErrors.push("annotation edges without any visual annotation (seeded provenance)");
  if (annotations.length && !annotationEdges) traceErrors.push("visual annotations without an annotation edge");
  // The truth graph holds only this product's records: no sample or placeholder nodes, no dangling edges.
  const graphErrors: string[] = [];
  try {
    const g = JSON.parse(files["TRUTH_GRAPH.json"] ?? "{}") as { nodes?: { id?: string }[]; edges?: { from?: string; to?: string }[] };
    const ids = new Set((g.nodes ?? []).map((n) => String(n.id)));
    if ((g.nodes ?? []).length !== ids.size) graphErrors.push("duplicate node ids");
    for (const n of g.nodes ?? []) if (!/^(usecase|(msg|doc|evidence|decision|cap|spec|backlog|ann|move|version):.+)$/.test(String(n.id))) graphErrors.push(`node ${String(n.id)} is not a Studio record (seeded or placeholder)`);
    for (const e of g.edges ?? []) if (!ids.has(String(e.from)) || !ids.has(String(e.to))) graphErrors.push(`edge ${String(e.from)} -> ${String(e.to)} points outside the graph`);
  } catch {
    graphErrors.push("TRUTH_GRAPH.json is not JSON");
  }
  return { ok: !missing.length && !promptMissing.length && !annotationErrors.length && !traceErrors.length && !graphErrors.length, missing, promptMissing, annotationErrors, traceErrors, graphErrors, traceEdges: trace.length };
}

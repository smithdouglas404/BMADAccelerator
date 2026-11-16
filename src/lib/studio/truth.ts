// The Product Truth Graph: the Studio's core record, read from what really happened in this product.
// Uses the design team's types (src/studio/graph.ts) but never their sample nodes: every node is a real
// record (a thing someone said, a piece of evidence, an inference, a decision, a spec section, a mark on
// the prototype, a build) and every edge is either an explicit link between records or a logged change
// that names its cause. Pure: no database, so tests load it directly.

import type { TruthConfidence, TruthEdge, TruthEdgeRelation, TruthNode, TruthNodeType, TruthSource } from "../../studio/graph.ts";

/** What kind of statement a node is. Inferred content never looks like confirmed truth. */
export type Statement = "fact" | "evidence" | "inference" | "recommendation" | "decision" | "open" | "rejected" | "generated";

export const STATEMENTS: { key: Statement; label: string; plain: string }[] = [
  { key: "fact", label: "Said by a person", plain: "Someone on the team said this." },
  { key: "evidence", label: "Outside evidence", plain: "Research, an upload, an interview or the pilot shows this." },
  { key: "inference", label: "Socra inference", plain: "Socra or its team worked this out; nobody has confirmed it yet." },
  { key: "recommendation", label: "Recommendation", plain: "Suggested, not decided." },
  { key: "decision", label: "Human decision", plain: "A person approved this." },
  { key: "open", label: "Open question", plain: "Only a person can answer this." },
  { key: "rejected", label: "Rejected", plain: "A person said no, or it was taken out." },
  { key: "generated", label: "Built", plain: "Claude Code built this, or plans to." },
];

export type Interpretation = { plain: string; technical: string };

export type LiveTruthNode = TruthNode & {
  statement: Statement;
  /** When it happened, and who (or which agent) it came from. */
  at: string;
  by: string;
  /** Where to open it in the Studio. */
  view: "conversation" | "evidence" | "spec" | "product" | "review" | "pilot" | "validation" | "brief";
  /** Things the Studio infers from it, in plain words, with the technical reading kept for the side panel. */
  interpretations: Interpretation[];
};

export type LiveTruthEdge = TruthEdge;

export type ChangeRow = { id: string; node: string; kind: string; summary: string; before: string; after: string; causes: string[]; by: string; createdAt: string | Date };

export type GraphInput = {
  id: string;
  name: string;
  statement: string;
  validatedUseCase: string;
  audience: string;
  createdAt: string | Date;
  validation: Record<string, { state: string; note?: string } | undefined>;
  messages: { id: string; role: string; agent: string; content: string; author: string; authorRole: string; addressed: string; ref: string; createdAt: string | Date }[];
  evidence: { id: string; source: string; type: string; insight: string; confidence: string; trace: string; documentId: string; createdAt: string | Date }[];
  documents: { id: string; fileName: string; createdAt: string | Date; summary?: string }[];
  decisions: { id: string; text: string; status: string; capability: string; words: string; agent: string; answer: string; createdAt: string | Date; resolvedAt?: string | Date | null }[];
  capabilities: { id: string; key: string; label: string; description: string; readiness: number; items: unknown; updatedAt: string | Date }[];
  backlog: { id: string; title: string; note: string; kind: string; group: string; source: string; recKind: string; state: string; annotationId: string; createdAt: string | Date }[];
  spec: { id: string; key: string; ref: string; tab: string; title: string; content: string; completeness: number; confidence: string; basis: string; status: string; review: string; capability: string; related: string[]; trace: unknown; updatedBy: string; updatedAt: string | Date }[];
  feedback: { id: string; comment: string; target: string; shape: string; status: string; interpretation: unknown; createdAt: string | Date }[];
  moves: { id: string; title: string; capability: string; decision: string; status: string; owner: string; updatedAt: string | Date }[];
  revisions: { version: number; reason: string; createdAt: string | Date }[];
  changes: ChangeRow[];
};

const iso = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString() : "");
const clip = (s: string, n = 120) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const firstLine = (s: string) => clip(s.split(/\n/).find((l) => l.trim()) ?? "", 90);
const tagsOf = (...parts: string[]) => [...new Set(parts.filter(Boolean).map((p) => p.toLowerCase().replace(/\s+/g, "-").slice(0, 24)))].slice(0, 4);

// ---------- Plain-language inference: fixed rules, plain code (no AI for its own sake) ----------

const RULES: { test: RegExp; plain: string; technical: string; tag: string }[] = [
  { test: /\b(approv|sign[- ]?off|review(ed)? (it|this|before)|check(ed)? by|second pair|four[- ]eyes|confirm before)/i, plain: "Someone should be able to review this before it becomes permanent.", technical: "Human-in-the-loop approval checkpoint (AgentKit pause, approve/reject with comment, audit entry).", tag: "approval" },
  { test: /\b(notify|notification|remind|alert|email|text message|sms|push)\b/i, plain: "People should hear about this without having to go and check.", technical: "Event-driven notification: an async job on a domain event, with delivery and retry.", tag: "notification" },
  { test: /\b(status|stage|step|moves? to|pending|in progress|closed|reopen|escalat)/i, plain: "This moves through stages, and everyone should see where it is.", technical: "A state machine: named states and allowed transitions, each transition recorded.", tag: "state" },
  { test: /\b(audit|history|who changed|who did|trail|complian|regulat|evidence of)/i, plain: "You should be able to see who did what, and when.", technical: "Append-only audit log on the affected records (actor, action, before/after, timestamp).", tag: "audit" },
  { test: /\b(schedul|every (day|week|month|night)|nightly|later|overnight|batch|background|takes a while|long[- ]running)/i, plain: "This can happen in the background or on a schedule, not while someone waits.", technical: "Asynchronous execution: queued or scheduled job (Inngest function), idempotent, with status.", tag: "async" },
  { test: /\b(recommend|suggest|predict|triage|classif|summari[sz]|draft|insight|anomal)/i, plain: "This is judgement work an assistant could help with, with a person in charge.", technical: "Agentic workflow candidate (Inngest AgentKit agent/network) with a human approval step; not a fixed rule.", tag: "agentic" },
  { test: /\b(feel|look|clear|calm|easy|simple|fast|friendly|confus|clutter|tone|premium)/i, plain: "This is about how it feels to use, not how it is built.", technical: "Experience requirement (PRD), expressed as acceptance criteria and UI/component changes, not a TRD change.", tag: "experience" },
  { test: /\b(role|permission|only (the|a)|admin|manager can|who can|access)/i, plain: "Not everyone should be able to do this.", technical: "Authorization rule: role-based access on the action and the data it touches.", tag: "permissions" },
  { test: /\b(upload|attach|photo|document|file|scan)/i, plain: "People will bring files into this, and those need to be kept safely.", technical: "File storage: upload, type/size checks, retention, linked to the owning record.", tag: "files" },
  { test: /\b(integrat|import|export|sync|api|connect(ed)? to|from (our|the) (system|crm|erp))/i, plain: "This has to work with another system you already use.", technical: "Integration contract: API/connector with mapping, error handling and retries.", tag: "integration" },
];

/** What the Studio quietly infers from a piece of text, in plain words with the technical reading. */
export function interpretText(text: string, hint = ""): Interpretation[] {
  const out: Interpretation[] = [];
  if (hint === "hitl") out.push({ plain: RULES[0].plain, technical: RULES[0].technical });
  if (hint === "workflow") out.push({ plain: RULES[5].plain, technical: RULES[5].technical });
  for (const r of RULES) if (r.test.test(text) && !out.some((o) => o.plain === r.plain)) out.push({ plain: r.plain, technical: r.technical });
  return out.slice(0, 3);
}

const ruleTags = (text: string) => RULES.filter((r) => r.test.test(text)).map((r) => r.tag);

// ---------- Nodes ----------

function specStatement(basis: string, status: string, review: string): Statement {
  if (review === "remove") return "rejected";
  if (status === "owner-approved" || status === "engineer-reviewed" || status.startsWith("ready") || status === "production-ready" || basis === "confirmed") return "decision";
  if (basis === "recommended") return "recommendation";
  if (basis === "inferred") return "inference";
  return "open";
}
const confOf = (c: string): TruthConfidence => (c === "high" ? "high" : c === "medium" ? "medium" : "open");
const statusOf = (s: Statement): TruthNode["status"] => (s === "decision" ? "accepted" : s === "open" || s === "inference" || s === "recommendation" ? "open" : s === "rejected" ? "parked" : "active");
const confForStatement = (s: Statement): TruthConfidence => (s === "decision" || s === "fact" ? "high" : s === "evidence" || s === "generated" ? "medium" : s === "open" || s === "rejected" ? "open" : "medium");

type FloorItem = { id: string; text: string; state: string };
const floorItems = (items: unknown): FloorItem[] => (Array.isArray(items) ? (items as FloorItem[]).filter((i) => i && typeof i.text === "string") : []);

export type InterpretationRecord = { observation?: string; behaviour?: string; acceptance?: string[]; component?: string; prd?: string[]; trd?: string[]; question?: string };
export const readInterpretation = (v: unknown): InterpretationRecord => (v && typeof v === "object" && !Array.isArray(v) ? (v as InterpretationRecord) : {});

export function truthNodes(g: GraphInput): LiveTruthNode[] {
  const nodes: LiveTruthNode[] = [];
  const add = (n: Omit<LiveTruthNode, "confidence" | "status"> & { confidence?: TruthConfidence; status?: TruthNode["status"] }) =>
    nodes.push({ confidence: n.confidence ?? confForStatement(n.statement), status: n.status ?? statusOf(n.statement), ...n });

  // The use case at the centre: what meaningful change should happen for whom.
  const v = g.validation ?? {};
  const confirmed = ["problem", "customer", "evidence", "proof", "thinSlice"].filter((k) => v[k]?.state === "confirmed").length;
  add({
    id: "usecase", type: "use-case", title: g.name, detail: clip(g.validatedUseCase || g.statement || "The use case is still taking shape.", 220),
    source: "owner", statement: confirmed >= 4 ? "decision" : confirmed ? "inference" : "open", ontologyClass: "experience",
    semanticTags: tagsOf("use-case", g.audience), at: iso(g.createdAt), by: "", view: "validation", interpretations: [],
  });

  for (const m of g.messages) {
    if (m.role === "user") {
      add({
        id: `msg:${m.id}`, type: "thought", title: clip(m.content, 70), detail: m.content, source: "owner", statement: "fact", ontologyClass: "claim",
        semanticTags: tagsOf(m.authorRole || "owner", ...ruleTags(m.content)), at: iso(m.createdAt), by: m.author || "Owner", view: "conversation",
        interpretations: interpretText(m.content),
      });
    } else if (m.role === "muse" || (m.role === "agent" && m.addressed)) {
      const asks = /\?\s*$|\n\s*1[.)]\s/m.test(m.content);
      add({
        id: `msg:${m.id}`, type: "conversation", title: firstLine(m.content), detail: clip(m.content, 400), source: "muse", statement: asks ? "open" : "inference",
        ontologyClass: m.role === "agent" ? "actor" : "experience", semanticTags: tagsOf(m.agent.split(" · ")[0] || "muse", asks ? "question" : "reflection"),
        at: iso(m.createdAt), by: m.agent || "Socra", view: "conversation", interpretations: [],
      });
    }
  }

  for (const d of g.documents) {
    add({ id: `doc:${d.id}`, type: "evidence", title: d.fileName, detail: clip(d.summary || `Uploaded ${d.fileName}`, 300), source: "evidence", statement: "evidence", ontologyClass: "evidence", semanticTags: tagsOf("upload"), at: iso(d.createdAt), by: "", view: "evidence", interpretations: [] });
  }
  for (const e of g.evidence) {
    const said = e.type === "conversation";
    add({
      id: `evidence:${e.id}`, type: "evidence", title: clip(e.insight, 70), detail: `${e.insight}${e.trace ? `\n\nSupports: ${e.trace}` : ""}`, source: e.type === "pilot" ? "prototype" : "evidence",
      statement: said ? "fact" : "evidence", confidence: confOf(e.confidence), ontologyClass: "evidence", semanticTags: tagsOf(e.type, e.source),
      at: iso(e.createdAt), by: e.source, view: e.type === "pilot" ? "pilot" : "evidence", interpretations: [],
    });
  }

  for (const d of g.decisions) {
    const statement: Statement = d.status === "approved" ? "decision" : d.status === "open" ? "open" : d.status === "rejected" ? "rejected" : "inference";
    add({
      id: `decision:${d.id}`, type: d.status === "assumed" ? "inference" : "decision", title: clip(d.text, 80), detail: `${d.text}${d.words ? `\n\nIn their words: “${d.words}”` : ""}${d.answer ? `\n\nAnswer: ${d.answer}` : ""}`,
      source: d.status === "assumed" ? "muse" : "owner", statement, ontologyClass: "decision", semanticTags: tagsOf(d.status, d.capability), at: iso(d.resolvedAt || d.createdAt), by: d.agent,
      view: "conversation", interpretations: interpretText(`${d.text} ${d.words}`),
    });
  }

  for (const c of g.capabilities) {
    const items = floorItems(c.items);
    const assumed = items.filter((i) => i.state === "assumed").length;
    const ok = items.filter((i) => i.state === "confirmed").length;
    add({
      id: `cap:${c.key}`, type: "capability", title: c.label, detail: `${c.description || ""}${items.length ? `\n\n${ok} confirmed, ${assumed} inferred from what leading products have, ${items.length - ok - assumed} ruled out.` : ""}`.trim(),
      source: "muse", statement: items.length && !assumed ? "decision" : "inference", ontologyClass: "experience", semanticTags: tagsOf("capability", `${c.readiness}%`),
      at: iso(c.updatedAt), by: "Socra", view: "product", interpretations: [],
    });
  }

  for (const s of g.spec) {
    if (!s.content.trim() && s.basis === "not-researched") continue;
    const statement = specStatement(s.basis, s.status, s.review);
    add({
      id: `spec:${s.key}`, type: s.tab === "trd" ? "trd" : "prd", title: `${s.tab.toUpperCase()} · ${s.title}`, detail: clip(s.content, 500), source: "system", statement,
      confidence: confOf(s.confidence), ontologyClass: "artifact", semanticTags: tagsOf(s.tab, s.basis, s.status), section: s.title,
      at: iso(s.updatedAt), by: s.updatedBy, view: "spec", interpretations: s.tab === "prd" ? interpretText(s.content).slice(0, 2) : [],
    });
  }

  for (const b of g.backlog) {
    const statement: Statement = b.kind === "distraction" ? "rejected" : b.recKind ? "recommendation" : b.state === "built" ? "generated" : "fact";
    add({
      id: `backlog:${b.id}`, type: "backlog", title: clip(b.title, 80), detail: `${b.title}${b.note ? `\n\n${b.note}` : ""}`, source: b.recKind ? "muse" : b.annotationId ? "prototype" : "owner",
      statement, ontologyClass: "work", semanticTags: tagsOf(b.recKind || b.kind, b.state, b.group), at: iso(b.createdAt), by: b.source, view: "product",
      interpretations: interpretText(`${b.title} ${b.note}`, b.recKind),
    });
  }

  for (const f of g.feedback) {
    const it = readInterpretation(f.interpretation);
    add({
      id: `ann:${f.id}`, type: "prototype", title: clip(f.comment, 80), detail: `${f.shape === "circle" ? "Circled" : f.shape === "full-screen" ? "Whole screen" : "Pointed at"} ${f.target || "the product"}: “${f.comment}”${it.behaviour ? `\n\nMeans: ${it.behaviour}` : ""}`,
      source: "prototype", statement: "fact", ontologyClass: "artifact", semanticTags: tagsOf("annotation", f.shape, f.status), at: iso(f.createdAt), by: "", view: "review",
      interpretations: interpretText(f.comment),
    });
  }

  for (const m of g.moves) {
    add({ id: `move:${m.id}`, type: "execution", title: clip(m.title, 80), detail: `${m.title}${m.decision ? `\n\nFrom: ${m.decision}` : ""}`, source: "system", statement: m.status === "done" || m.status === "review" ? "generated" : "recommendation", ontologyClass: "work", semanticTags: tagsOf("build-move", m.status), at: iso(m.updatedAt), by: m.owner, view: "pilot", interpretations: [] });
  }
  for (const r of g.revisions) {
    add({ id: `version:${r.version}`, type: "prototype", title: `Version ${r.version}`, detail: r.reason || `Package and build version ${r.version}.`, source: "system", statement: "generated", ontologyClass: "artifact", semanticTags: tagsOf("build", `v${r.version}`), at: iso(r.createdAt), by: "Claude Code", view: "brief", interpretations: [] });
  }
  return nodes;
}

// ---------- Edges: explicit links and logged causes only ----------

const RELATION_FOR_KIND: Record<string, TruthEdgeRelation> = {
  approved: "approves", rejected: "approves", undone: "revises", changed: "revises", reviewed: "revises", interpreted: "infers",
  observed: "supports", built: "implements", added: "shapes", said: "expresses", moved: "shapes", "moved back": "revises", withdrawn: "revises",
};
const LABEL_FOR_KIND: Record<string, string> = {
  approved: "approved it", rejected: "rejected it", undone: "undid it", changed: "changed it", reviewed: "asked for a review", interpreted: "interpreted it",
  observed: "showed it in the pilot", built: "went into the build", added: "brought it in", said: "said it", moved: "moved it", "moved back": "sent it back", withdrawn: "withdrew it",
};

export function truthEdges(g: GraphInput, nodes: LiveTruthNode[]): LiveTruthEdge[] {
  const has = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LiveTruthEdge[] = [];
  const seen = new Set<string>();
  const link = (from: string, to: string, relation: TruthEdgeRelation, label: string, source: TruthSource, at: string) => {
    if (!has.has(from) || !has.has(to) || from === to) return;
    const key = `${from}>${to}>${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: `e${edges.length + 1}`, from, to, relation, label, source, confidence: byId.get(to)?.confidence ?? "open", createdAt: at });
  };
  const capByLabel = new Map(g.capabilities.flatMap((c) => [[c.label.toLowerCase(), c.key], [c.key, c.key]] as [string, string][]));
  const capNode = (c: string) => (c ? `cap:${capByLabel.get(c.toLowerCase()) ?? c}` : "");

  // A person spoke, Socra answered.
  let lastUser = "";
  for (const m of g.messages) {
    if (m.role === "user") lastUser = `msg:${m.id}`;
    else if (lastUser && (m.role === "muse" || (m.role === "agent" && m.addressed))) link(lastUser, `msg:${m.id}`, "infers", m.role === "agent" ? `${m.agent.split(" · ")[0]} answered` : "Socra interpreted it", "muse", iso(m.createdAt));
    if (m.role === "signal" && m.ref && lastUser) link(lastUser, `decision:${m.ref}`, "approves", "a yes approved it", "owner", iso(m.createdAt));
  }
  // Words a decision or a backlog item came from.
  const userMsgs = g.messages.filter((m) => m.role === "user");
  const fromWords = (words: string) => {
    const w = words.trim().toLowerCase();
    if (w.length < 4) return "";
    const hit = userMsgs.find((m) => m.content.trim().toLowerCase() === w || m.content.toLowerCase().includes(w));
    return hit ? `msg:${hit.id}` : "";
  };
  for (const d of g.decisions) {
    const src = fromWords(d.words);
    if (src) link(src, `decision:${d.id}`, d.status === "approved" ? "approves" : "expresses", d.status === "approved" ? "approved in their words" : "raised it", "owner", iso(d.createdAt));
    const cap = capNode(d.capability);
    if (cap) link(`decision:${d.id}`, cap, "shapes", "shapes the capability", "owner", iso(d.createdAt));
  }
  for (const b of g.backlog) {
    if (b.annotationId) link(`ann:${b.annotationId}`, `backlog:${b.id}`, "shapes", "held for the next build", "prototype", iso(b.createdAt));
    else if (!b.recKind) {
      const src = fromWords(b.title);
      if (src) link(src, `backlog:${b.id}`, "shapes", "held in the backlog", "owner", iso(b.createdAt));
    }
    const cap = capNode(b.group);
    if (cap && b.recKind) link(`backlog:${b.id}`, cap, "supports", "recommended for this capability", "muse", iso(b.createdAt));
  }
  for (const e of g.evidence) if (e.documentId) link(`doc:${e.documentId}`, `evidence:${e.id}`, "supports", "found in the upload", "evidence", iso(e.createdAt));
  for (const c of g.capabilities) link("usecase", `cap:${c.key}`, "specifies", "needs this capability", "system", iso(c.updatedAt));

  // Spec sections: their capability, the records they rest on, and their trace.
  const idToNode = (id: string) => [`decision:${id}`, `backlog:${id}`, `evidence:${id}`, `move:${id}`, `ann:${id}`, `doc:${id}`].find((x) => has.has(x)) ?? "";
  for (const s of g.spec) {
    const node = `spec:${s.key}`;
    if (!has.has(node)) continue;
    const at = iso(s.updatedAt);
    const cap = capNode(s.capability);
    if (cap) link(cap, node, "specifies", "writes the experience", "system", at);
    for (const r of s.related) {
      const n = idToNode(r);
      if (n) link(n, node, n.startsWith("evidence") || n.startsWith("doc") ? "supports" : n.startsWith("move") ? "implements" : "shapes", n.startsWith("evidence") ? "evidence for it" : "rests on it", byId.get(n)?.source ?? "system", at);
    }
    const steps = Array.isArray(s.trace) ? (s.trace as { label?: string; detail?: string; type?: string }[]) : [];
    for (const t of steps) {
      const d = (t.detail ?? "").toLowerCase();
      if (!d) continue;
      if (t.type === "conversation") {
        const m = userMsgs.find((x) => x.content.toLowerCase() === d || d.includes(x.content.toLowerCase().slice(0, 50)));
        if (m) link(`msg:${m.id}`, node, "expresses", "written from their words", "owner", at);
      } else if (t.type === "annotation") {
        const f = g.feedback.find((x) => x.comment && d.includes(x.comment.toLowerCase().slice(0, 40)));
        if (f) link(`ann:${f.id}`, node, "revises", "a mark on the prototype changed it", "prototype", at);
      } else if (t.type === "evidence") {
        const e = g.evidence.find((x) => d.includes(x.id) || (x.insight && d.includes(x.insight.toLowerCase().slice(0, 40))));
        if (e) link(`evidence:${e.id}`, node, "supports", "evidence for it", "evidence", at);
      }
    }
  }
  // Annotation interpretations: the mark changes these sections.
  for (const f of g.feedback) {
    const it = readInterpretation(f.interpretation);
    for (const k of [...(it.prd ?? []), ...(it.trd ?? [])]) link(`ann:${f.id}`, `spec:${k}`, "revises", k.startsWith("trd") ? "creates a technical consequence" : "changes the experience", "prototype", iso(f.createdAt));
  }
  // Builds: decisions and marks that went into a version, moves that implement a capability.
  for (const m of g.moves) {
    const cap = capNode(m.capability);
    if (cap) link(cap, `move:${m.id}`, "implements", "a build move", "system", iso(m.updatedAt));
    const d = g.decisions.find((x) => m.decision && (x.text === m.decision || m.decision.includes(x.text.slice(0, 40))));
    if (d) link(`decision:${d.id}`, `move:${m.id}`, "implements", "built from it", "system", iso(m.updatedAt));
  }
  // Logged changes: each names what caused it.
  for (const c of g.changes) for (const cause of c.causes) link(cause, c.node, RELATION_FOR_KIND[c.kind] ?? "shapes", LABEL_FOR_KIND[c.kind] ?? c.kind, byId.get(cause)?.source ?? "system", iso(c.createdAt));
  return edges;
}

export function buildTruthGraph(g: GraphInput) {
  const nodes = truthNodes(g);
  const edges = truthEdges(g, nodes);
  return { nodes, edges };
}

// ---------- "Why did this change?" ----------

export type Explained = ChangeRow & {
  title: string;
  /** The chain of causes, nearest first (up to three steps back through the graph). */
  because: { id: string; title: string; type: TruthNodeType; statement: Statement; relation: string }[];
  /** What else the changed node feeds. */
  affects: { id: string; title: string; type: TruthNodeType }[];
};

export function explainChanges(changes: ChangeRow[], nodes: LiveTruthNode[], edges: LiveTruthEdge[], limit = 60): Explained[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, LiveTruthEdge[]>();
  const outgoing = new Map<string, LiveTruthEdge[]>();
  for (const e of edges) {
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);
  }
  return [...changes]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit)
    .map((c) => {
      const because: Explained["because"] = [];
      const seen = new Set([c.node]);
      let frontier = c.causes.filter((x) => byId.has(x)).map((x) => ({ id: x, relation: LABEL_FOR_KIND[c.kind] ?? c.kind }));
      for (let depth = 0; depth < 3 && frontier.length && because.length < 6; depth++) {
        const next: { id: string; relation: string }[] = [];
        for (const f of frontier) {
          if (seen.has(f.id)) continue;
          seen.add(f.id);
          const n = byId.get(f.id);
          if (!n) continue;
          because.push({ id: n.id, title: n.title, type: n.type, statement: n.statement, relation: f.relation });
          for (const e of incoming.get(f.id) ?? []) {
            if (+new Date(e.createdAt || 0) > +new Date(c.createdAt) + 1000) continue;
            next.push({ id: e.from, relation: e.label });
          }
        }
        frontier = next.slice(0, 3);
      }
      const affects = (outgoing.get(c.node) ?? []).map((e) => byId.get(e.to)).filter((n): n is LiveTruthNode => !!n).slice(0, 6).map((n) => ({ id: n.id, title: n.title, type: n.type }));
      return { ...c, createdAt: iso(c.createdAt), title: byId.get(c.node)?.title ?? c.node, because, affects };
    });
}

// ---------- Use-case confidence, calculated from the graph ----------

export type ConfidenceFactor = { key: string; label: string; value: number; because: string[] };

const BASIS_WEIGHT: Record<string, number> = { confirmed: 1, recommended: 0.6, inferred: 0.5, open: 0, "not-researched": 0 };
const SUPPORTING: Statement[] = ["fact", "evidence", "decision"];

const FACTORS: { key: string; label: string; sections: string[]; signal?: string }[] = [
  { key: "problem", label: "Problem", sections: ["prd-problem", "prd-jobs"], signal: "problem" },
  { key: "user", label: "User", sections: ["prd-actors", "prd-journey"], signal: "customer" },
  { key: "behaviour", label: "Behaviour change", sections: ["prd-use-case", "prd-flows", "prd-acceptance"], signal: "proof" },
  { key: "value", label: "Value", sections: ["prd-promise", "prd-metrics"], signal: "evidence" },
  { key: "feasibility", label: "Feasibility", sections: ["trd-architecture", "trd-data", "trd-states", "trd-hitl", "prd-risks"], signal: "thinSlice" },
];

/**
 * How sure we are about this use case, factor by factor, worked out from the graph and nothing else.
 * A factor rises with well-formed sections (weighted by how we know them: confirmed counts fully, an
 * inference half) and with facts, evidence and decisions connected to them. Nothing connected: 0.
 */
export function caseConfidence(g: GraphInput, nodes: LiveTruthNode[], edges: LiveTruthEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const factors: ConfidenceFactor[] = FACTORS.map((f) => {
    const secs = g.spec.filter((s) => f.sections.includes(s.key) && s.review !== "remove");
    const sectionScore = secs.length ? secs.reduce((a, s) => a + (s.completeness / 100) * (BASIS_WEIGHT[s.basis] ?? 0), 0) / f.sections.length : 0;
    const support = new Set<string>();
    for (const e of edges) if (f.sections.some((k) => e.to === `spec:${k}`) && SUPPORTING.includes(byId.get(e.from)?.statement as Statement)) support.add(e.from);
    const supportScore = Math.min(1, support.size / 3);
    const sig = f.signal ? g.validation?.[f.signal]?.state : undefined;
    const signalScore = sig === "confirmed" ? 1 : sig === "probe" ? 0.5 : 0;
    const value = Math.round(100 * (0.5 * sectionScore + 0.3 * supportScore + 0.2 * signalScore));
    const because: string[] = [];
    const written = secs.filter((s) => s.content.trim());
    because.push(written.length ? `${written.length} of ${f.sections.length} sections written (${written.map((s) => `${s.title}: ${s.basis}`).join("; ")})` : "No section written yet");
    because.push(support.size ? `${support.size} fact${support.size === 1 ? "" : "s"}, evidence or decision${support.size === 1 ? "" : "s"} connected` : "Nothing said, shown or decided is connected yet");
    if (f.signal) because.push(`Validation signal: ${sig ?? "open"}`);
    return { key: f.key, label: f.label, value, because };
  });
  // Pilot readiness: something built, marks answered, checkpoints closed, moves done.
  const built = g.revisions.length;
  const marks = g.feedback.length;
  const interpreted = g.feedback.filter((f) => readInterpretation(f.interpretation).behaviour).length;
  const open = g.decisions.filter((d) => d.status === "open").length;
  const done = g.moves.filter((m) => m.status === "done" || m.status === "review").length;
  const pilotParts = [built ? 1 : 0, marks ? interpreted / marks : built ? 0.5 : 0, open ? 0 : g.decisions.length ? 1 : 0, g.moves.length ? done / g.moves.length : 0];
  factors.push({
    key: "pilot", label: "Pilot readiness", value: Math.round((100 * pilotParts.reduce((a, b) => a + b, 0)) / pilotParts.length),
    because: [
      built ? `${built} version${built === 1 ? "" : "s"} built` : "Nothing built yet",
      marks ? `${interpreted} of ${marks} marks on the prototype interpreted into the spec` : "No marks on the prototype yet",
      open ? `${open} checkpoint${open === 1 ? "" : "s"} still open` : g.decisions.length ? "No open checkpoints" : "No decisions yet",
      g.moves.length ? `${done} of ${g.moves.length} build moves done or in review` : "No build moves yet",
    ],
  });
  const overall = Math.round(factors.reduce((a, f) => a + f.value, 0) / factors.length);
  return { overall, factors };
}

/** The graph in TRUTH_GRAPH.json: the team's schema with this product's real nodes and edges. */
export function exportGraph(nodes: LiveTruthNode[], edges: LiveTruthEdge[]) {
  return {
    nodes: nodes.map(({ interpretations, ...n }) => ({ ...n, interpretations: interpretations.map((i) => i.technical) })),
    edges,
  };
}

export type DocumentT = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bmadType: string;
  tags: string[];
  description: string;
  summary: string;
  approved: boolean;
  status: string;
  stage: string;
  declineNote: string;
  origin?: string;
};

export type MessageT = { id: string; role: string; agent: string; content: string; createdAt: string };

export type TicketT = {
  id: string;
  ref: string;
  kind: string;
  title: string;
  epicRef: string;
  status: string;
  blocked: boolean;
  refined: boolean;
  after: string[];
  unknown: string;
  verify: string;
  position: number;
  bmadStatus?: string;
  trackerUrl?: string;
};

export type ReviewT = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  reason: string;
  source: string;
  targetId: string;
  status: string;
  answer?: string;
  createdAt: string;
  resolvedAt?: string | null;
};

export type UseCaseFull = {
  id: string;
  slug: string;
  name: string;
  description: string;
  intentDone: string;
  intentKeep: string;
  intentOutScope: string;
  customer: string;
  problem: string;
  size: "change" | "epic" | "project";
  needsApprovals: boolean;
  clientVendor: boolean;
  regulated: boolean;
  ideaStage: "new" | "existing" | "fuzzy";
  repoUrl: string;
  uxMode: "fast" | "coaching" | "handoff";
  archMode: "fast" | "coaching";
  onboardingStep: number;
  stage: "clarify" | "plan" | "build" | "learn";
  activeAgent: string;
  pendingQuestion: string;
  skills: { skillId: string }[];
  documents: DocumentT[];
  messages: MessageT[];
  tickets: TicketT[];
  reviews: ReviewT[];
  feedback: FeedbackT[];
  provisioned: boolean;
  bmadVersion: string;
  agentBusy: boolean;
  agentStatus: string;
  agentError: string;
  generateBusy: boolean;
  generateStatus: string;
  generateCount: number;
  previewPort: number;
  preview: { hasApp: boolean; port: number; running: boolean; starting: boolean };
  agentsEnabled: boolean;
};

export type FeedbackT = {
  id: string;
  comment: string;
  pageUrl: string;
  ticketRef: string;
  becameRef: string;
  changesRef: string;
  status: string;
  createdAt: string;
};

export function previewUrl(port: number) {
  if (typeof window === "undefined" || !port) return "";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export async function patchUseCase(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/use-cases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Save failed");
  return res.json();
}

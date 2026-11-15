"use client";

import { useEffect, useState } from "react";
import { AGENTS } from "@/lib/bmad";
import { ECC_SKILLS, SKILL_TARGETS } from "@/lib/skills";
import { MemoryTab } from "@/components/MemoryTab";
import { ModelsTab } from "@/components/ModelsTab";
import { Bot, Brain, Check, FileCog, KeyRound, Puzzle, Sparkles, SquareKanban, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

const TAB_ICONS = { "Models and keys": KeyRound, Tracker: SquareKanban, Skills: Sparkles, Modules: Puzzle, "Team rules and templates": FileCog, Agents: Bot, Memory: Brain } as const;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Prefs = {
  targetCodex: boolean;
  targetCursor: boolean;
  targetAntigravity: boolean;
  tracker: string;
  trackerProjectKey: string;
};

const TABS = ["Models and keys", "Tracker", "Skills", "Modules", "Team rules and templates", "Agents", "Memory"] as const;

const TRACKERS = [
  { key: "builtin", label: "Built-in board", note: "No account needed. Markdown files in each use case." },
  { key: "linear", label: "Linear", note: "Epics and stories sync as Linear issues." },
  { key: "jira", label: "Jira", note: "Epics and stories sync as Jira issues." },
  { key: "github", label: "GitHub Issues", note: "Sub-issues and blocked-by links." },
  { key: "notion", label: "Notion", note: "Database rows." },
  { key: "trello", label: "Trello", note: "Cards." },
];

const MODULES = [
  { code: "method", name: "BMad Method", note: "Core planning and build workflows.", status: "Installed" },
  { code: "tea", name: "Test Architect (TEA)", note: "Test design, tracing, release gates. Makes the pilot production ready.", status: "Installed" },
  { code: "cis", name: "Creative Intelligence Suite", note: "Brainstorming and design-thinking coaches for fuzzy ideas.", status: "Installed" },
  { code: "toolsmith", name: "Toolsmith", note: "Smithy and bmad-eval: build, validate and measure skills. Checks uploaded skills.", status: "Installed" },
  { code: "founder", name: "Founder", note: "Startup advisor, from diagnostics to investor materials.", status: "Optional" },
  { code: "gds", name: "Game Dev Studio", note: "Game-specific; not used for business apps.", status: "Not used" },
];

type CustomSkill = { id: string; name: string; description: string; valid: boolean; enabled: boolean; report: string };

export default function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Models and keys");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState("");
  const [confirmExport, setConfirmExport] = useState(false);
  const [connected, setConnected] = useState<{ linear: boolean; jira: boolean }>({ linear: false, jira: false });
  const [useCases, setUseCases] = useState<{ id: string; name: string }[]>([]);
  const [exportUseCase, setExportUseCase] = useState("");
  const [exportResult, setExportResult] = useState("");
  const [exporting, setExporting] = useState(false);
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [uploading, setUploading] = useState(false);
  const [skillMsg, setSkillMsg] = useState("");

  useEffect(() => {
    fetch("/api/preferences").then(async (r) => setPrefs(await r.json()));
    fetch("/api/trackers").then(async (r) => setConnected(await r.json()));
    fetch("/api/use-cases").then(async (r) => {
      const list = await r.json();
      setUseCases(list);
      if (list[0]) setExportUseCase(list[0].id);
    });
    loadSkills();
  }, []);

  function loadSkills() {
    fetch("/api/skills").then(async (r) => setSkills(await r.json()));
  }

  async function uploadSkill(file: File) {
    setUploading(true);
    setSkillMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/skills", { method: "POST", body: fd });
    const j = await r.json();
    setUploading(false);
    setSkillMsg(r.ok ? (j.valid ? `"${j.name}" passed BMAD's checks. Switch it on below.` : `"${j.name}" has problems to fix before it can be switched on.`) : j.error);
    loadSkills();
  }

  async function toggleSkill(id: string, enabled: boolean) {
    const r = await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!r.ok) setSkillMsg((await r.json()).error);
    loadSkills();
  }

  async function runExport(target: "jira" | "linear") {
    if (!prefs || !exportUseCase) return;
    setExporting(true);
    setExportResult("");
    const r = await fetch(`/api/use-cases/${exportUseCase}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, projectKey: prefs.trackerProjectKey }),
    });
    const j = await r.json();
    setExporting(false);
    setConfirmExport(false);
    setExportResult(r.ok ? `Done: ${j.created} item${j.created === 1 ? "" : "s"} published.` : j.error);
  }

  async function save(next: Partial<Prefs>) {
    const merged = { ...(prefs as Prefs), ...next };
    setPrefs(merged);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaved("Saved");
    setTimeout(() => setSaved(""), 1500);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">Keys and models, trackers, skills and memory for every use case.</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-good" role="status">
            <Check className="size-4" /> {saved}
          </span>
        )}
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <TabsTrigger key={t} value={t} className="flex-none">
                <Icon /> {t}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {!prefs ? (
        <p className="mt-8 text-muted-foreground">Loading...</p>
      ) : (
        <Card className="pop-in mt-4 block p-6">
          {tab === "Tracker" && (
            <div className="space-y-5">
              <p className="text-muted-foreground">
                BMAD&apos;s ticket tree is always the source of truth. Pick where your team sees it. Setup proves the
                connection with one test ticket.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TRACKERS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => save({ tracker: t.key })}
                    aria-pressed={prefs.tracker === t.key}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors hover:border-primary/40",
                      prefs.tracker === t.key && "border-primary bg-accent ring-1 ring-primary/30",
                    )}
                  >
                    <div className="font-semibold">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.note}</div>
                  </button>
                ))}
              </div>
              {(prefs.tracker === "linear" || prefs.tracker === "jira") && (
                <p className={`text-sm ${connected[prefs.tracker as "linear" | "jira"] ? "text-good" : "text-warn"}`}>
                  {connected[prefs.tracker as "linear" | "jira"]
                    ? `${prefs.tracker === "linear" ? "Linear" : "Jira"} is connected on the server.`
                    : prefs.tracker === "linear"
                      ? "Not connected yet: add the Linear key under Models and keys."
                      : "Not connected yet: add JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to the server's .env file, then restart."}
                  {prefs.tracker === "linear" && connected.linear && " Every card syncs to Linear as it changes."}
                </p>
              )}
              {["github", "notion", "trello"].includes(prefs.tracker) && (
                <p className="text-sm text-muted-foreground">
                  Sofia publishes to this tracker through BMAD&apos;s own store setup. Ask the concierge to set it up in a use case.
                </p>
              )}
              {prefs.tracker !== "builtin" && (
                <label className="block text-sm">
                  {prefs.tracker === "linear" ? "Linear team key" : "Project key"}
                  <Input
                    className="mt-1"
                    value={prefs.trackerProjectKey}
                    onChange={(e) => setPrefs({ ...prefs, trackerProjectKey: e.target.value })}
                    onBlur={() => save({ trackerProjectKey: prefs.trackerProjectKey })}
                    placeholder="e.g. PILOT"
                  />
                </label>
              )}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold">Export to Jira</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publishes every epic and story to a Jira project. Other people will see them, so we confirm first.
                </p>
                <label className="mt-3 block text-sm">
                  Use case
                  <NativeSelect wrapperClassName="mt-1 w-full" value={exportUseCase} onChange={(e) => setExportUseCase(e.target.value)}>
                    {useCases.map((u) => (
                      <NativeSelectOption key={u.id} value={u.id}>
                        {u.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                {!connected.jira && (
                  <p className="mt-2 text-xs text-warn">
                    Jira isn&apos;t connected: add JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to the server&apos;s .env file.
                  </p>
                )}
                {!confirmExport ? (
                  <Button variant="outline" className="mt-3" onClick={() => setConfirmExport(true)} disabled={!connected.jira || !exportUseCase}>
                    Export to Jira
                  </Button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      Publish all epics and stories of <strong>{useCases.find((u) => u.id === exportUseCase)?.name}</strong> to Jira
                      project <strong>{prefs.trackerProjectKey || "(set a project key above)"}</strong>?
                    </span>
                    <Button variant="ghost" onClick={() => setConfirmExport(false)}>
                      Cancel
                    </Button>
                    <Button disabled={!prefs.trackerProjectKey || exporting} onClick={() => runExport("jira")}>
                      {exporting ? "Publishing..." : "Confirm export"}
                    </Button>
                  </div>
                )}
                {exportResult && <p className="mt-2 text-sm" role="status">{exportResult}</p>}
              </div>
            </div>
          )}

          {tab === "Skills" && (
            <div className="space-y-5">
              <p className="text-muted-foreground">
                Skills are installed for the coding tools you choose. Claude Code is always on.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SKILL_TARGETS.map((t) => {
                  const key =
                    t.key === "codex" ? "targetCodex" : t.key === "cursor" ? "targetCursor" : t.key === "antigravity" ? "targetAntigravity" : null;
                  const checked = key ? prefs[key] : true;
                  return (
                    <label key={t.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <span>
                        <span className="font-semibold">{t.label}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{t.dir}</span>
                      </span>
                      <Switch
                        checked={checked}
                        disabled={t.locked}
                        onCheckedChange={(on) => key && save({ [key]: on } as Partial<Prefs>)}
                        aria-label={t.label}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold">ECC library</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ECC_SKILLS.length} skills available. Uploaded skills are checked with BMAD&apos;s own validate and
                  eval tools before they&apos;re switched on.
                </p>
                <label
                  className={cn(
                    "mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                    uploading && "opacity-60",
                  )}
                >
                  <Upload className="size-4" />
                  {uploading ? "Checking..." : "Upload a skill (.zip or SKILL.md)"}
                  <input
                    type="file"
                    accept=".zip,.md"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && uploadSkill(e.target.files[0])}
                  />
                </label>
                {skillMsg && <p className="mt-2 text-sm" role="status">{skillMsg}</p>}
                {skills.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {skills.map((k) => {
                      const findings: { rule: string; severity: string; detail: string }[] = JSON.parse(k.report || "[]");
                      return (
                        <li key={k.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span>
                              <span className="font-semibold">{k.name}</span>{" "}
                              <Badge variant="outline" className={cn("text-[10px]", k.valid ? "border-good/40 text-good" : "border-destructive/40 text-destructive")}>
                                {k.valid ? "Passed" : "Needs fixes"}
                              </Badge>
                            </span>
                            <label className="flex items-center gap-2 text-xs">
                              On
                              <Switch checked={k.enabled} disabled={!k.valid} onCheckedChange={(on) => toggleSkill(k.id, on)} />
                            </label>
                          </div>
                          {k.description && <p className="mt-1 text-xs text-muted-foreground">{k.description}</p>}
                          {findings.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                              {findings.map((f, i) => (
                                <li key={i}>
                                  {f.severity}: {f.detail}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === "Modules" && (
            <ul className="space-y-2">
              {MODULES.map((m) => (
                <li key={m.code} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-muted-foreground">{m.note}</div>
                  </div>
                  <Badge variant={m.status === "Installed" ? "default" : "secondary"} className="whitespace-nowrap">{m.status}</Badge>
                </li>
              ))}
            </ul>
          )}

          {tab === "Team rules and templates" && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Organization templates (for example a required PRD section), standing rules for the agents, writing
                standards, and automatic publishing of finished documents to Confluence or Notion.
              </p>
              <p>
                These are saved as BMAD override files under <code className="font-mono">_bmad/custom/</code>, so
                BMAD itself is never edited and its updates still apply. Each value shows whether it comes from the
                team or from you.
              </p>
            </div>
          )}

          {tab === "Agents" && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(AGENTS).map(([k, a]) => (
                <li key={k} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: a.color }}>
                    {a.name.slice(0, 1)}
                  </span>
                  <div>
                    <div className="font-semibold">
                      {a.name}, {a.role}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{a.skill}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {tab === "Memory" && <MemoryTab />}
          {tab === "Models and keys" && <ModelsTab />}
        </Card>
      )}
    </main>
  );
}

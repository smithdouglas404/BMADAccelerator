"use client";

import { useEffect, useState } from "react";
import { AGENTS } from "@/lib/bmad";
import { ECC_SKILLS, SKILL_TARGETS } from "@/lib/skills";

type Prefs = {
  targetCodex: boolean;
  targetCursor: boolean;
  targetAntigravity: boolean;
  tracker: string;
  trackerProjectKey: string;
};

const TABS = ["Tracker", "Skills", "Modules", "Team rules and templates", "Agents"] as const;

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
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tracker");
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <span className="text-sm text-good" role="status">
          {saved}
        </span>
      </div>
      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`chip px-3 py-1.5 text-sm ${tab === t ? "border-accent bg-accent/15" : "text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {!prefs ? (
        <p className="mt-8 text-muted">Loading...</p>
      ) : (
        <section className="glass pop-in mt-6 rounded-2xl p-6">
          {tab === "Tracker" && (
            <div className="space-y-5">
              <p className="text-muted">
                BMAD&apos;s ticket tree is always the source of truth. Pick where your team sees it. Setup proves the
                connection with one test ticket.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TRACKERS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => save({ tracker: t.key })}
                    aria-pressed={prefs.tracker === t.key}
                    className={`rounded-xl border p-3 text-left ${prefs.tracker === t.key ? "border-accent bg-accent/10" : "border-line"}`}
                  >
                    <div className="font-semibold">{t.label}</div>
                    <div className="text-xs text-muted">{t.note}</div>
                  </button>
                ))}
              </div>
              {(prefs.tracker === "linear" || prefs.tracker === "jira") && (
                <p className={`text-sm ${connected[prefs.tracker as "linear" | "jira"] ? "text-good" : "text-warn"}`}>
                  {connected[prefs.tracker as "linear" | "jira"]
                    ? `${prefs.tracker === "linear" ? "Linear" : "Jira"} is connected on the server.`
                    : prefs.tracker === "linear"
                      ? "Not connected yet: add LINEAR_API_KEY to the server's .env file, then restart."
                      : "Not connected yet: add JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to the server's .env file, then restart."}
                  {prefs.tracker === "linear" && connected.linear && " Every card syncs to Linear as it changes."}
                </p>
              )}
              {["github", "notion", "trello"].includes(prefs.tracker) && (
                <p className="text-sm text-muted">
                  Sofia publishes to this tracker through BMAD&apos;s own store setup. Ask the concierge to set it up in a use case.
                </p>
              )}
              {prefs.tracker !== "builtin" && (
                <label className="block text-sm">
                  {prefs.tracker === "linear" ? "Linear team key" : "Project key"}
                  <input
                    className="field mt-1"
                    value={prefs.trackerProjectKey}
                    onChange={(e) => setPrefs({ ...prefs, trackerProjectKey: e.target.value })}
                    onBlur={() => save({ trackerProjectKey: prefs.trackerProjectKey })}
                    placeholder="e.g. PILOT"
                  />
                </label>
              )}
              <div className="rounded-xl border border-line p-4">
                <h3 className="font-semibold">Export to Jira</h3>
                <p className="mt-1 text-sm text-muted">
                  Publishes every epic and story to a Jira project. Other people will see them, so we confirm first.
                </p>
                <label className="mt-3 block text-sm">
                  Use case
                  <select className="field mt-1" value={exportUseCase} onChange={(e) => setExportUseCase(e.target.value)}>
                    {useCases.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!connected.jira && (
                  <p className="mt-2 text-xs text-warn">
                    Jira isn&apos;t connected: add JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to the server&apos;s .env file.
                  </p>
                )}
                {!confirmExport ? (
                  <button className="btn mt-3" onClick={() => setConfirmExport(true)} disabled={!connected.jira || !exportUseCase}>
                    Export to Jira
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      Publish all epics and stories of <strong>{useCases.find((u) => u.id === exportUseCase)?.name}</strong> to Jira
                      project <strong>{prefs.trackerProjectKey || "(set a project key above)"}</strong>?
                    </span>
                    <button className="btn btn-ghost" onClick={() => setConfirmExport(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" disabled={!prefs.trackerProjectKey || exporting} onClick={() => runExport("jira")}>
                      {exporting ? "Publishing..." : "Confirm export"}
                    </button>
                  </div>
                )}
                {exportResult && <p className="mt-2 text-sm" role="status">{exportResult}</p>}
              </div>
            </div>
          )}

          {tab === "Skills" && (
            <div className="space-y-5">
              <p className="text-muted">
                Skills are installed for the coding tools you choose. Claude Code is always on.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SKILL_TARGETS.map((t) => {
                  const key =
                    t.key === "codex" ? "targetCodex" : t.key === "cursor" ? "targetCursor" : t.key === "antigravity" ? "targetAntigravity" : null;
                  const checked = key ? prefs[key] : true;
                  return (
                    <label key={t.key} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                      <span>
                        <span className="font-semibold">{t.label}</span>
                        <span className="block font-mono text-xs text-muted">{t.dir}</span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--accent)]"
                        checked={checked}
                        disabled={t.locked}
                        onChange={(e) => key && save({ [key]: e.target.checked } as Partial<Prefs>)}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="rounded-xl border border-line p-4">
                <h3 className="font-semibold">ECC library</h3>
                <p className="mt-1 text-sm text-muted">
                  {ECC_SKILLS.length} skills available. Uploaded skills are checked with BMAD&apos;s own validate and
                  eval tools before they&apos;re switched on.
                </p>
                <label className={`btn mt-3 cursor-pointer ${uploading ? "opacity-60" : ""}`}>
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
                        <li key={k.id} className="rounded-lg border border-line p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span>
                              <span className="font-semibold">{k.name}</span>{" "}
                              <span className={`chip text-[10px] ${k.valid ? "text-good" : "text-bad"}`}>{k.valid ? "Passed" : "Needs fixes"}</span>
                            </span>
                            <label className="flex items-center gap-2 text-xs">
                              On
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[var(--accent)]"
                                checked={k.enabled}
                                disabled={!k.valid}
                                onChange={(e) => toggleSkill(k.id, e.target.checked)}
                              />
                            </label>
                          </div>
                          {k.description && <p className="mt-1 text-xs text-muted">{k.description}</p>}
                          {findings.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 text-xs text-muted">
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
                <li key={m.code} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-muted">{m.note}</div>
                  </div>
                  <span className="chip whitespace-nowrap">{m.status}</span>
                </li>
              ))}
            </ul>
          )}

          {tab === "Team rules and templates" && (
            <div className="space-y-3 text-sm text-muted">
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
                <li key={k} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
                  <div>
                    <div className="font-semibold">
                      {a.name}, {a.role}
                    </div>
                    <div className="font-mono text-xs text-muted">{a.skill}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

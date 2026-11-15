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
  { code: "method", name: "BMad Method", note: "Core planning and build workflows.", status: "Included" },
  { code: "tea", name: "Test Architect (TEA)", note: "Test design, tracing, release gates. Makes the pilot production ready.", status: "Recommended" },
  { code: "cis", name: "Creative Intelligence Suite", note: "Brainstorming and design-thinking coaches for fuzzy ideas.", status: "Recommended" },
  { code: "founder", name: "Founder", note: "Startup advisor, from diagnostics to investor materials.", status: "Optional" },
  { code: "gds", name: "Game Dev Studio", note: "Game-specific; not used for business apps.", status: "Not used" },
];

export default function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tracker");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState("");
  const [confirmExport, setConfirmExport] = useState(false);

  useEffect(() => {
    fetch("/api/preferences").then(async (r) => setPrefs(await r.json()));
  }, []);

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
              {prefs.tracker !== "builtin" && (
                <label className="block text-sm">
                  Project key
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
                {!confirmExport ? (
                  <button className="btn mt-3" onClick={() => setConfirmExport(true)}>
                    Export to Jira
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      Publish all epics and stories to Jira project{" "}
                      <strong>{prefs.trackerProjectKey || "(set a project key above)"}</strong>?
                    </span>
                    <button className="btn btn-ghost" onClick={() => setConfirmExport(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled
                      title="Jira publishing runs through Sofia once the Jira connection is set up"
                    >
                      Confirm export
                    </button>
                  </div>
                )}
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
                <button className="btn mt-3" disabled title="Skill upload with validation arrives in a later step">
                  Upload a skill
                </button>
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

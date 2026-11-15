"use client";

import { useEffect, useState } from "react";

type KeyRow = { env: string; name: string; source: "saved" | "env" | "missing"; last4: string };
type ProviderRow = KeyRow & { id: string; models: string[]; console: string };
type RoleRow = { env: string; label: string; note: string; providers: string[]; current: string; saved: boolean; letta?: boolean };
type Status = { providers: ProviderRow[]; other: KeyRow[]; claudePlan: boolean; roles: RoleRow[] };

function KeyState({ k }: { k: KeyRow }) {
  if (k.source === "saved") return <span className="text-xs text-good">Saved here, ends in …{k.last4}</span>;
  if (k.source === "env") return <span className="text-xs text-good">Set in .env, ends in …{k.last4}</span>;
  return <span className="text-xs text-warn">Not set</span>;
}

function KeyEditor({ k, onSave, onRemove, link }: { k: KeyRow; onSave: (v: string) => void; onRemove: () => void; link?: string }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{k.name}</div>
          <KeyState k={k} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost text-sm" onClick={() => setOpen((o) => !o)}>
            {k.source === "missing" ? "Add key" : "Change key"}
          </button>
          {k.source === "saved" && (
            <button className="btn btn-ghost text-sm text-muted" onClick={onRemove} title="Use the key from .env again">
              Remove
            </button>
          )}
        </div>
      </div>
      {open && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            onSave(value);
            setValue("");
            setOpen(false);
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="input min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            placeholder="Paste the key"
            aria-label={`${k.name} key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="btn btn-primary text-sm" type="submit">
            Save
          </button>
          {link && (
            <a className="self-center text-xs text-accent underline" href={link} target="_blank" rel="noreferrer">
              Get a key
            </a>
          )}
        </form>
      )}
    </div>
  );
}

// Settings > Models and keys: the keys the accelerator uses, and which model does each job.
export function ModelsTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/settings/models").then(async (r) => setStatus(await r.json()));
  }, []);

  async function put(body: object, done: string) {
    setMsg(null);
    const r = await fetch("/api/settings/models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setMsg({ text: j.error || "Could not save", ok: false });
    setStatus(j);
    setMsg({ text: done, ok: true });
  }

  if (!status) return <p className="text-muted">Loading...</p>;
  const keyFor = (p: string) => status.providers.find((x) => x.id === p)!;
  const usable = (p: string) => keyFor(p).source !== "missing";

  return (
    <div className="space-y-8">
      <p className="text-muted">
        Add a key for each AI provider you use, then pick the model for each job. A model needs its provider&apos;s key. Keys are stored encrypted on
        this computer and are never shown again; changes apply straight away.
      </p>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">AI provider keys</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {status.providers.map((p) => (
            <KeyEditor
              key={p.env}
              k={p}
              link={p.console}
              onSave={(v) => put({ action: "key", env: p.env, value: v }, `${p.name} key saved`)}
              onRemove={() => put({ action: "removeKey", env: p.env }, `${p.name} key removed`)}
            />
          ))}
        </div>
        {status.claudePlan && <p className="text-xs text-muted">Your Claude plan is signed in, so the Claude jobs run on it first and use the Anthropic key only as a backup.</p>}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Which model does each job</h2>
        <div className="space-y-2">
          {status.roles.map((r) => {
            const options = r.providers.flatMap((pid) => keyFor(pid).models.filter((m) => r.env !== "BACC_IMAGE_MODEL" || m.startsWith("gpt-image")).filter((m) => r.env === "BACC_IMAGE_MODEL" || !m.startsWith("gpt-image")).map((m) => ({ pid, m })));
            const bare = r.letta ? r.current.replace(/^[a-z_]+\//, "") : r.current;
            const listed = options.some((o) => o.m === bare) || bare === "off" || bare === "";
            return (
              <div key={r.env} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-xs text-muted">{r.note}</div>
                </div>
                <select
                  className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
                  aria-label={`Model for ${r.label}`}
                  value={bare}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__default") return put({ action: "model", role: r.env, model: null }, `${r.label}: back to the default`);
                    if (v === "__other") {
                      const typed = window.prompt("Model name, exactly as the provider writes it");
                      if (typed) put({ action: "model", role: r.env, model: typed }, `${r.label} now uses ${typed}`);
                      return;
                    }
                    put({ action: "model", role: r.env, model: v }, v === "off" ? `${r.label}: off (demo mode)` : `${r.label} now uses ${v}`);
                  }}
                >
                  {bare === "" && <option value="">Default</option>}
                  {!listed && <option value={bare}>{bare}</option>}
                  {r.providers.map((pid) => (
                    <optgroup key={pid} label={`${keyFor(pid).name}${usable(pid) ? "" : " (add its key first)"}`}>
                      {options
                        .filter((o) => o.pid === pid)
                        .map((o) => (
                          <option key={o.m} value={o.m} disabled={!usable(pid) && !(pid === "anthropic" && status.claudePlan && r.providers.length === 1)}>
                            {o.m}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                  {r.env === "BACC_APP_MODEL" && <option value="off">Off (demo mode, no key)</option>}
                  <option value="__other">Another model…</option>
                  {r.saved && <option value="__default">Back to the default</option>}
                </select>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          Letta and Mem0 run in their own containers and read their keys from .env when they start. A new memory model is applied to the role agents on their next turn.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Other services</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {status.other.map((k) => (
            <KeyEditor
              key={k.env}
              k={k}
              onSave={(v) => put({ action: "key", env: k.env, value: v }, `${k.name} key saved`)}
              onRemove={() => put({ action: "removeKey", env: k.env }, `${k.name} key removed`)}
            />
          ))}
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";

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
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{k.name}</div>
          <KeyState k={k} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            {k.source === "missing" ? "Add key" : "Change key"}
          </Button>
          {k.source === "saved" && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onRemove} title="Use the key from .env again">
              Remove
            </Button>
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
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1"
            placeholder="Paste the key"
            aria-label={`${k.name} key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit">
            Save
          </Button>
          {link && (
            <a className="self-center text-xs text-primary underline" href={link} target="_blank" rel="noreferrer">
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

  if (!status) return <p className="text-muted-foreground">Loading...</p>;
  const keyFor = (p: string) => status.providers.find((x) => x.id === p)!;
  const usable = (p: string) => keyFor(p).source !== "missing";

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
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
        {status.claudePlan && <p className="text-xs text-muted-foreground">Your Claude plan is signed in, so the Claude jobs run on it first and use the Anthropic key only as a backup.</p>}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Which model does each job</h2>
        <div className="space-y-2">
          {status.roles.map((r) => {
            const options = r.providers.flatMap((pid) => keyFor(pid).models.filter((m) => r.env !== "BACC_IMAGE_MODEL" || m.startsWith("gpt-image")).filter((m) => r.env === "BACC_IMAGE_MODEL" || !m.startsWith("gpt-image")).map((m) => ({ pid, m })));
            const bare = r.letta ? r.current.replace(/^[a-z_]+\//, "") : r.current;
            const listed = options.some((o) => o.m === bare) || bare === "off" || bare === "";
            return (
              <div key={r.env} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.note}</div>
                </div>
                <NativeSelect
                  wrapperClassName="w-full sm:w-64"
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
                  {bare === "" && <NativeSelectOption value="">Default</NativeSelectOption>}
                  {!listed && <NativeSelectOption value={bare}>{bare}</NativeSelectOption>}
                  {r.providers.map((pid) => (
                    <NativeSelectOptGroup key={pid} label={`${keyFor(pid).name}${usable(pid) ? "" : " (add its key first)"}`}>
                      {options
                        .filter((o) => o.pid === pid)
                        .map((o) => (
                          <NativeSelectOption key={o.m} value={o.m} disabled={!usable(pid) && !(pid === "anthropic" && status.claudePlan && r.providers.length === 1)}>
                            {o.m}
                          </NativeSelectOption>
                        ))}
                    </NativeSelectOptGroup>
                  ))}
                  {r.env === "BACC_APP_MODEL" && <NativeSelectOption value="off">Off (demo mode, no key)</NativeSelectOption>}
                  <NativeSelectOption value="__other">Another model…</NativeSelectOption>
                  {r.saved && <NativeSelectOption value="__default">Back to the default</NativeSelectOption>}
                </NativeSelect>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
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

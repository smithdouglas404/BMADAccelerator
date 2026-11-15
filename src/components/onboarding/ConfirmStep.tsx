"use client";

import { useState } from "react";
import Link from "next/link";
import WizardSteps from "@/components/WizardSteps";
import VoiceRecorder from "@/components/VoiceRecorder";
import { patchUseCase, type UseCaseFull } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Form = Pick<
  UseCaseFull,
  | "intentDone"
  | "intentKeep"
  | "intentOutScope"
  | "customer"
  | "problem"
  | "size"
  | "needsApprovals"
  | "clientVendor"
  | "regulated"
  | "ideaStage"
  | "repoUrl"
  | "uxMode"
  | "archMode"
>;

function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`chip px-3 py-1.5 text-sm ${value === o.key ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <span className="text-sm">{label}</span>
      <Choice
        label={label}
        value={value ? "yes" : "no"}
        options={[
          { key: "no", label: "No" },
          { key: "yes", label: "Yes" },
        ]}
        onChange={(v) => onChange(v === "yes")}
      />
    </div>
  );
}

function Card({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <VoiceRecorder label="Say it" onTranscript={(t) => onChange(value ? `${value} ${t}` : t)} />
      </div>
      <Textarea className="mt-3 min-h-20 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// The BMAD intake cards. The concierge pre-fills these from the description and
// documents once it is connected; users confirm or fix them with a tap.
export default function ConfirmStep({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [f, setF] = useState<Form>({
    intentDone: data.intentDone,
    intentKeep: data.intentKeep,
    intentOutScope: data.intentOutScope,
    customer: data.customer,
    problem: data.problem,
    size: data.size,
    needsApprovals: data.needsApprovals,
    clientVendor: data.clientVendor,
    regulated: data.regulated,
    ideaStage: data.ideaStage,
    repoUrl: data.repoUrl,
    uxMode: data.uxMode,
    archMode: data.archMode,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  async function finish(step: number) {
    setBusy(true);
    await patchUseCase(data.id, { ...f, onboardingStep: step });
    setBusy(false);
    reload();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <WizardSteps current={3} />
      <section className="pop-in mt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Confirm the basics</h1>
        <p className="mt-1 text-muted-foreground">
          These are the inputs BMAD asks for first. Fill in what you can; anything left blank becomes a question
          in your Review queue.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card
            title="When this is done..."
            hint="What should be true when the work is finished?"
            value={f.intentDone}
            onChange={(v) => set("intentDone", v)}
          />
          <Card
            title="Must not change"
            hint="What has to stay exactly as it is?"
            value={f.intentKeep}
            onChange={(v) => set("intentKeep", v)}
          />
          <Card
            title="Out of scope"
            hint="What are we deliberately not doing?"
            value={f.intentOutScope}
            onChange={(v) => set("intentOutScope", v)}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card title="Who is it for?" hint="The customer or user" value={f.customer} onChange={(v) => set("customer", v)} />
          <Card title="What problem does it solve?" hint="In their words" value={f.problem} onChange={(v) => set("problem", v)} />
        </div>

        <div className="glass mt-4 grid gap-5 rounded-xl p-5 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-semibold">How big is it?</h3>
            <Choice
              label="Size"
              value={f.size}
              onChange={(v) => set("size", v)}
              options={[
                { key: "change", label: "One change" },
                { key: "epic", label: "A feature (epic)" },
                { key: "project", label: "A whole project" },
              ]}
            />
            <h3 className="pt-3 font-semibold">Where is the idea?</h3>
            <Choice
              label="Idea stage"
              value={f.ideaStage}
              onChange={(v) => set("ideaStage", v)}
              options={[
                { key: "new", label: "New product" },
                { key: "existing", label: "Change to an existing one" },
                { key: "fuzzy", label: "Still fuzzy, help me shape it" },
              ]}
            />
            {f.ideaStage === "existing" && (
              <Input
                className="mt-2 text-sm"
                placeholder="Repository link (optional)"
                value={f.repoUrl}
                onChange={(e) => set("repoUrl", e.target.value)}
              />
            )}
          </div>
          <div className="space-y-2">
            <YesNo label="Do other people need to approve it?" value={f.needsApprovals} onChange={(v) => set("needsApprovals", v)} />
            <YesNo label="Is there a separate client and vendor?" value={f.clientVendor} onChange={(v) => set("clientVendor", v)} />
            <YesNo label="Is it regulated or high risk?" value={f.regulated} onChange={(v) => set("regulated", v)} />
          </div>
        </div>

        <div className="glass mt-4 grid gap-5 rounded-xl p-5 md:grid-cols-2">
          <div>
            <h3 className="font-semibold">Design help</h3>
            <p className="mb-2 text-xs text-muted-foreground">Coaching shows you options; fast drafts it for you to review.</p>
            <Choice
              label="UX mode"
              value={f.uxMode}
              onChange={(v) => set("uxMode", v)}
              options={[
                { key: "coaching", label: "Coach me" },
                { key: "fast", label: "Fast draft" },
                { key: "handoff", label: "I have designs" },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold">Technical decisions</h3>
            <p className="mb-2 text-xs text-muted-foreground">Coaching shows alternatives for each big call.</p>
            <Choice
              label="Architecture mode"
              value={f.archMode}
              onChange={(v) => set("archMode", v)}
              options={[
                { key: "coaching", label: "Coach me" },
                { key: "fast", label: "Fast draft" },
              ]}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" disabled={busy} onClick={() => finish(1)}>
            Back
          </Button>
          <Button variant="ghost" asChild>
<Link href="/" onClick={() => patchUseCase(data.id, f)}>
            Save and exit
          </Link>
</Button>
          <Button disabled={busy} onClick={() => finish(3)}>
            Open workspace
          </Button>
        </div>
      </section>
    </main>
  );
}

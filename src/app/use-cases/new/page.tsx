"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VoiceRecorder from "@/components/VoiceRecorder";
import WizardSteps from "@/components/WizardSteps";

export default function NewUseCase() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(next: "documents" | "home") {
    if (!name.trim()) {
      setError("Give your use case a short name first.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/use-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || "Something went wrong.");
    router.push(next === "home" ? "/" : `/use-cases/${data.id}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <WizardSteps current={0} />
      <section className="glass pop-in mt-6 rounded-2xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Describe your use case</h1>
        <p className="mt-1 text-muted">
          Type it or just talk. Recording has no time limit. Stop when you like, then record again to continue
          where you left off.
        </p>

        <label className="mt-6 block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          className="field mt-1"
          placeholder="e.g. Field technician scheduling app"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="mt-5 flex items-end justify-between gap-3">
          <label className="block text-sm font-medium" htmlFor="desc">
            What do you want to build, for whom, and why?
          </label>
          <VoiceRecorder
            onTranscript={(t) => setDescription((d) => (d ? `${d.trimEnd()} ${t}` : t))}
            label={description ? "Continue talking" : "Talk instead"}
          />
        </div>
        <textarea
          id="desc"
          className="field mt-2 min-h-48"
          placeholder="A few sentences is plenty. The concierge will ask about anything missing."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className="btn btn-ghost" disabled={busy} onClick={() => create("home")}>
            Save and exit
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => create("documents")}>
            Next: documents
          </button>
        </div>
      </section>
    </main>
  );
}

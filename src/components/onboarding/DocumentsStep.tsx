"use client";

import { useState } from "react";
import Link from "next/link";
import WizardSteps from "@/components/WizardSteps";
import UploadDropzone from "@/components/UploadDropzone";
import DocumentCard from "@/components/DocumentCard";
import SkillsPicker from "@/components/SkillsPicker";
import { patchUseCase, type UseCaseFull } from "@/lib/types";

export default function DocumentsStep({ data, reload }: { data: UseCaseFull; reload: () => void }) {
  const [skills, setSkills] = useState<string[]>(data.skills.map((s) => s.skillId));
  const [busy, setBusy] = useState(false);

  async function next(step: number) {
    setBusy(true);
    await patchUseCase(data.id, { skills, onboardingStep: step });
    setBusy(false);
    reload();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <WizardSteps current={1} />
      <section className="glass pop-in mt-6 rounded-2xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Bring the documents you have</h1>
        <p className="mt-1 text-muted">
          Anything helps: decks, spreadsheets, notes, an existing PRD, designs. Each one is tagged with what it is
          and sent to the BMAD agent that uses it. You can confirm each now, or later from the Review queue.
        </p>
        <div className="mt-5">
          <UploadDropzone useCaseId={data.id} onUploaded={reload} />
        </div>
        {data.documents.length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {data.documents.map((d) => (
              <DocumentCard key={d.id} doc={d} onSaved={reload} />
            ))}
          </div>
        )}
      </section>

      <section className="glass pop-in mt-6 rounded-2xl p-6">
        <h2 className="text-xl font-semibold tracking-tight">Add skills (optional)</h2>
        <p className="mb-5 mt-1 text-muted">
          Skills from the ECC library give the agents extra know-how, for example UX or security.
        </p>
        <SkillsPicker selected={skills} onChange={setSkills} />
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Link href="/" className="btn btn-ghost" onClick={() => patchUseCase(data.id, { skills })}>
          Save and exit
        </Link>
        <button className="btn btn-primary" disabled={busy} onClick={() => next(2)}>
          Next: confirm
        </button>
      </div>
    </main>
  );
}

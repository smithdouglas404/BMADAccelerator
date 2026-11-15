"use client";

import { use, useCallback, useEffect, useState } from "react";
import type { UseCaseFull } from "@/lib/types";
import DocumentsStep from "@/components/onboarding/DocumentsStep";
import PictureStep from "@/components/onboarding/PictureStep";
import ConfirmStep from "@/components/onboarding/ConfirmStep";
import Workspace from "@/components/workspace/Workspace";

export default function UseCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<UseCaseFull | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/use-cases/${id}`, { cache: "no-store" });
    if (!res.ok) return setError("This use case could not be found.");
    setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="p-10 text-center text-muted">{error}</p>;
  if (!data) return <p className="p-10 text-center text-muted">Loading...</p>;

  if (data.onboardingStep <= 1) return <DocumentsStep data={data} reload={load} />;
  if (data.onboardingStep === 2 && !data.inspiration?.picks) return <PictureStep data={data} reload={load} />;
  if (data.onboardingStep === 2) return <ConfirmStep data={data} reload={load} />;
  return <Workspace data={data} reload={load} />;
}

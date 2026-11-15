"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VoiceRecorder from "@/components/VoiceRecorder";
import WizardSteps from "@/components/WizardSteps";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BlurFade } from "@/components/magicui/blur-fade";

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
      <BlurFade delay={0.05}>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">Describe your use case</CardTitle>
            <CardDescription>
              Type it or just talk. Recording has no time limit. Stop when you like, then record again to continue where you left off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Field technician scheduling app" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="desc">What do you want to build, for whom, and why?</Label>
                <VoiceRecorder
                  onTranscript={(t) => setDescription((d) => (d ? `${d.trimEnd()} ${t}` : t))}
                  label={description ? "Continue talking" : "Talk instead"}
                />
              </div>
              <Textarea
                id="desc"
                className="min-h-48"
                placeholder="A few sentences is plenty. The concierge will ask about anything missing."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t">
            <Button variant="ghost" disabled={busy} onClick={() => create("home")}>
              Save and exit
            </Button>
            <Button disabled={busy} onClick={() => create("documents")}>
              Next: documents <ArrowRight />
            </Button>
          </CardFooter>
        </Card>
      </BlurFade>
    </main>
  );
}

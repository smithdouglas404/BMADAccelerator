import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Describe", "Documents and skills", "Picture it", "Confirm"];

export default function WizardSteps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Setup progress">
      {STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                state === "now" && "bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15",
                state === "done" && "bg-primary/15 text-primary",
                state === "next" && "border text-muted-foreground",
              )}
              aria-current={state === "now" ? "step" : undefined}
            >
              {state === "done" ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={state === "next" ? "text-muted-foreground" : "font-medium"}>{label}</span>
            {i < STEPS.length - 1 && <span className="hidden h-px w-8 bg-border sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

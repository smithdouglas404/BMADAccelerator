const STEPS = ["Describe", "Documents and skills", "Confirm"];

export default function WizardSteps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-3 text-sm" aria-label="Setup progress">
      {STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                state === "now"
                  ? "bg-gradient-to-br from-accent to-accent2 text-white"
                  : state === "done"
                    ? "bg-accent/20 text-accent"
                    : "border border-line text-muted"
              }`}
              aria-current={state === "now" ? "step" : undefined}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className={state === "next" ? "text-muted" : "font-medium"}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px w-8 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

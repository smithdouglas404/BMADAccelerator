// Where a build's time goes. Each tool call Claude Code makes is sorted into a phase; the time until the
// next call counts toward that phase. Plain code, no AI: it only reads tool names and their inputs.

export type BuildPhase = "Setup and installs" | "Design and images" | "Writing the app" | "Building and running" | "Screenshot checks" | "Reading the package" | "Other";

export function phaseOf(name: string, input: Record<string, unknown>): BuildPhase {
  const cmd = String(input.command ?? "");
  const file = String(input.file_path ?? input.path ?? "");
  if (name === "Bash") {
    if (/shot|screenshot|playwright/i.test(cmd)) return "Screenshot checks";
    if (/\b(npm|pnpm|yarn) (i|install|ci|add)\b|shadcn@?\S* (init|add)/i.test(cmd)) return "Setup and installs";
    if (/\b(npm run build|npm start|npm run dev|vite|tsc|node )/i.test(cmd)) return "Building and running";
    return "Other";
  }
  if (/make_image/.test(name) || /studio\/design\//.test(file)) return "Design and images";
  if (name === "Read" && /\.(png|jpe?g|webp)$/i.test(file)) return "Screenshot checks";
  if ((name === "Write" || name === "Edit" || name === "MultiEdit") && /(^|\/)app\//.test(file)) return "Writing the app";
  if (/shadcn/.test(name)) return "Setup and installs";
  if (name === "Read" || name === "Glob" || name === "Grep" || name === "Skill") return "Reading the package";
  return "Other";
}

export function buildTimer(start = Date.now()) {
  const calls: { at: number; phase: BuildPhase }[] = [];
  return {
    tool(name: string, input: Record<string, unknown>, at = Date.now()) {
      calls.push({ at, phase: phaseOf(name, input) });
    },
    report(end = Date.now()) {
      const totals = new Map<BuildPhase, number>();
      const add = (p: BuildPhase, ms: number) => totals.set(p, (totals.get(p) ?? 0) + Math.max(0, ms));
      if (calls.length) add("Reading the package", calls[0].at - start);
      calls.forEach((c, i) => add(c.phase, (calls[i + 1]?.at ?? end) - c.at));
      const totalMs = end - start;
      const phases = [...totals.entries()]
        .map(([phase, ms]) => ({ phase, minutes: Math.round(ms / 6000) / 10, share: totalMs ? Math.round((ms / totalMs) * 100) : 0 }))
        .sort((a, b) => b.minutes - a.minutes);
      return { minutes: Math.round(totalMs / 6000) / 10, toolCalls: calls.length, phases };
    },
  };
}

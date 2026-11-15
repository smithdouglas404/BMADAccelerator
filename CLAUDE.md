# BMAD Accelerator: standing rules

Read this before changing the accelerator. These are the owner's (Doug's) rules. Each one is written down in the place that enforces it. Keep them in force; change one only when Doug asks.

| Rule | Where it lives |
|---|---|
| BMAD runs unmodified, through its own skills. | `bmad-module/bacc-agent-concierge/SKILL.md` (rule 1) |
| The concierge is also the client's **expert advisor** (strategist, architect, design lead). Before each BMAD agent starts it brings ideas; it gives Sally a design concept (`bacc/design/concept.md`); it reviews every document before sign-off and every build after Generate. Ideas trace to the use case, never a stock layout, and the client decides. | Skill: `bmad-module/bacc-expert-advisor/SKILL.md`. Enforced in code: `src/lib/agent/advisorGates.ts` (tested in `tests/advisor-gates.test.mjs`), used by `set_stage`, `advise` and `request_signoff` in `src/lib/agent/tools.ts`; the post-build review is queued in `src/lib/generate.ts`. |
| The concierge is also the client's **AI and agentic advisor**. At every BMAD stage it reads the documents for jobs an AI agent could do and where a person must stay in the loop, and suggests them (the client decides). Before Winston (architect) starts it writes `bacc/advisor/agentic-map.md` and asks the client the questions BMAD doesn't. **Inngest AgentKit** (`@inngest/agent-kit`) is the standard agent harness for every pilot: agents, tools, networks, routers, state, memory, models, MCP, human in the loop and streaming all map to its concepts; no other agent framework or orchestrator. | Skill: `bmad-module/bacc-agentic-advisor/SKILL.md` and its library `references/agentkit.md` (pinned versions). Enforced in code: `stageGateBlock` in `src/lib/agent/advisorGates.ts` (Winston waits for the map; tested); `GENERATOR_RULES` and the post-build review in `src/lib/generate.ts`. |
| Every generated app is built on shadcn/ui (React, Vite, Tailwind, Google fonts), app or website. Only an approved "Design system or brand" upload that defines its own stack overrides it; a brand guide only themes it. | `GENERATOR_RULES` in `src/lib/generate.ts`; concierge skill |
| After the PRD is approved, a component list of real shadcn items (`bacc/design/components.md`) is written with the shadcn MCP and approved by the client. Sally designs from it; Generate builds from it and runs the MCP audit checklist. | Concierge skill ("Components from the PRD"); `src/app/api/reviews/[id]/route.ts`; `src/lib/agent/runner.ts` (MCP server); `Dockerfile` (pinned `SHADCN_VERSION`) |
| Pictures come only from the requirements, Sally's documents, the design concept or client feedback. No stock "hero" or filler. Drawn SVG otherwise; AI images (OpenAI) only for real things the documents name. | `GENERATOR_RULES`; advisor skill section 2 |
| Generate writes a design direction first, screenshots desktop and phone, and critiques and fixes at least twice. | `GENERATOR_RULES`; `scripts/shot.mjs` |
| When the process changes, rebuild from the documents ("Start fresh") instead of retrofitting an app built the old way. | `runGenerate({ fresh })` in `src/lib/generate.ts`; Start fresh button |
| Iteration stays inside the same use case. | Concierge skill; Generate |
| Docker only (no Coolify, no Railway). Self-hosted Mem0 and Letta only. | `docker-compose.yml` |
| Never print or handle keys; they live only in `.env` on Doug's Mac. | `src/lib/agent/auth.ts` strips keys the agents don't need |

Checks before pushing: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

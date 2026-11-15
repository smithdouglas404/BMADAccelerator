# BMAD Accelerator

Takes a use case from a spoken or typed idea to a production-ready pilot, using the
[BMAD Method](https://docs.bmad-method.org) v7 unmodified underneath.

## Run with Docker

```bash
cp .env.example .env   # add ELEVENLABS_API_KEY and ANTHROPIC_API_KEY
./scripts/memory-secrets.sh   # once: creates the Mem0 and Letta passwords in .env
docker compose up -d --build
```

Open http://localhost:3000. Database migrations run on start. Use case workspaces
(BMAD output and uploads) are kept in the `workspaces` volume.

## Develop locally

```bash
npm install
cp .env.example .env   # point DATABASE_URL at a local Postgres 16
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000. Each use case's generated app runs on its own port
(4100 to 4129), so it has its own link, such as http://localhost:4100.

## Keys and models

Open **Settings > Models and keys** to add your Anthropic, OpenAI and Gemini keys (and ElevenLabs and Linear), and to pick the model for each job: the BMAD agents, Generate, the document reader, pictures, agent memory and the AI agents inside generated apps. A model needs its provider's key. Keys are stored encrypted, shown only by their last four characters, and take effect straight away. Keys in `.env` still work and are used when nothing is saved on the page.


| Key | What it turns on |
|---|---|
| `ANTHROPIC_API_KEY` | The concierge, the BMAD agents, the document agent and Generate |
| `ELEVENLABS_API_KEY` | Voice input and read aloud (`ELEVENLABS_VOICE_ID` picks the voice) |
| `LINEAR_API_KEY` | Optional live Linear sync (pick Linear and a team key in Settings) |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Optional Export to Jira |

## What it does

- **Intake:** voice with no time limit or typing, unlimited uploads, ECC skills picker.
- **Document agent:** summarizes and tags each upload with a BMAD type for you to approve.
- **Concierge:** speaks for you to BMAD's agents, explains each question in plain words,
  asks one question at a time and checks vague answers. The screen shows who is speaking.
- **BMAD, unmodified:** BMAD v7, TEA and CIS are pinned (`scripts/fetch-vendor.sh`) and
  installed into each use case's workspace with BMAD's own setup script.
- **Kanban:** reads and writes BMAD's ticket tree through Sofia's `tickets.py`. Moving a
  card asks whether you want to give an update.
- **Generate:** any time. Claude Code builds the app from BMAD's documents, writes notes
  back for the BMAD agents, and rebuilds from what changed since last time.
- **Mark up:** circle, box or cross out parts of the live app, say what to change, and it
  becomes a backlog card for Sofia.
- **Trackers:** optional Linear sync and Export to Jira.
- **Skills:** upload your own skills (checked with BMAD's validator) and turn them on.
- **Memory across use cases:** self-hosted Mem0 and Letta (open source), in the same Docker
  setup. See below.

## The expert advisor

The concierge is also the client's expert advisor: a product strategist, architect and design lead. Before each BMAD agent starts it brings two or three ideas of its own, it gives Sally a design concept with two or three directions (`bacc/design/concept.md`), it reviews every document before sign-off, and it reviews every build after Generate. The client decides on every idea. The tools enforce it: a handover waits for the advice, Sally waits for the concept, and a sign-off needs the advisor's review. See `bmad-module/bacc-expert-advisor/SKILL.md` and `CLAUDE.md` for the standing rules.

## The AI and agentic advisor

At every BMAD stage the concierge also reads the documents for jobs an AI agent could do and the steps where a person must stay in the loop, and suggests them. Before Winston (architect) starts it writes `bacc/advisor/agentic-map.md` and asks the client the questions BMAD doesn't (autonomy, approvals, what happens on a timeout). Winston waits for the map.

Every pilot that uses agents is built on [Inngest AgentKit](https://agentkit.inngest.com) (`@inngest/agent-kit`): agents, tools, networks, routers, state, memory, models, MCP, human in the loop and streaming all map to its concepts, with no other framework. The AgentKit docs and examples are pinned in `scripts/fetch-vendor.sh` and copied into each workspace at `.claude/skills/bacc-agentic-advisor/library/`, so the advisor and Generate read the same library. Postgres is added only when the documents need a database (PGlite, in process).

A generated app gets none of the accelerator's keys, with one exception: a model key for its own agents, chosen by `BACC_APP_LLM` (`openai` by default, `anthropic`, or `off`). Without a key the app runs its agents in demo mode.

## How generated apps are designed

- **Picture it** (setup step 3): Claude researches products like the use case and offers clickable features and three visual directions, each with a small rendered preview. The picks go into `bacc/intake.md` for John, Sally and Generate.
- **Base design system:** every app is built on [shadcn/ui](https://ui.shadcn.com) (React, Vite, Tailwind CSS, Google fonts), themed to the use case's design direction. A client's own design system replaces it when they upload one.
- **Component list:** the official shadcn MCP server (`shadcn mcp`, pinned in the image as `SHADCN_VERSION`) is connected to every agent turn. When the PRD is approved, John matches each screen and requirement to real shadcn/ui components, blocks and charts in `bacc/design/components.md`, which you approve in Documents. Sally designs from it and Generate builds from it, then runs the MCP's audit checklist. `BACC_SHADCN_MCP=0` turns the server off.
- **Design pass:** Generate loads Anthropic's `frontend-design` skill and ECC's `frontend-design-direction`, writes `bacc/design/direction.md` before coding, then screenshots desktop and phone (`scripts/shot.mjs`), critiques and fixes until it looks finished.
- **Images:** drawn as SVG, except where the requirements and UX documents call for real-looking pictures (for example a shop's products): those use OpenAI's image model through the `make_image` tool, on `OPENAI_API_KEY`, at most `BACC_IMAGE_LIMIT` (12) per Generate. `BACC_IMAGES=off` turns them off.
- **Redesign:** keeps every feature and rebuilds the look from a fresh direction.

## Running on your Claude subscription

If you're the only person using the accelerator, the BMAD agents, the concierge, Generate and
the document agent can run on your own Claude plan instead of API credit. Run `claude setup-token`
and put the token in `.env` as `CLAUDE_CODE_OAUTH_TOKEN`. By default the plan is used first, and
when its usage limit is reached the same turn continues on `ANTHROPIC_API_KEY`
(`BACC_CLAUDE_AUTH=plan` waits for the reset instead). Letta still uses the API key (Haiku), and
Mem0 uses OpenAI. When other people use the accelerator, use an API key: a personal plan isn't
for powering other people's use.

## Agent memory (Mem0 + Letta)

The same pattern as the owner's other agent systems: **Mem0 is the long-term memory**, and
**Letta is each BMAD role's working mind**. Both run in Docker next to the app, configured like
the owner's other Mem0 and Letta: Mem0 uses OpenAI (`gpt-5-mini`, Mem0's default, to distill lessons,
`text-embedding-3-small` for embeddings), so `.env` needs `OPENAI_API_KEY`. Letta's role agents
think with Claude Haiku and embed with `openai/text-embedding-3-small`.

- **Remember:** every answer to an agent's question, document approval, sign-off, piece of screen
  feedback and build is saved to Mem0 with the same labels (`src/lib/memory/contract.ts`:
  app `bmad-accelerator`, an agent id per role, a kind, the use case).
- **Recall:** before each agent turn the app searches Mem0 across the other use cases and reads
  each role's top lessons from Letta, and hands both to the agents in `<retrieved_context>`.
- **Ask:** the agents can search memory, ask a role's Letta agent what it remembers, and save a lesson.
- **Learn:** after a sign-off or a build, the role's Letta agent saves general lessons to Mem0;
  the app copies each role's best lessons into its `top_lessons` block (also daily).
- **See it:** Settings > Memory shows both services, a search over what earlier use cases taught,
  and each role's lessons.

BMAD's own files stay the source of truth inside a use case; memory carries lessons between them.
If Mem0 or Letta is down, the app works as before.

## Testing without keys

`BACC_FAKE_AGENT=1` swaps the agents for a scripted stand-in so the whole flow can be
exercised without an Anthropic key.

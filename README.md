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

## Keys (in `.env`)

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

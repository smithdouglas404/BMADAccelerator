# BMAD Accelerator

Takes a use case from a spoken or typed idea to a production-ready pilot, using the
[BMAD Method](https://docs.bmad-method.org) v7 unmodified underneath.

## Run with Docker

```bash
cp .env.example .env   # add ELEVENLABS_API_KEY and ANTHROPIC_API_KEY
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

## Testing without keys

`BACC_FAKE_AGENT=1` swaps the agents for a scripted stand-in so the whole flow can be
exercised without an Anthropic key.

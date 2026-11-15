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

## What's in step 1

- Use case intake: voice (no time limit) or typing, unlimited uploads, ECC skills picker.
- Document review: each upload gets a suggested BMAD document type to approve or edit.
- Workspace: process rail, conversation, documents panel, live Kanban that reads
  BMAD's ticket tree, and the review queue.
- Settings: tracker choice, Export to Jira (confirm step), skill install targets,
  modules, team rules, agents.

Stubbed until later steps: the concierge and BMAD agents (step 2), Generate and live
preview (step 3), visual markup and tracker sync (step 4), Jira publishing, and skill upload.

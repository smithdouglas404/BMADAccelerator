# Working Backwards Studio

Takes any product from a few spoken or typed lines (plus whatever decks, business cases and
spreadsheets you have) to a validated use case, a living PRD and TRD, a working prototype built by
Claude Code, and a pilot. The Muse leads the conversation; its specialists (business analyst,
solution architect, product engineer, UX/UI designer and a domain expert for the product's field)
join in visibly, and several people can work on one product, each in their own role.

The screens are the design team's Agentic Working Backwards Studio v6, used as is: their
`src/studio/styles.css`, `data.ts`, `spec.ts` and `generation.ts` are byte-identical to their drop,
and everything added sits in separate files (`studio-extras.css`, `extras.tsx`, `flow.tsx`,
`pages.tsx`, `settings.tsx`, `vibe.tsx`, `live.ts`).

## Run with Docker

```bash
cp .env.example .env
./scripts/memory-secrets.sh   # once: creates the Mem0 and Letta passwords in .env
docker compose up -d --build
```

Open http://localhost:3000. Database migrations run on start. Each product's workspace (uploads,
package, generated app) is kept in the `workspaces` volume, and each generated app runs on its own
port (4100 to 4129).

## Develop locally

```bash
npm install
cp .env.example .env   # point DATABASE_URL at a local Postgres 16
npx prisma migrate dev
npm run dev
```

Checks before pushing: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

## How a product moves

1. **New product:** one box, typed or spoken, plus any documents (decks, business cases,
   spreadsheets, PDFs, notes, screenshots). The Muse names it, works out what kind of product it is,
   lays out everything the leading products of that kind have (the floor, marked inferred or
   recommended, never silently approved), starts a first version and asks the one question that
   matters most, with numbered options.
2. **Work with Muse:** answer with a number, a yes, or your own words, typed or by voice (press the
   mic, talk as long as you like, press again; it's cleaned into written language). A yes or a number
   is an approval at once, with Undo. Anything else is held in the backlog in your words. Click a
   specialist in the Muse's team to ask them directly. Checkpoints (what only a person may decide)
   wait with Approve and Reject and a comment.
3. **Prove it:** validation signals, evidence from uploads and research, and one honest readiness
   number made of named factors.
4. **See it:** Try & mark up is the live product, full width: click or circle a part, say what
   should change, and it becomes the next build's input, traced into the spec.
5. **Ship it:** Build it with Claude Code (on your Claude plan), or download the Claude Code ZIP;
   push the spec to Git and sync to Linear; trace every build move.

The next-best-move banner at the top always says what is worth doing next.

## Keys and models

**Settings > Models and keys** holds the Anthropic, OpenAI, Gemini, ElevenLabs and Linear keys and
the model for each job. Keys are stored encrypted and shown only by their last four characters.
Keys in `.env` still work when nothing is saved there. The Muse, its specialists, Claude Code and
document reviews run on the owner's Claude plan (`CLAUDE_CODE_OAUTH_TOKEN`).

Settings also has **Connectors** (MCP servers for all products or one, secrets encrypted and never
sent to the browser) and **Skills** (upload `.skill`, `.zip` or `.md`; the working-backwards-studio,
studio-muse and studio-agentkit skills ship by default).

A generated app never gets the Studio's keys, except one model key for its own Inngest AgentKit
agents (`BACC_APP_LLM`: `openai` by default, `anthropic`, `gemini`, or `off` for demo mode).

## Agent memory (Mem0 + Letta)

Self-hosted, open-source Mem0 (long-term memory; OpenAI for its model and embeddings) and Letta
(each role's working mind; Claude Haiku) run in Docker next to the app. Lessons carry between
products (`app_id` `working-backwards-studio`); a product's own database stays its source of truth.
If either service is down, the Studio works as before.

## Testing without keys

`BACC_FAKE_AGENT=1` swaps the Muse and its team for a scripted stand-in, so every screen can be
exercised without a Claude sign-in. `docs/ACCEPTANCE.md` lists every requirement from the design
team and from Doug, word for word, with where it lives.

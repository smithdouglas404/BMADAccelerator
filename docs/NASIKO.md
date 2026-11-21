# Nasiko (self-hosted) and the Studio

Nasiko is an open-source runtime for agents (Apache 2.0): one registry of agents, access control, a tool gateway, a model router, and cost and traces per agent. The Studio links to **your own** Nasiko, never the cloud one: Nasiko Cloud takes only a login that expires, so a server like the Studio cannot hold a lasting connection to it.

## Start it

`scripts/nasiko-up.sh` (from the Studio folder). It fetches the pinned Nasiko source into `vendor/nasiko`, writes `.env.nasiko` with fresh random passwords (never commit it), starts Nasiko as its own Docker project (`bacc-nasiko`) and connects the Studio. **Host port 8480 only**; the Studio's 3000, 41xx, 8288 and 8300 are untouched, and Nasiko's database, cache and trace backends are not published. Change the port with `NASIKO_PORT`. On Podman set `NASIKO_URL_FROM_STUDIO=http://host.containers.internal:8480`.

## What the Studio does with it

- **Settings > Nasiko**: address, the Studio's sign-in (password stored encrypted, last four only, kept in its own table so Claude Code runs and generated apps never get it), live health from Nasiko's own `/health`, `/readiness` and `/metrics`, the agents registered, and 7-day cost from TokenOps.
- **Sign-in**: a Nasiko session lasts 7 days with no refresh. The Studio signs in again after 6 days, and on any 401.
- **Registers every agent** by its address with an open A2A agent card (`POST /api/agents` in Nasiko, `PUT` to update): Socra, the specialists, the validator and researchers, each product's domain expert (the "Claims expert" its conversation named) and each product's approved agents. All read from real records (`src/lib/nasiko/agents.ts`).
- **The Studio's A2A door** `/api/a2a/<name>` (`message/send`, `tasks/get`, and the card at `/.well-known/agent-card.json`): local callers only (the tunnel and public hosts get 403). A message to Socra or a specialist goes into the named product's conversation as an outside agent's (same rules as the screens); the answer is that agent's next statement. A product agent's message becomes a run in the shared agent service, with its approvals as usual.
- **If Nasiko is down** nothing in the Studio changes: no Studio agent call goes through Nasiko. Routing calls through it comes later, one agent at a time.

## Reaching agents on GCP or Railway

Nasiko registers an agent by URL and forwards through its own proxy (access rules, loop limit, audit, traces). A public address needs no setting. Nasiko needs a Docker host (it starts agent containers through the Docker socket), so for agents elsewhere run this same stack on a small VM behind HTTPS and set its address in Settings > Nasiko. Unconfirmed from the docs: whether a URL-registered agent gets its own credential for Nasiko's model router and tool gateway.

# Nasiko (self-hosted) and the Studio

Nasiko is an open-source runtime for agents (Apache 2.0): one registry of agents, access control, a tool gateway, a model router, and cost and traces per agent. The Studio links to **your own** Nasiko, never the cloud one: Nasiko Cloud takes only a login that expires, so a server like the Studio cannot hold a lasting connection to it.

## Start it

`scripts/nasiko-up.sh` (from the Studio folder). It fetches the pinned Nasiko source into `vendor/nasiko`, writes `.env.nasiko` with fresh random passwords (never commit it), starts Nasiko as its own Docker project (`bacc-nasiko`) and connects the Studio. **Host port 8480 only**; the Studio's 3000, 41xx, 8288 and 8300 are untouched, and Nasiko's database, cache and trace backends are not published. Change the port with `NASIKO_PORT`. On Podman set `NASIKO_URL_FROM_STUDIO=http://host.containers.internal:8480`.

## What the Studio does with it

- **Settings > Nasiko**: address, the Studio's sign-in (password stored encrypted, last four only, kept in its own table so Claude Code runs and generated apps never get it), live health from Nasiko's own `/health`, `/readiness` and `/metrics`, the agents registered, and 7-day cost from TokenOps.
- **Sign-in**: a Nasiko session lasts 7 days with no refresh. The Studio signs in again after 6 days, and on any 401.
- **Registers every agent** by its address with an open A2A agent card (`POST /api/agents` in Nasiko, `PUT` to update): Socra, the specialists, the validator and researchers, each product's domain expert (the "Claims expert" its conversation named) and each product's approved agents. All read from real records (`src/lib/nasiko/agents.ts`).
- **The Studio's A2A door** `/api/a2a/<name>` (`message/send`, `tasks/get`, and the card at `/.well-known/agent-card.json`): local callers only (the tunnel and public hosts get 403). A message to Socra or a specialist goes into the named product's conversation as an outside agent's (same rules as the screens); the answer is that agent's next statement. A product agent's message becomes a run in the shared agent service, with its approvals as usual.
- **MCP**: Settings > Nasiko > "Tools Nasiko lists" registers the Studio's own connector (`/api/mcp`) in Nasiko's MCP gateway with a **look-only** key (a bearer token minted by the Studio and stored only inside Nasiko's write-only credential store; never in a URL, never shown). Nasiko lists the tools it reports. The gateway refuses private addresses unless `MCP_ALLOW_PRIVATE_URLS=true`, which `docker-compose.nasiko.yml` sets (a public Studio address needs no such setting). Press "Connect the Studio's tools" again at any time; it is safe to repeat.
- **If Nasiko is down** nothing in the Studio changes: no Studio agent call goes through Nasiko. Routing calls through it comes later, one agent at a time.

## Reaching agents on GCP or Railway

Nasiko registers an agent by URL and forwards through its own proxy (access rules, loop limit, audit, traces). A public address needs no setting. Nasiko needs a Docker host (it starts agent containers through the Docker socket), so for agents elsewhere run this same stack on a small VM behind HTTPS and set its address in Settings > Nasiko. Unconfirmed from the docs: whether a URL-registered agent gets its own credential for Nasiko's model router and tool gateway.

## Tested against real Nasiko (Nov 21, pinned 0ed4b3d)

Works: sign-in, all agents registered (POST /api/agents), MCP connector registered and its tools listed. The Studio's A2A door answers the card, `message/send` and `tasks/get` for a caller on Docker's network.

Does not work in this Nasiko version: its `/api/agents/<id>` proxy cannot forward to an agent that is only registered by URL. The resolver asks the Docker runtime for a container for the agent, gets "Unknown" and answers 503 ("agent workload is not running") before it ever tries the stored address. Setting the status to `running` does not change that. So a call routed *through* Nasiko to a Studio agent needs either Nasiko to learn to fall back to the stored URL for agents with no image, or a small forwarding container per agent. Until then the agents are in Nasiko's registry and the Studio's door is ready for any A2A caller; Nasiko's own proxy, access rules and traces do not yet apply to them.

## Opening Nasiko's dashboard from another computer (prepared in the repo; live only after the router is restarted)

Settings > Enterprise Harness has an "Open Nasiko" button. On the Mac it opens `http://localhost:8480`. From any other address it opens `https://p8480.<your domain>`, built from the address in the browser, the same way product previews open (`previewUrl`). The wildcard Cloudflare route already sends `p8480.<domain>` to the preview router, but the router only serves ports 4100-4129, so today that address answers 404. To serve Nasiko through it, the router would need one more `server` block (and `extra_hosts: host.docker.internal:host-gateway` on the `preview-router` service):

```
server {
  listen 8080;
  server_name ~^p8480\.innume\.com$;
  location / { proxy_pass http://host.docker.internal:8480; proxy_http_version 1.1; proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $conn_up; }
}
```

This block is now in connector-gate/preview-router.conf (plus `extra_hosts` on `preview-router` in docker-compose.yml). It goes live only when the router is restarted (`docker compose --profile public up -d preview-router`), which needs the owner's OK. Security note: the public Studio has no sign-in on the Mac, so Nasiko's own admin password would be the only lock on a runtime whose server holds the Docker socket. Put Cloudflare Access (email sign-in) in front of `p8480` before opening it.

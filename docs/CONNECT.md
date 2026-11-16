# Connect to the Studio from an assistant

The Studio can be used from Claude, ChatGPT, Meta Muse or a script. The same 13 tools are offered in two forms:

| Form | Address | For |
|---|---|---|
| MCP connector (Streamable HTTP, OAuth) | `https://<your studio>/api/mcp` | Claude (claude.ai, Desktop, Code), ChatGPT, any MCP client |
| REST API (OpenAPI 3.1) | `https://<your studio>/api/v1/openapi.json` | Meta Muse custom connectors, custom GPT actions, scripts |

Both addresses are shown, with copy buttons, on **Settings > Connect**.

## The tools

They can look: list use cases, what's waiting on me, brief me, why did this change, read the spec, backlog or board, and agent status.

They can change: capture a thought, add evidence, start a use case, answer Socra, approve or reject, change an earlier choice, and build the next version.

## The rules

- **Look only by default.** Making changes has to be allowed when you connect, and a Viewer can never make changes.
- **Asks before acting.** Approving, rejecting, building, withdrawing, reopening a decision and sending a card back all return a preview first ("this would approve X, which touches PRD sections Y and Z"). The assistant must show you the preview and send `confirm: true` only after you say yes.
- **A bare "yes" or a number sent to Socra is an approval**, so it is confirmed first too.
- **One customer, or all.** Access is either for one customer's use cases or for every customer's. An id from another customer answers "not found".
- **Every call is logged** on Settings > Connect: who made it, which tool, and how it ended.
- **Changes are recorded in your name.** Every change lands in the Product Truth Graph as "Doug (via Claude)", and Socra carries it through the spec exactly as if you had made it on screen.
- **Tokens are shown once.** Only a hash of each token is stored. Remove access on Settings > Connect at any time.

## Step 1: give the Studio a public address

This step is only needed for assistants on the web: claude.ai, ChatGPT and Meta Muse. They can't reach `localhost`.

Claude Desktop and Claude Code on the same Mac can skip this step and use `http://localhost:3000/api/mcp`.

1. Put the Studio behind an https address. For example, use a Cloudflare Tunnel to your own domain.
2. Set `STUDIO_PUBLIC_URL=https://studio.example.com` in `.env`.
3. Restart the stack with `docker compose up -d`.

> **Warning:** the Studio has no sign-in of its own yet. Anyone who can open the public address can use the whole Studio, not only the connector. Before you open it to the internet, protect the address, for example with Cloudflare Access on your email. The connector's own sign-in is safe on its own: it needs a connect code from Settings > Connect.

### The easy way: the public door (Cloudflare quick tunnel, no account)

```
docker compose --profile public up -d
scripts/public-address.sh      # prints the address and the two connector addresses
```

This starts two small containers. `connector-gate` lets only the connector's addresses through (`/api/mcp`, `/api/v1/`, `/oauth/`, `/api/oauth/`, `/.well-known/` and the sign-in page's files). Everything else, including every Studio screen, answers 404 on the internet, so the Studio's missing sign-in is not exposed. `tunnel` connects it to the internet. Requests are limited to about 10 a second per visitor.

The address looks like `https://something-random.trycloudflare.com` and **changes whenever the tunnel container restarts** (a Mac restart, or Docker restarting). Run `scripts/public-address.sh` again and update the connector. For an address that never changes, use a named Cloudflare Tunnel on your own domain and set `STUDIO_PUBLIC_URL`.

## Claude (claude.ai, Desktop)

1. Go to **Settings > Connectors > Add custom connector**.
2. Paste the MCP address.
3. Claude opens the Studio's sign-in page. There:
   - enter your name and role;
   - choose which customer it may see;
   - choose "Look only" or "Look and make changes".
4. On the Studio, open **Settings > Connect** and press **Make a connect code**. Type the code on the sign-in page. The code works once, for ten minutes.
5. Press **Allow**.

Then try asking: "What's waiting on me in the Studio?"

## Claude Code

Run `claude mcp add --transport http studio http://localhost:3000/api/mcp`, then sign in from `/mcp` in the same way.

## ChatGPT

In developer mode, add a connector with the MCP address and OAuth. The sign-in is the same as for Claude.

## Meta Muse (custom connector)

Meta Muse uses the REST API.

1. Make a token on **Settings > Connect > Make a token**:
   - name it "Meta Muse";
   - choose whose name it acts in, the role, the customer, and look only or make changes;
   - copy the token. It is shown only once. Put it straight into the connector's settings and never paste it into a chat.
2. In Meta Muse, create a custom connector from the OpenAPI address.
3. Choose **Bearer token** auth and paste the token.
   - If Meta Muse asks for OAuth instead, the spec also describes it. The authorization URL is `/oauth/authorize` and the token URL is `/oauth/token`, with PKCE.
4. Optionally, send an `X-Client-Name: Meta Muse` header so the log names it.

A call that needs confirming answers **202** with `needs_confirmation` and a preview. Send the same call again with `"confirm": true` after the person says yes.

No submission to Meta's connector platform has been made. This is a private custom connector.

### Having Muse bring you Socra's questions

Muse can't be pushed to, so it checks on a schedule. Give it this instruction once the connector is made:

> Every 15 minutes, call the Socra Studio connector's `whats_waiting` tool. For every question waiting, tell me the product name, Socra's question and its numbered options, and which one Socra suggests. When I answer, call `answer` with that product's `use_case_id` and my words (a number picks that option). If `answer` comes back needing confirmation, show me the preview and send the same call again with `confirm: true` only after I say yes. Don't approve, build or withdraw anything unless I ask for it in that message.

The token needs "Look and make changes" for `answer` to work.

## Scripts

```
curl -s -X POST https://studio.example.com/api/v1/whats_waiting \
  -H "Authorization: Bearer $STUDIO_TOKEN" -H "Content-Type: application/json" -d '{}'
```

## Questions sent to you

On **Settings > Connect > Notify me**, choose where the Studio sends what's waiting on you. It can send to an email address, a Slack incoming webhook, or any webhook (JSON).

The Studio sends:
- a new question from Socra or a specialist, with its numbered options;
- a checkpoint that needs Approve or Reject;
- a card that is ready for you to try.

Each one comes with a link. Things that arrive together come as one message, and nothing is sent twice. Answer in the Studio or from a connected assistant: a number is enough.

Email needs a sending account first. Add the SMTP address under Settings > Models and keys, for example `smtps://you%40gmail.com:app-password@smtp.gmail.com:465` with a Gmail app password.

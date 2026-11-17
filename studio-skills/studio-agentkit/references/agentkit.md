# Inngest AgentKit: the Studio's standard agent harness

Docs: https://agentkit.inngest.com. **The full docs and examples are in this skill's `library/` folder** (pinned to release 0.13.2, copied into every workspace): `library/docs/` (concepts, advanced-patterns, streaming, reference, getting-started) and `library/examples/` (`agentkit-starter`: a Next.js chat with Postgres history, streaming and a shadcn/ui interface; `support-agent-human-in-the-loop`; `mem0-memory`; `realtime-ui-nextjs`; `use-agent`; `mcp-neon-agent`; `quick-start`). Read the page for a concept before you use it; don't write AgentKit from memory. Checked 2026-11-15: `@inngest/agent-kit` 0.13.2, `inngest` 4.26.2, `inngest-cli` 1.53.0. Pin these exact versions in generated apps; check the docs when a newer one is needed.

## Why this one

One library covers what a pilot needs to show a real agentic system: agents, tools, multi-agent networks with routers, shared state, model adapters for Anthropic, OpenAI, Gemini, Grok and any OpenAI-compatible model, history and memory, MCP servers as tools, human in the loop, streaming to the UI, and durable retries through Inngest. Locally it runs with the free Inngest dev server, so a pilot needs no extra hosted service.

## Concepts and their code

```ts
import { createAgent, createTool, createNetwork, createState, anthropic, openai, gemini } from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";
import { Inngest } from "inngest";
import { z } from "zod";
```

**Agent**: a stateless unit with a goal. `description` is required when it is in a network (the routing agent reads it).
```ts
const curator = createAgent({
  name: "claim-triager",
  description: "Suggests a priority and an adjuster for a new claim, never assigning one with a conflict of interest.",
  system: "You triage insurance claims ...",
  model: anthropic({ model: "claude-haiku-5-5", defaultParameters: { max_tokens: 1000 } }), // Anthropic needs max_tokens
  tools: [findAdjusters, saveTriage],
});
```

**Tool**: what an agent can do. Zod parameters; the handler gets `{ network, step, agent }`.
```ts
const findAdjusters = createTool({
  name: "find_adjusters",
  description: "Adjusters for a claim type, excluding anyone with a conflict",
  parameters: z.object({ claimType: z.string(), exclude: z.array(z.string()) }),
  handler: async ({ claimType, exclude }, { network }) => {
    const rows = db.adjustersFor(claimType, exclude);   // plain code does the conflict rule, not the model
    network.state.data.candidates = rows;
    return rows;
  },
});
```

**MCP servers as tools**: tools are namespaced by the server name (`neon-createBranch`). Transports `ws`, `sse`, `streamable-http`.
```ts
createAgent({ name: "ops", system: "...", mcpServers: [{ name: "neon", transport: { type: "streamable-http", url: process.env.NEON_MCP_URL! } }] });
```

**Network, state and router**: agents in a loop until the router returns `undefined`.
```ts
interface TriageState { claim?: Claim; candidates?: Adjuster[]; triageId?: string; approved?: boolean }
const network = createNetwork<TriageState>({
  name: "triage-claim",
  agents: [curator, checker],
  defaultModel: modelFromEnv(), // see "Model key" below
  router: ({ network, callCount }) => {           // code router: fixed order
    if (!network.state.data.triageId) return curator;
    if (network.state.data.approved === undefined) return checker;
    return undefined;                               // done
  },
});
await network.run("Triage this claim", { state: createState<TriageState>({ claim }) });
```
Routers: a **code router** (function, as above) when the order is fixed; a **routing agent** (`createRoutingAgent`) when an LLM should choose the next agent from their descriptions; **hybrid** (code for the fixed steps, the routing agent for the judgement call).

**Models**: `anthropic()`, `openai()`, `gemini()`, Grok, or any OpenAI-compatible endpoint, chosen per agent or as the network's `defaultModel`. Keys come from the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`). Never write a key into code, logs or the UI.

**History and memory**: pass `history: { createThread, get, appendUserMessage, appendResults }` to the agent or network, storing threads and messages in SQLite or Postgres; run with `createState({...}, { threadId })`. Long-term memory goes through tools (create, recall, update, delete), sent as Inngest events for durability.

**Human in the loop**: a tool that waits for an event. Needs the network to run inside an Inngest function.
```ts
const askSenior = createTool({
  name: "ask_senior_adjuster",
  description: "Ask a senior adjuster to approve a triage above the payout limit",
  parameters: z.object({ triageId: z.string(), reason: z.string() }),
  handler: async ({ triageId, reason }, { step }) => {
    if (!step) return { error: "needs step context" };
    db.markAwaitingApproval(triageId, reason);          // what the person sees in the app
    const res = await step.waitForEvent("senior-approval", {
      event: "app/triage.reviewed", timeout: "4h", match: "data.triageId",
    });
    if (!res) return { approved: false, reason: "No answer within 4 hours: held" }; // timeout path, decided with the client
    return { approved: res.data.approved, note: res.data.note };
  },
});
// The approve button in the app:
await inngest.send({ name: "app/triage.reviewed", data: { triageId, approved: true, note } });
```

**Running a network as an Inngest function** (needed for human in the loop, retries, concurrency and streaming):
```ts
const inngest = new Inngest({ id: "hello-earth" });
const triage = inngest.createFunction(
  { id: "triage-claim", retries: 2, concurrency: [{ key: "event.data.claimId", limit: 1 }] },
  { event: "app/claim.received" },
  async ({ event }) => network.run(event.data.prompt, { state: createState({ claim: event.data.claim }) }),
);
createServer({ functions: [triage], networks: [network] }).listen(Number(process.env.AGENT_PORT || 3010));
```
`createServer` serves the Inngest endpoint at `/api/inngest`. In an existing Express or Vite server, use `serve` from `inngest/express` on `/api/inngest` instead of a second port.

**Streaming to the UI**: `network.run(input, { streaming: { publish } })` inside the Inngest function; the browser subscribes with a token from `getSubscriptionToken` (`@inngest/realtime`) and shows status (`thinking`, `calling-tool`, `responding`) and messages, for example with the `useAgent` hook from AgentKit's UI streaming example. A simple pilot may poll the run's state from its own API instead.

## Running a pilot

- `npm start` starts the app and the Inngest dev server together: `inngest-cli dev --no-discovery -u http://127.0.0.1:$PORT/api/inngest -p $((PORT+1000))` (pin the `inngest-cli` version in package.json; set `INNGEST_DEV=1` and `INNGEST_BASE_URL=http://127.0.0.1:$((PORT+1000))` for the app). Several pilots run side by side, so derive the dev server port from the app's own `PORT`; never use the default 8288.
- Data: SQLite for the pilot by default (the preview has no database server). When the architecture names Postgres, run it in-process with PGlite (`@electric-sql/pglite`) behind a small adapter that takes a `DATABASE_URL` in production, so no extra service is needed. History threads live in the same database.
- Model key: the Studio gives each pilot one key for its agents (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`), plus `AGENT_PROVIDER` (`openai`, `anthropic` or `gemini`) and, when the client picked one on the Settings page, `AGENT_MODEL`. Choose the adapter from them, with a small default model per provider, and fall back to demo mode when no key is set:

  ```ts
  function modelFromEnv() {
    const p = process.env.AGENT_PROVIDER, m = process.env.AGENT_MODEL;
    if (p === "anthropic") return anthropic({ model: m || "claude-haiku-5-5", defaultParameters: { max_tokens: 1024 } });
    if (p === "gemini") return gemini({ model: m || "gemini-2.5-flash" });
    return openai({ model: m || "gpt-5-mini" });
  }
  ```
- No model key in the environment: a **demo mode** with scripted agent replies, labelled "Demo: no AI model connected" in the UI, so every flow, including approvals, still works end to end.
- Production adds: Inngest Cloud or self-hosted Inngest (`inngest start` with Postgres and Redis) with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`; real auth for the approver; Postgres. Write this in the architecture, don't build it in the pilot.

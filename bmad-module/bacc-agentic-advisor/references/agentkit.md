# Inngest AgentKit: the accelerator's standard agent harness

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
  name: "box-curator",
  description: "Builds a candy box from the quiz answers, never including an allergen the customer named.",
  system: "You build a tailored candy box ...",
  model: anthropic({ model: "claude-haiku-5-5", defaultParameters: { max_tokens: 1000 } }), // Anthropic needs max_tokens
  tools: [findCandies, saveBox],
});
```

**Tool**: what an agent can do. Zod parameters; the handler gets `{ network, step, agent }`.
```ts
const findCandies = createTool({
  name: "find_candies",
  description: "Candies for a planet that avoid the given allergens",
  parameters: z.object({ planet: z.string(), avoid: z.array(z.string()) }),
  handler: async ({ planet, avoid }, { network }) => {
    const rows = db.candiesFor(planet, avoid);   // plain code does the safety rule, not the model
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
interface BoxState { answers?: Answers; candidates?: Candy[]; boxId?: string; approved?: boolean }
const network = createNetwork<BoxState>({
  name: "tailor-my-box",
  agents: [curator, checker],
  defaultModel: openai({ model: process.env.OPENAI_MODEL || "gpt-4o-mini" }),
  router: ({ network, callCount }) => {           // code router: fixed order
    if (!network.state.data.boxId) return curator;
    if (network.state.data.approved === undefined) return checker;
    return undefined;                               // done
  },
});
await network.run("Build my box", { state: createState<BoxState>({ answers }) });
```
Routers: a **code router** (function, as above) when the order is fixed; a **routing agent** (`createRoutingAgent`) when an LLM should choose the next agent from their descriptions; **hybrid** (code for the fixed steps, the routing agent for the judgement call).

**Models**: `anthropic()`, `openai()`, `gemini()`, Grok, or any OpenAI-compatible endpoint, chosen per agent or as the network's `defaultModel`. Keys come from the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`). Never write a key into code, logs or the UI.

**History and memory**: pass `history: { createThread, get, appendUserMessage, appendResults }` to the agent or network, storing threads and messages in SQLite or Postgres; run with `createState({...}, { threadId })`. Long-term memory goes through tools (create, recall, update, delete), sent as Inngest events for durability.

**Human in the loop**: a tool that waits for an event. Needs the network to run inside an Inngest function.
```ts
const askShop = createTool({
  name: "ask_shop_team",
  description: "Ask the shop team to approve a box that touches an allergy",
  parameters: z.object({ boxId: z.string(), reason: z.string() }),
  handler: async ({ boxId, reason }, { step }) => {
    if (!step) return { error: "needs step context" };
    db.markAwaitingApproval(boxId, reason);          // what the person sees in the app
    const res = await step.waitForEvent("shop-approval", {
      event: "app/box.reviewed", timeout: "4h", match: "data.boxId",
    });
    if (!res) return { approved: false, reason: "No answer within 4 hours: held" }; // timeout path, decided with the client
    return { approved: res.data.approved, note: res.data.note };
  },
});
// The approve button in the app:
await inngest.send({ name: "app/box.reviewed", data: { boxId, approved: true, note } });
```

**Running a network as an Inngest function** (needed for human in the loop, retries, concurrency and streaming):
```ts
const inngest = new Inngest({ id: "hello-earth" });
const tailor = inngest.createFunction(
  { id: "tailor-box", retries: 2, concurrency: [{ key: "event.data.customerId", limit: 1 }] },
  { event: "app/box.requested" },
  async ({ event }) => network.run(event.data.prompt, { state: createState({ answers: event.data.answers }) }),
);
createServer({ functions: [tailor], networks: [network] }).listen(Number(process.env.AGENT_PORT || 3010));
```
`createServer` serves the Inngest endpoint at `/api/inngest`. In an existing Express or Vite server, use `serve` from `inngest/express` on `/api/inngest` instead of a second port.

**Streaming to the UI**: `network.run(input, { streaming: { publish } })` inside the Inngest function; the browser subscribes with a token from `getSubscriptionToken` (`@inngest/realtime`) and shows status (`thinking`, `calling-tool`, `responding`) and messages, for example with the `useAgent` hook from AgentKit's UI streaming example. A simple pilot may poll the run's state from its own API instead.

## Running a pilot

- `npm start` starts the app and the Inngest dev server together: `inngest-cli dev --no-discovery -u http://127.0.0.1:$PORT/api/inngest -p $((PORT+1000))` (pin the `inngest-cli` version in package.json; set `INNGEST_DEV=1` and `INNGEST_BASE_URL=http://127.0.0.1:$((PORT+1000))` for the app). Several pilots run side by side, so derive the dev server port from the app's own `PORT`; never use the default 8288.
- Data: SQLite for the pilot by default (the preview has no database server). When the architecture names Postgres, run it in-process with PGlite (`@electric-sql/pglite`) behind a small adapter that takes a `DATABASE_URL` in production, so no extra service is needed. History threads live in the same database.
- Model key: the accelerator gives each pilot one key for its agents, `OPENAI_API_KEY` by default (or `ANTHROPIC_API_KEY`, set by `BACC_APP_LLM`); pick the adapter that matches the key that is set, with a small model.
- No model key in the environment: a **demo mode** with scripted agent replies, labelled "Demo: no AI model connected" in the UI, so every flow, including approvals, still works end to end.
- Production adds: Inngest Cloud or self-hosted Inngest (`inngest start` with Postgres and Redis) with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`; real auth for the approver; Postgres. Write this in the architecture, don't build it in the pilot.

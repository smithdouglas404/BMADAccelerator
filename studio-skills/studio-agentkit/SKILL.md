---
name: studio-agentkit
description: How every agentic workflow in a Studio-built pilot is designed and built with Inngest AgentKit (agents, tools, networks, routers, state, memory, MCP, human in the loop, streaming). Use when the Product Engineer shapes agentic workflows, when the Muse suggests one, and when Claude Code builds the pilot.
origin: Working Backwards Studio
---

# Agentic workflows with Inngest AgentKit

Every pilot that has agents uses **Inngest AgentKit** (`@inngest/agent-kit`, https://agentkit.inngest.com) as its agent harness and orchestrator. Don't propose LangGraph, CrewAI, the OpenAI Agents SDK, a hand-rolled loop or a separate orchestration service. One library gives the pilot agents, tools, orchestration, model routing across providers, memory, MCP, human in the loop and streaming, so the owner sees a real agentic system without a stack of services. If the owner's own approved design system or architecture upload names a different agent stack, follow theirs and say so.

Map every agentic idea to AgentKit's own concepts, using its names, so the owner, the Product Engineer and Claude Code speak the same language. The mapping, the code patterns and the version are in `references/agentkit.md`; the pinned docs and examples are in `library/` when present. Read them before you design or build.

| What the product needs | AgentKit concept |
|---|---|
| A job an AI does (triage, draft, recommend, check, summarise) | **Agent** (`createAgent`: name, description, system prompt, model, tools) |
| An action it takes or data it reads (look up stock, save an order, call an API) | **Tool** (`createTool` with a zod schema) or an **MCP server** (`mcpServers`) |
| Several agents handing work to each other | **Network** (`createNetwork`) |
| Who goes next | **Router**: code router when the order is fixed, routing agent when an LLM should choose, hybrid when mostly fixed with one judgement call |
| What the agents share during a run | **State** (`network.state.data`, typed) |
| Remembering across visits | **History adapter** (threads), Postgres or SQLite; long-term memory through tools |
| A person approves, edits or answers | **Human in the loop**: a tool that waits with `step.waitForEvent`, with a timeout and what happens on timeout |
| Which model | **Model adapters** (`anthropic`, `openai`, `gemini`, any OpenAI-compatible), chosen per agent |
| Showing progress live | **Streaming** (realtime publish, `useAgent` in the UI) |
| Retries, limits per customer | Inngest function options (`retries`, `concurrency`, `throttle`) |

## When to Activate

- When the Product engineer shapes an agentic workflow, when the Muse suggests one, and when Claude Code builds a pilot that has agents.

## Ground rules

- **From the product truth, not a template.** Every agentic workflow traces to a line in the PRFAQ, a capability, a decision or the owner's words. Cite it. If nothing in the product is agent-shaped, say so plainly.
- **Agent, rule or person?** For each candidate, say which fits best and why: a fixed rule or plain code (deterministic, cheaper, testable), an AI agent (judgement, language, open-ended input), or a person. Prefer the simplest that does the job.
- **No AI for the sake of AI.** A fixed rule (if this, then that; a rules table; a lookup) is plain code, with no model. Suggest an agent only for workflows with several steps, messages to people, alerts or notifications, recommendations or insights. When the product has none, the pilot must not claim AI it doesn't use.
- **Agents suggest; people and plain code decide.** An agent in a generated app never makes the choice for the user. It shows what is possible as a numbered list (each option with a code that stays the same), explains options in plain words, and the user picks by code. Rules that must hold (allergies, prices, stock) stay in plain, tested code.
- **People stay in charge of what matters.** Money, safety, legal, anything sent to a customer, anything hard to undo: a person in the loop, with what they see, what they can do (approve, edit, reject), and what happens if they don't answer. Each becomes a Studio recommendation of kind "hitl" so the owner decides.
- **It's a pilot.** One Node service with AgentKit, its local Inngest dev server, SQLite or one Postgres, model keys from the environment (`AGENT_PROVIDER`, `AGENT_MODEL`), and a labelled demo mode when no key is set. Name what production would add, but don't build it.

## In the Studio

- The Product Engineer records each workflow as a recommendation of kind "workflow" with its AgentKit shape in the note, and each person-in-the-loop point as kind "hitl"; the owner pulls them forward and the Muse asks about them.
- What the owner accepts goes into the package's `AGENT_KIT_ROUTING.json` and `TECHNICAL_REQUIREMENTS.md`, and Claude Code builds it.
- After a build, check: does each accepted workflow exist, built with AgentKit; does every person-in-the-loop step actually wait and show the person what to approve; does the demo mode say it is a demo; is progress visible while an agent works.

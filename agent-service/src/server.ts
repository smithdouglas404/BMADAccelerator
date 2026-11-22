import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { Inngest } from "inngest";
import { serve } from "inngest/node";
import { parseAgent, UseCaseConfig } from "./config.ts";
import { Store } from "./store.ts";
import { Letta, Mem0 } from "./memory.ts";
import { setUsageSink } from "./usage.ts";
import { APPROVAL_EVENT, runAgent, type Deps } from "./runner.ts";

// The shared agent service. The Studio registers each use case and its agents (admin key); a generated
// app calls its agents with the app token it was given; people approve and see run history here.
//
// Admin (X-Admin-Key):   PUT /v1/admin/use-cases/:uc {customer,name,callbackUrl,newToken?} -> {token?}
//                        PUT /v1/admin/use-cases/:uc/agents/:key {config}   DELETE the same
//                        GET /v1/admin/use-cases/:uc  (agents, runs, approvals: for the Studio's Agents view)
// App (Bearer ast_...):  GET /v1/agents   POST /v1/agents/:key/runs {input, person?}   GET /v1/runs[/:id]
//                        GET /v1/approvals?status=pending   POST /v1/approvals/:id {decision, comment?, by?}
// People:                GET /ui (approvals and run history; asks for the app token)

export function createService(opts: { store: Store; mem0?: Mem0; letta?: Letta; adminKey: string; inngest?: boolean; pollMs?: number }) {
  const { store, adminKey } = opts;
  setUsageSink((n) => store.addUsage(n));
  const mem0 = opts.mem0 ?? new Mem0();
  const letta = opts.letta ?? new Letta();
  const base: Deps = { store, mem0, letta, pollMs: opts.pollMs };

  const inngest = opts.inngest ? new Inngest({ id: "studio-agent-service" }) : null;
  const fn = inngest?.createFunction({ id: "run-agent", retries: 2, triggers: [{ event: "agent-service/run.requested" }] }, async ({ event, step }) =>
    runAgent({ ...base, step: step as unknown as Deps["step"] }, (event.data as { runId: string }).runId),
  );
  const inngestHandler = inngest && fn ? serve({ client: inngest, functions: [fn] }) : null;

  async function start(runId: string) {
    if (inngest) await inngest.send({ name: "agent-service/run.requested", data: { runId } });
    else void runAgent(base, runId).catch((e) => console.error("run", runId, e));
  }

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const body = async (req: http.IncomingMessage) => {
    let raw = "";
    for await (const c of req) {
      raw += c;
      if (raw.length > 1_000_000) throw new Error("too large");
    }
    return raw ? JSON.parse(raw) : {};
  };
  const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method ?? "GET";
    try {
      if (p === "/health") return json(res, 200, { ok: true, inngest: !!inngest, letta: letta.on, mem0: mem0.on });
      if (p.startsWith("/api/inngest") && inngestHandler) return inngestHandler(req, res);
      if (p === "/ui" && m === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(await readFile(new URL("./ui.html", import.meta.url), "utf8"));
      }

      // The Studio.
      if (p.startsWith("/v1/admin/")) {
        if (!adminKey || !same(String(req.headers["x-admin-key"] ?? ""), adminKey)) return json(res, 401, { error: "Admin key required" });
        if (p === "/v1/admin/keys" && m === "PUT") {
          // Model keys saved on the Studio's Settings page. Kept in memory only, never returned.
          const b = (await body(req)) as Record<string, unknown>;
          for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) if (typeof b[k] === "string" && b[k]) process.env[k] = b[k] as string;
          return json(res, 200, { ok: true });
        }
        if (p === "/v1/admin/usage" && m === "GET") {
          // Every model call the service has made, in order, for the Studio's ledger. ?after=<seq> continues where it stopped.
          const q = new URL(req.url ?? "", "http://x").searchParams;
          return json(res, 200, { rows: await store.usageAfter(Number(q.get("after") ?? 0) || 0, Number(q.get("limit") ?? 500) || 500) });
        }
        const parts = p.split("/"); // ["", "v1", "admin", "use-cases", uc, "agents", key]
        const uc = parts[4] ?? "";
        if (!/^[a-z0-9_-]{6,64}$/i.test(uc)) return json(res, 400, { error: "Bad use case id" });
        if (parts.length === 5) {
          if (m === "PUT") {
            const b = await body(req);
            const u = UseCaseConfig.parse(b);
            const fresh = b.newToken === true || !(await store.useCase(uc))?.token_hash;
            const { token } = await store.upsertUseCase(uc, u, fresh);
            // The app checks X-Agent-Service-Secret on its action endpoint with this.
            return json(res, 200, { token, callbackSecret: (await store.useCase(uc))!.callback_secret });
          }
          if (m === "GET") {
            if (!(await store.useCase(uc))) return json(res, 404, { error: "Not registered" });
            const [agents, runs, approvals] = await Promise.all([store.agents(uc), store.runs(uc, 100), store.approvals(uc)]);
            return json(res, 200, { agents, runs, approvals });
          }
          if (m === "DELETE") return (await store.removeUseCase(uc), json(res, 200, { ok: true }));
        }
        if (parts.length === 7 && parts[5] === "agents") {
          const key = parts[6];
          if (!(await store.useCase(uc))) return json(res, 404, { error: "Register the use case first" });
          if (m === "PUT") {
            const a = parseAgent({ ...(await body(req)), key });
            await store.putAgent(uc, a);
            return json(res, 200, a);
          }
          if (m === "DELETE") return (await store.removeAgent(uc, key), json(res, 200, { ok: true }));
        }
        return json(res, 404, { error: "Not found" });
      }

      // A generated app (or the approval page) with its app token.
      if (p.startsWith("/v1/")) {
        const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        const uc = await store.useCaseForToken(token);
        if (!uc) return json(res, 401, { error: "App token required" });
        if (p === "/v1/agents" && m === "GET")
          return json(res, 200, (await store.agents(uc.id)).map((a) => ({ key: a.key, name: a.name, purpose: a.purpose, persona: a.persona.enabled, tools: a.tools.map((t) => ({ name: t.name, description: t.description, approval: t.approval })), approvals: a.approvals })));
        let mm = p.match(/^\/v1\/agents\/([a-z0-9-]+)\/runs$/);
        if (mm && m === "POST") {
          const a = await store.agent(uc.id, mm[1]);
          if (!a) return json(res, 404, { error: `No agent "${mm[1]}" for this app` });
          const b = await body(req);
          const input = String(b.input ?? "").trim();
          if (!input) return json(res, 400, { error: "input is required" });
          const id = await store.createRun(uc.id, a.key, input.slice(0, 20_000), String(b.person ?? "").slice(0, 120));
          await start(id);
          return json(res, 202, { runId: id, status: "queued" });
        }
        if (p === "/v1/runs" && m === "GET") return json(res, 200, await store.runs(uc.id, Number(url.searchParams.get("limit") ?? 50)));
        mm = p.match(/^\/v1\/runs\/(run_[\w-]+)$/);
        if (mm && m === "GET") {
          const r = await store.run(mm[1], uc.id);
          return r ? json(res, 200, r) : json(res, 404, { error: "Not found" });
        }
        if (p === "/v1/approvals" && m === "GET") return json(res, 200, await store.approvals(uc.id, url.searchParams.get("status") || undefined));
        mm = p.match(/^\/v1\/approvals\/(apv_[\w-]+)$/);
        if (mm && m === "POST") {
          const ap = await store.approval(mm[1], uc.id);
          if (!ap) return json(res, 404, { error: "Not found" });
          const b = await body(req);
          const decision = b.decision === "approve" ? "approved" : b.decision === "reject" ? "rejected" : null;
          if (!decision) return json(res, 400, { error: 'decision must be "approve" or "reject"' });
          const changed = await store.decide(ap.id, decision, String(b.comment ?? ""), String(b.by ?? ""));
          if (changed && inngest) await inngest.send({ name: APPROVAL_EVENT, data: { approvalId: ap.id, decision } });
          return json(res, changed ? 200 : 409, changed ? { ok: true, status: decision } : { error: `Already ${ap.status}` });
        }
        return json(res, 404, { error: "Not found" });
      }
      return json(res, 404, { error: "Not found" });
    } catch (e) {
      const msg = (e as Error).message;
      return json(res, /parse|too large|invalid|expected/i.test(msg) ? 400 : 500, { error: msg.slice(0, 400) });
    }
  };
  return { handler };
}

/** Self-host mode: AGENTS_FILE (the package's AGENTS.json) registers one use case and its agents at boot. */
async function selfHost(store: Store) {
  const file = process.env.AGENTS_FILE;
  if (!file) return;
  const cfg = JSON.parse(await readFile(file, "utf8")) as { useCase: string; customer?: string; name?: string; callbackUrl?: string; agents: unknown[] };
  await store.upsertUseCase(cfg.useCase, { customer: cfg.customer ?? "", name: cfg.name ?? "", callbackUrl: process.env.APP_CALLBACK_URL || cfg.callbackUrl || "" });
  if (process.env.AGENT_SERVICE_TOKEN) await store.setToken(cfg.useCase, process.env.AGENT_SERVICE_TOKEN);
  for (const a of cfg.agents) await store.putAgent(cfg.useCase, parseAgent(a));
  console.log(`self-host: ${cfg.agents.length} agent(s) registered for ${cfg.useCase}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.AGENT_SERVICE_DATABASE_URL;
  if (!url) throw new Error("AGENT_SERVICE_DATABASE_URL is required");
  const store = new Store(url);
  await store.init();
  await selfHost(store);
  const useInngest = Boolean(process.env.INNGEST_BASE_URL || process.env.INNGEST_DEV);
  const { handler } = createService({ store, adminKey: process.env.AGENT_SERVICE_ADMIN_KEY ?? "", inngest: useInngest });
  const port = Number(process.env.PORT ?? 8300);
  http.createServer((req, res) => void handler(req, res)).listen(port, "0.0.0.0", () => console.log(`agent service on :${port} (inngest ${useInngest ? "on" : "off"})`));
}

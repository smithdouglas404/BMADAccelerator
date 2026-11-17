import pg from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AgentConfig } from "./config.ts";

// The service's own records, in its own Postgres database: use cases (with their app token, stored
// only as a hash), agents (configuration), runs (history) and approvals.

export type Step = { at: string; kind: string; detail: string };
export type Run = {
  id: string; use_case: string; agent: string; person: string; input: string; output: string;
  status: "queued" | "running" | "waiting" | "done" | "rejected" | "failed"; error: string;
  steps: Step[]; demo: boolean; created_at: string; finished_at: string | null;
};
export type Approval = {
  id: string; run_id: string; use_case: string; agent: string; kind: "action" | "output"; title: string; detail: string;
  status: "pending" | "approved" | "rejected" | "expired"; comment: string; decided_by: string; created_at: string; decided_at: string | null; expires_at: string;
};
export type UseCaseRow = { id: string; customer: string; name: string; callback_url: string; token_hash: string; callback_secret: string };

const SCHEMA = `
create table if not exists use_cases (id text primary key, customer text not null default '', name text not null default '', callback_url text not null default '', token_hash text not null default '', callback_secret text not null default '', updated_at timestamptz not null default now());
create table if not exists agents (use_case text not null references use_cases(id) on delete cascade, key text not null, config jsonb not null, updated_at timestamptz not null default now(), primary key (use_case, key));
create table if not exists runs (id text primary key, use_case text not null references use_cases(id) on delete cascade, agent text not null, person text not null default '', input text not null, output text not null default '', status text not null default 'queued', error text not null default '', steps jsonb not null default '[]', demo boolean not null default false, created_at timestamptz not null default now(), finished_at timestamptz);
create index if not exists runs_uc on runs (use_case, created_at desc);
create table if not exists approvals (id text primary key, run_id text not null references runs(id) on delete cascade, use_case text not null, agent text not null, kind text not null, title text not null, detail text not null default '', status text not null default 'pending', comment text not null default '', decided_by text not null default '', created_at timestamptz not null default now(), decided_at timestamptz, expires_at timestamptz not null);
create index if not exists approvals_uc on approvals (use_case, status, created_at desc);
`;

export const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export class Store {
  pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 8 });
  }
  async init() {
    await this.pool.query(SCHEMA);
  }
  async close() {
    await this.pool.end();
  }
  private async one<T>(sql: string, args: unknown[] = []) {
    return ((await this.pool.query(sql, args)).rows[0] ?? null) as T | null;
  }
  private async all<T>(sql: string, args: unknown[] = []) {
    return (await this.pool.query(sql, args)).rows as T[];
  }

  /** Registers (or updates) a use case. A new app token is issued only when asked; it is returned once. */
  async upsertUseCase(id: string, u: { customer: string; name: string; callbackUrl: string }, newToken = false) {
    const token = newToken ? `ast_${randomBytes(24).toString("hex")}` : "";
    await this.pool.query(
      `insert into use_cases (id, customer, name, callback_url, token_hash, callback_secret) values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set customer=$2, name=$3, callback_url=$4,
         token_hash=case when $5='' then use_cases.token_hash else $5 end, updated_at=now()`,
      [id, u.customer, u.name, u.callbackUrl, token ? hash(token) : "", randomBytes(24).toString("hex")],
    );
    return { token };
  }
  /** Self-host mode: the token comes from the exported configuration. */
  async setToken(id: string, token: string) {
    await this.pool.query("update use_cases set token_hash=$2 where id=$1", [id, hash(token)]);
  }
  useCase(id: string) {
    return this.one<UseCaseRow>("select * from use_cases where id=$1", [id]);
  }
  /** The use case an app token belongs to, or null. */
  async useCaseForToken(token: string) {
    if (!token.startsWith("ast_")) return null;
    return this.one<UseCaseRow>("select * from use_cases where token_hash=$1", [hash(token)]);
  }
  async removeUseCase(id: string) {
    await this.pool.query("delete from use_cases where id=$1", [id]);
  }

  async putAgent(useCase: string, a: AgentConfig) {
    await this.pool.query(
      `insert into agents (use_case, key, config) values ($1,$2,$3) on conflict (use_case, key) do update set config=$3, updated_at=now()`,
      [useCase, a.key, JSON.stringify(a)],
    );
  }
  async removeAgent(useCase: string, key: string) {
    await this.pool.query("delete from agents where use_case=$1 and key=$2", [useCase, key]);
  }
  async agents(useCase: string) {
    return (await this.all<{ config: AgentConfig }>("select config from agents where use_case=$1 order by key", [useCase])).map((r) => r.config);
  }
  async agent(useCase: string, key: string) {
    return (await this.one<{ config: AgentConfig }>("select config from agents where use_case=$1 and key=$2", [useCase, key]))?.config ?? null;
  }

  async createRun(useCase: string, agent: string, input: string, person: string) {
    const id = `run_${randomUUID()}`;
    await this.pool.query("insert into runs (id, use_case, agent, person, input) values ($1,$2,$3,$4,$5)", [id, useCase, agent, person, input]);
    return id;
  }
  run(id: string, useCase?: string) {
    return useCase ? this.one<Run>("select * from runs where id=$1 and use_case=$2", [id, useCase]) : this.one<Run>("select * from runs where id=$1", [id]);
  }
  runs(useCase: string, limit = 50) {
    return this.all<Run>("select * from runs where use_case=$1 order by created_at desc limit $2", [useCase, Math.max(1, Math.min(200, limit))]);
  }
  async setRun(id: string, patch: Partial<Pick<Run, "status" | "output" | "error" | "demo">>, finished = false) {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    const sets = keys.map((k, i) => `${k}=$${i + 2}`);
    if (finished) sets.push("finished_at=now()");
    if (sets.length) await this.pool.query(`update runs set ${sets.join(", ")} where id=$1`, [id, ...keys.map((k) => patch[k])]);
  }
  async step(id: string, kind: string, detail: string) {
    await this.pool.query("update runs set steps = steps || $2::jsonb where id=$1", [id, JSON.stringify([{ at: new Date().toISOString(), kind, detail: detail.slice(0, 2000) }])]);
  }

  async createApproval(a: { id?: string; run: string; useCase: string; agent: string; kind: Approval["kind"]; title: string; detail: string; timeoutMinutes: number }) {
    const id = a.id ?? `apv_${randomUUID()}`;
    await this.pool.query(
      `insert into approvals (id, run_id, use_case, agent, kind, title, detail, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' minutes')::interval) on conflict (id) do nothing`,
      [id, a.run, a.useCase, a.agent, a.kind, a.title.slice(0, 300), a.detail.slice(0, 4000), String(a.timeoutMinutes)],
    );
    return id;
  }
  approval(id: string, useCase?: string) {
    return useCase ? this.one<Approval>("select * from approvals where id=$1 and use_case=$2", [id, useCase]) : this.one<Approval>("select * from approvals where id=$1", [id]);
  }
  approvals(useCase: string, status?: string) {
    return status
      ? this.all<Approval>("select * from approvals where use_case=$1 and status=$2 order by created_at desc limit 200", [useCase, status])
      : this.all<Approval>("select * from approvals where use_case=$1 order by created_at desc limit 200", [useCase]);
  }
  /** Records a person's decision once; a second decision on the same approval changes nothing. */
  async decide(id: string, status: "approved" | "rejected" | "expired", comment: string, by: string) {
    const r = await this.pool.query("update approvals set status=$2, comment=$3, decided_by=$4, decided_at=now() where id=$1 and status='pending'", [id, status, comment.slice(0, 2000), by.slice(0, 120)]);
    return (r.rowCount ?? 0) > 0;
  }
}

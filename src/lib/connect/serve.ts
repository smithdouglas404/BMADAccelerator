import { prisma } from "@/lib/db";
import { runTool, type ToolResult } from "./tools";
import type { ToolName } from "./catalog";
import type { Access } from "./tokens";

/** Runs a tool and logs the call (who, which tool, which use case, how it ended). Settings > Connect shows the log. */
export async function callTool(tool: ToolName, input: unknown, access: Access, client: string, via: "mcp" | "rest"): Promise<ToolResult> {
  const r = await runTool(tool, input, access, client);
  const ucId = input && typeof input === "object" && "use_case_id" in input ? String((input as { use_case_id: unknown }).use_case_id ?? "") : "";
  const outcome = r.ok ? "ok" : "needsConfirmation" in r ? "needs-confirm" : r.status === 403 ? "denied" : "error";
  await prisma.connectorCall
    .create({ data: { tokenId: access.id, person: access.person, tool, useCaseId: ucId.slice(0, 40), via, outcome, note: !r.ok && "error" in r ? r.error.slice(0, 300) : "" } })
    .catch((e) => console.error("connector log", e));
  return r;
}

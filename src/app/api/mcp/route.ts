import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { PRODUCT_NAME, ASSISTANT_NAME } from "@/lib/brand";
import { TOOLS, TOOL_NAMES, gate, isWrite } from "@/lib/connect/catalog";
import { callTool } from "@/lib/connect/serve";
import { accessFrom, publicBase, type Access } from "@/lib/connect/tokens";

export const dynamic = "force-dynamic";

// The Studio as a remote MCP connector (Streamable HTTP, stateless). Claude, ChatGPT or any MCP client
// adds https://<studio>/api/mcp; signing in goes through OAuth (or a token from Settings > Connect).

function server(access: Access) {
  const s = new McpServer(
    { name: PRODUCT_NAME, version: "1.0.0" },
    {
      instructions: `${PRODUCT_NAME}: product teams shape use cases with ${ASSISTANT_NAME} and build them with Claude Code. Start with list_use_cases or whats_waiting; my_access says what this access may do. Anything hard to undo (approving, building, withdrawing, reopening, sending a card back, archiving, deleting) returns a preview first: show it to the person and call again with confirm: true only after they say yes. Deleting a use case also needs its exact name in confirm_name. Everything you change is recorded under ${access.person || "the signed-in person"}'s name.`,
    },
  );
  // Only the tools this access may use are offered; my_access lists the rest.
  for (const name of TOOL_NAMES.filter((n) => gate(n, access).ok)) {
    const t = TOOLS[name];
    s.registerTool(
      name,
      { title: t.title, description: t.description, inputSchema: t.input, annotations: { readOnlyHint: !isWrite(name), destructiveHint: ["change_item", "decide", "archive_use_case", "delete_use_case", "review_spec", "restore_spec", "people", "story_map", "board_card"].includes(name), openWorldHint: false } },
      async (args: unknown) => {
        const r = await callTool(name, args, access, access.name, "mcp");
        const body = r.ok ? r.data : "needsConfirmation" in r ? { needs_confirmation: true, preview: r.preview, how: r.how } : { error: r.error };
        return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }], isError: !r.ok && !("needsConfirmation" in r) };
      },
    );
  }
  return s;
}

async function handle(req: Request) {
  const access = await accessFrom(req);
  if (!access) {
    const meta = `${publicBase(req)}/.well-known/oauth-protected-resource/api/mcp`;
    return new Response(JSON.stringify({ error: "Sign in to the Studio first." }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${meta}"` },
    });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server(access).connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

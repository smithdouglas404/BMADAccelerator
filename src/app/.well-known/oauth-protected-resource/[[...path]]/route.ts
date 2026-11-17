import { NextResponse } from "next/server";
import { PRODUCT_NAME } from "@/lib/brand";
import { publicBase } from "@/lib/connect/tokens";

// Where an MCP client learns how to sign in to /api/mcp (RFC 9728).
export async function GET(req: Request) {
  const base = publicBase(req);
  return NextResponse.json(
    { resource: `${base}/api/mcp`, resource_name: PRODUCT_NAME, authorization_servers: [base], scopes_supported: ["read", "write"], bearer_methods_supported: ["header"] },
    { headers: { "access-control-allow-origin": "*" } },
  );
}

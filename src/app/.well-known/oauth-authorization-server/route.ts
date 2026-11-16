import { NextResponse } from "next/server";
import { publicBase } from "@/lib/connect/tokens";

export async function GET(req: Request) {
  const base = publicBase(req);
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "write"],
    },
    { headers: { "access-control-allow-origin": "*" } },
  );
}

import { NextResponse } from "next/server";
import { openApi } from "@/lib/connect/openapi";
import { publicBase } from "@/lib/connect/tokens";

// The REST API's description, for OpenAPI custom connectors. Public: it holds no data.
export async function GET(req: Request) {
  return NextResponse.json(openApi(publicBase(req)), { headers: { "access-control-allow-origin": "*" } });
}

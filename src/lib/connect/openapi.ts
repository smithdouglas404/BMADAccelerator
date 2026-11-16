import { z } from "zod";
import { PRODUCT_NAME, ASSISTANT_NAME } from "@/lib/brand";
import { TOOLS, TOOL_NAMES } from "./catalog";

/** OpenAPI 3.1 for the REST API, generated from the same tool list as the MCP connector. */
export function openApi(base: string) {
  const paths: Record<string, unknown> = {};
  for (const name of TOOL_NAMES) {
    const t = TOOLS[name];
    const schema = z.toJSONSchema(t.input, { target: "openapi-3.0" }) as Record<string, unknown>;
    delete schema.$schema;
    paths[`/api/v1/${name}`] = {
      post: {
        operationId: name,
        summary: t.title,
        description: `${t.description}${t.write ? " Needs write access." : " Read-only."}`,
        requestBody: { required: true, content: { "application/json": { schema } } },
        responses: {
          "200": { description: "Done", content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } } },
          "202": { description: "Nothing changed yet: confirm first", content: { "application/json": { schema: { $ref: "#/components/schemas/NeedsConfirmation" } } } },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: `${PRODUCT_NAME} API`,
      version: "1.0.0",
      description: `Shape and build use cases with ${ASSISTANT_NAME} from any assistant. Approving, building, withdrawing, reopening and sending a card back answer 202 with a preview; show it to the person and send the same call with "confirm": true only after they say yes. Every call is logged, and changes are recorded under the signed-in person's name.`,
    },
    servers: [{ url: base }],
    security: [{ oauth: [] }, { token: [] }],
    paths,
    components: {
      securitySchemes: {
        token: { type: "http", scheme: "bearer", description: "A token from Settings > Connect in the Studio." },
        oauth: {
          type: "oauth2",
          flows: { authorizationCode: { authorizationUrl: `${base}/oauth/authorize`, tokenUrl: `${base}/oauth/token`, refreshUrl: `${base}/oauth/token`, scopes: { read: "Look at use cases", write: "Change use cases (with confirmation for approvals and builds)" } } },
        },
      },
      schemas: {
        Ok: { type: "object", properties: { ok: { type: "boolean" }, data: {} } },
        NeedsConfirmation: { type: "object", properties: { ok: { type: "boolean" }, needs_confirmation: { type: "boolean" }, preview: { type: "object" }, how: { type: "string" } } },
      },
      responses: { Error: { description: "Not done", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, error: { type: "string" } } } } } } },
    },
  };
}

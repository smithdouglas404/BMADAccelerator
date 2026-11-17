import { z } from "zod";
import { PRODUCT_NAME, ASSISTANT_NAME } from "@/lib/brand";
import { LEVEL_LABEL, TOOLS, TOOL_NAMES } from "./catalog";

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
        description: `${t.description} Needs: ${LEVEL_LABEL[t.need]}.`,
        tags: [t.need === "read" ? "Look" : t.need === "write" ? "Change" : "Admin"],
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
      version: "2.0.0",
      description: `Shape and build use cases with ${ASSISTANT_NAME} from any assistant: everything a person can do on the Studio's screens. Every operation is a POST with a JSON body. Start with list_use_cases (find ids) or whats_waiting; my_access says what this token may do. Three levels: Look, Look and make changes, and Admin (archive, restore and delete use cases, the call log). Anything hard to undo (approve, build, withdraw, reopen, undo, send back, remove, archive, delete, push to Git or Linear) answers 202 with a preview and changes nothing; show the preview to the person and send the same call with "confirm": true only after they say yes. delete_use_case also needs confirm_name, the use case's exact name. Every call is logged, and changes are recorded under the token's person's name.`,
    },
    servers: [{ url: base }],
    tags: [{ name: "Look", description: "Read only." }, { name: "Change", description: "Needs Look and make changes." }, { name: "Admin", description: "Needs Admin, full access." }],
    security: [{ oauth: [] }, { token: [] }],
    paths,
    components: {
      securitySchemes: {
        token: { type: "http", scheme: "bearer", description: "A token from Settings > Connect in the Studio." },
        oauth: {
          type: "oauth2",
          flows: { authorizationCode: { authorizationUrl: `${base}/oauth/authorize`, tokenUrl: `${base}/oauth/token`, refreshUrl: `${base}/oauth/token`, scopes: { read: "Look at use cases", write: "Change use cases (with confirmation for approvals and builds)", admin: "Everything, including archiving and deleting use cases" } } },
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

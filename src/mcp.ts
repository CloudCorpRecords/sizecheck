/**
 * sizecheck MCP server. Tools: score_blast_radius.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The scoring is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, scoreBlastRadius, VERSION } from "./sizecheck.js";

const TOOLS = [
  {
    name: "score_blast_radius",
    description:
      "Score a pull request's blast radius from its changed files: churn, exports touched, per-directory spread, the hottest files, and split suggestions when the change is large.",
    inputSchema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array",
          description: "Files changed by the pull request (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path (unique across the set)" },
              added: { type: "integer", description: "Lines added (>= 0)" },
              deleted: { type: "integer", description: "Lines deleted (>= 0)" },
              exports_changed: {
                type: "integer",
                description:
                  "Exported symbols added, removed, or changed in this file (optional, default 0; >= 0)",
              },
              kind: {
                type: "string",
                description:
                  'File kind: "code", "test", "docs", "config", or "other" (optional, default "code")',
              },
            },
            required: ["path", "added", "deleted"],
          },
        },
      },
      required: ["files"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "sizecheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "score_blast_radius") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = scoreBlastRadius(raw.files);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();

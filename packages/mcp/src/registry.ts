// Builds the hub's MCP server from tool definitions: checks them, lists them in name order, and wraps each handler.
// The wrapper keeps every reply safe: output re-checked against its schema, two text lines, and errors that never leak internals.

import { HUB_NAME } from "@hub/core";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { INTERNAL_ERROR_TEXT, neverThrows, toErrorResult, type LogError } from "./errors.js";
import { toToolResult, withoutUntrusted } from "./result.js";
import type { HubTool } from "./tool.js";

/** Private: the tool list will differ per tenant. One minute: toolsListChanged is the main signal, the TTL only limits lag. */
export const TOOLS_LIST_CACHE_HINT = { ttlMs: 60_000, cacheScope: "private" } as const;
/** snake_case with a provider prefix. */
export const TOOL_NAME_PATTERN =
  /^(hub|github|vercel|sentry|postgres)_[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const MAX_TOOL_NAME = 64;

export interface HubServerOptions<Ctx> {
  tools: readonly HubTool<Ctx>[];
  /** Built per request by the server from the verified caller; tools get it as ctx. */
  context: Ctx;
  logError: LogError;
}

/** A fresh McpServer with the tools registered in name order. Throws on a bad definition. */
export function createHubServer<Ctx>(options: HubServerOptions<Ctx>): McpServer {
  const { tools, context } = options;
  const logError = neverThrows(options.logError);
  checkDefinitions(tools);

  const server = new McpServer(
    { name: HUB_NAME, version: "0.0.0" },
    { cacheHints: { "tools/list": TOOLS_LIST_CACHE_HINT } },
  );
  // tools/list follows registration order, so sorting here makes it deterministic.
  // Plain < instead of localeCompare: the order must not depend on the machine's locale.
  const sorted = [...tools].sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const tool of sorted) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      // The SDK has already validated input against inputSchema; a bad input never gets here.
      (input: Record<string, unknown>) => runTool(tool, input, context, logError),
    );
  }
  return server;
}

/** Never throws: the SDK would send a thrown message to the model as is. */
async function runTool<Ctx>(
  tool: HubTool<Ctx>,
  input: Record<string, unknown>,
  context: Ctx,
  logError: LogError,
): Promise<CallToolResult> {
  try {
    const output = await tool.run(input, context);
    const parsed = tool.outputSchema.safeParse(output);
    if (!parsed.success) {
      // A hub bug: log the details, show fixed text instead of the SDK's validation message.
      logError(parsed.error, { tool: tool.name });
      return { content: [{ type: "text", text: INTERNAL_ERROR_TEXT }], isError: true };
    }
    // The parsed value: keys the schema does not declare are stripped, so they never reach the client.
    return toToolResult(tool.summarize(withoutUntrusted(parsed.data)), parsed.data);
  } catch (error) {
    return toErrorResult(error, tool.name, logError);
  }
}

function checkDefinitions<Ctx>(tools: readonly HubTool<Ctx>[]): void {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!TOOL_NAME_PATTERN.test(tool.name) || tool.name.length > MAX_TOOL_NAME) {
      throw new Error(
        `Tool name ${tool.name} must be snake_case with a provider prefix and at most ${MAX_TOOL_NAME} characters`,
      );
    }
    if (seen.has(tool.name)) throw new Error(`Tool ${tool.name} is defined twice`);
    seen.add(tool.name);
    // Input mode: a plain z.object advertises no additionalProperties there, only z.strictObject says false.
    if (z.toJSONSchema(tool.inputSchema, { io: "input" }).additionalProperties !== false) {
      throw new Error(`Tool ${tool.name} must use z.strictObject for its input schema`);
    }
    // Stripping undeclared output keys only works if no object in the schema lets them through.
    if (allowsUndeclaredKeys(z.toJSONSchema(tool.outputSchema, { io: "output" }))) {
      throw new Error(
        `Tool ${tool.name} has an output schema that keeps undeclared keys: use z.object, not z.looseObject, catchall or z.record`,
      );
    }
  }
}

/** True if any object in a JSON Schema accepts keys it does not declare (loose, catchall or record). */
function allowsUndeclaredKeys(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  if (Array.isArray(node)) return node.some(allowsUndeclaredKeys);
  const schema = node as Record<string, unknown>;
  const isObject = schema.type === "object" || "properties" in schema;
  if (isObject && schema.additionalProperties !== false) return true;
  const children = [
    ...Object.values((schema.properties as Record<string, unknown> | undefined) ?? {}),
    ...Object.values((schema.$defs as Record<string, unknown> | undefined) ?? {}),
    schema.items,
    schema.prefixItems,
    schema.anyOf,
    schema.oneOf,
    schema.allOf,
  ];
  return children.some(allowsUndeclaredKeys);
}

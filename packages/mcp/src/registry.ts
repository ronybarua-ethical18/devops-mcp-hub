// Builds the hub's MCP server from tool and resource definitions: checks them, lists them in name order, and wraps each handler.
// The wrappers keep every reply safe: output re-checked against its schema, and errors that never leak internals.

import { HUB_NAME } from "@hub/core";
import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  ResourceTemplate,
  type CallToolResult,
  type ReadResourceResult,
  type Variables,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  INTERNAL_ERROR_TEXT,
  neverThrows,
  toErrorResult,
  toResourceError,
  type LogError,
} from "./errors.js";
import type { HubResourceTemplate } from "./resource.js";
import { toToolResult, UNTRUSTED_NOTICE, withoutUntrusted } from "./result.js";
import type { AnyObjectSchema, HubTool } from "./tool.js";

/** Private: the tool list will differ per tenant. One minute: toolsListChanged is the main signal, the TTL only limits lag. */
export const TOOLS_LIST_CACHE_HINT = { ttlMs: 60_000, cacheScope: "private" } as const;
/** snake_case with a provider prefix. */
export const TOOL_NAME_PATTERN =
  /^(hub|github|vercel|sentry|postgres)_[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const MAX_TOOL_NAME = 64;
/** Resource reads and the template list differ per tenant too, and access to a repo can be revoked. */
export const RESOURCES_CACHE_HINT = TOOLS_LIST_CACHE_HINT;

export interface HubServerOptions<Ctx> {
  tools: readonly HubTool<Ctx>[];
  resources?: readonly HubResourceTemplate<Ctx>[];
  /** Built per request by the server from the verified caller; tools get it as ctx. */
  context: Ctx;
  logError: LogError;
}

/** A fresh McpServer with the tools and resources registered in name order. Throws on a bad definition. */
export function createHubServer<Ctx>(options: HubServerOptions<Ctx>): McpServer {
  const { tools, context, resources = [] } = options;
  const logError = neverThrows(options.logError);
  checkDefinitions(tools, resources);

  const server = new McpServer(
    { name: HUB_NAME, version: "0.0.0" },
    {
      cacheHints: {
        "tools/list": TOOLS_LIST_CACHE_HINT,
        "resources/templates/list": RESOURCES_CACHE_HINT,
        "resources/read": RESOURCES_CACHE_HINT,
      },
    },
  );
  // Lists follow registration order, so sorting here makes them deterministic.
  for (const tool of byName(tools)) {
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
  for (const resource of byName(resources)) {
    server.registerResource(
      resource.name,
      new ResourceTemplate(resource.uriTemplate, { list: undefined }),
      { title: resource.title, description: resource.description, mimeType: "application/json" },
      (uri, variables) => readResource(resource, uri, variables, context, logError),
    );
  }
  return server;
}

/** Plain < instead of localeCompare: the order must not depend on the machine's locale. Names are unique. */
function byName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.name < b.name ? -1 : 1));
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

/**
 * Only fixed-text ProtocolErrors leave a read: the SDK sends a thrown error's message and code as is.
 * Variables come from the URI, which the client wrote; the core checks them like tool arguments.
 */
async function readResource<Ctx>(
  resource: HubResourceTemplate<Ctx>,
  uri: URL,
  variables: Variables,
  context: Ctx,
  logError: LogError,
): Promise<ReadResourceResult> {
  const single: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== "string") {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        "Each part of the resource URI must be a single value.",
      );
    }
    single[key] = value;
  }
  let output: unknown;
  try {
    output = await resource.read(single, context);
  } catch (error) {
    throw toResourceError(error, uri.href, resource.name, logError);
  }
  const parsed = resource.outputSchema.safeParse(output);
  if (!parsed.success) {
    // A hub bug: log the details, show fixed text.
    logError(parsed.error, { tool: resource.name });
    throw new ProtocolError(ProtocolErrorCode.InternalError, INTERNAL_ERROR_TEXT);
  }
  // The parsed value: keys the schema does not declare are stripped, so they never reach the client.
  const text = JSON.stringify({ notice: UNTRUSTED_NOTICE, ...parsed.data });
  return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
}

function checkDefinitions<Ctx>(
  tools: readonly HubTool<Ctx>[],
  resources: readonly HubResourceTemplate<Ctx>[],
): void {
  const seen = new Set<string>();
  const checkName = (kind: string, name: string) => {
    if (!TOOL_NAME_PATTERN.test(name) || name.length > MAX_TOOL_NAME) {
      throw new Error(
        `${kind} name ${name} must be snake_case with a provider prefix and at most ${MAX_TOOL_NAME} characters`,
      );
    }
    if (seen.has(name)) throw new Error(`${kind} ${name} is defined twice`);
    seen.add(name);
  };
  for (const tool of tools) {
    checkName("Tool", tool.name);
    // Input mode: a plain z.object advertises no additionalProperties there, only z.strictObject says false.
    if (z.toJSONSchema(tool.inputSchema, { io: "input" }).additionalProperties !== false) {
      throw new Error(`Tool ${tool.name} must use z.strictObject for its input schema`);
    }
    checkOutput("Tool", tool.name, tool.outputSchema);
  }
  for (const resource of resources) {
    checkName("Resource", resource.name);
    checkOutput("Resource", resource.name, resource.outputSchema);
    // Reads are sent as { notice, ...output }: an output field named notice would replace the notice.
    if ("notice" in resource.outputSchema.shape) {
      throw new Error(`Resource ${resource.name} must not have a top-level notice field`);
    }
  }
}

/** Stripping undeclared output keys only works if no object in the schema lets them through. */
function checkOutput(kind: string, name: string, schema: AnyObjectSchema): void {
  if (allowsUndeclaredKeys(z.toJSONSchema(schema, { io: "output" }))) {
    throw new Error(
      `${kind} ${name} has an output schema that keeps undeclared keys: use z.object, not z.looseObject, catchall or z.record`,
    );
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

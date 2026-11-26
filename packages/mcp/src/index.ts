// Thin MCP tool, resource and prompt handlers.
// Public entry of @hub/mcp: the tool contract, the result builder, the error mapper and the registry.

export { defineTool } from "./tool.js";
export type { AnyObjectSchema, HubTool, HubToolAnnotations, HubToolDefinition } from "./tool.js";
export { STRUCTURED_NOTICE, toToolResult, UNTRUSTED_NOTICE, withoutUntrusted } from "./result.js";
export { INTERNAL_ERROR_TEXT, neverThrows, toErrorResult } from "./errors.js";
export type { LogError } from "./errors.js";
export { createHubServer, TOOL_NAME_PATTERN, TOOLS_LIST_CACHE_HINT } from "./registry.js";
export type { HubServerOptions } from "./registry.js";

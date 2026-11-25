// Thin MCP tool, resource and prompt handlers.
// Public entry of @hub/mcp: the tool contract, the result builder and the error mapper.

export { defineTool } from "./tool.js";
export type { AnyObjectSchema, HubTool, HubToolAnnotations, HubToolDefinition } from "./tool.js";
export { STRUCTURED_NOTICE, toToolResult, UNTRUSTED_NOTICE, withoutUntrusted } from "./result.js";
export { INTERNAL_ERROR_TEXT, toErrorResult } from "./errors.js";
export type { LogError } from "./errors.js";

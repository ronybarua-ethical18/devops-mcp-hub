// Thin MCP tool, resource and prompt handlers.
// Public entry of @hub/mcp: the tool and resource contracts, the result builder, the error mapper, the registry and the hub's tools and resources.

export { defineTool } from "./tool.js";
export type { AnyObjectSchema, HubTool, HubToolAnnotations, HubToolDefinition } from "./tool.js";
export { STRUCTURED_NOTICE, toToolResult, UNTRUSTED_NOTICE, withoutUntrusted } from "./result.js";
export {
  errorText,
  INTERNAL_ERROR_TEXT,
  neverThrows,
  toErrorResult,
  toResourceError,
} from "./errors.js";
export type { LogError } from "./errors.js";
export {
  createHubServer,
  RESOURCES_CACHE_HINT,
  TOOL_NAME_PATTERN,
  TOOLS_LIST_CACHE_HINT,
} from "./registry.js";
export type { HubResourceTemplate } from "./resource.js";
export { commitResource, hubResources } from "./resources/commit.js";
export type { HubServerOptions } from "./registry.js";
export type { ToolContext } from "./context.js";
export { hubTools } from "./tools/index.js";

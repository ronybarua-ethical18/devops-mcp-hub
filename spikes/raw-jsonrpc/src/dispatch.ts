// Pure protocol logic: one stdin line in, at most one stdout message out.
import {
  ErrorCode,
  META,
  SUPPORTED_VERSIONS,
  errorResponse,
  resultResponse,
  type JsonRpcId,
  type JsonRpcResponse,
} from "./protocol.js";
import { callTool, listTools } from "./tools.js";

const DISCOVER_TTL_MS = 3_600_000;
const TOOLS_LIST_TTL_MS = 300_000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isId = (v: unknown): v is JsonRpcId => typeof v === "string" || typeof v === "number";

export function handleLine(line: string): JsonRpcResponse | null {
  const text = line.trim();
  if (text === "") return null;

  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return errorResponse(null, ErrorCode.ParseError, "Parse error");
  }

  // Batching was removed from MCP; arrays are invalid requests.
  if (!isObject(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    const id = isObject(msg) && isId(msg.id) ? msg.id : null;
    return errorResponse(id, ErrorCode.InvalidRequest, "Invalid Request");
  }

  // No id → notification: never answered.
  if (!("id" in msg)) return null;
  if (!isId(msg.id))
    return errorResponse(null, ErrorCode.InvalidRequest, "Invalid Request: bad id");

  const { id, method, params } = msg as { id: JsonRpcId; method: string; params?: unknown };

  // Legacy-era methods get a clear pointer to the supported revision, before any _meta checks.
  if (method === "initialize" || method === "ping") {
    return errorResponse(
      id,
      ErrorCode.MethodNotFound,
      `Method '${method}' was removed. This server supports protocol versions: ${SUPPORTED_VERSIONS.join(", ")} (use server/discover).`,
      { supported: SUPPORTED_VERSIONS },
    );
  }

  if (!isObject(params)) {
    return errorResponse(id, ErrorCode.InvalidParams, "Invalid params: params object is required");
  }
  const meta = params._meta;
  if (!isObject(meta)) {
    return errorResponse(id, ErrorCode.InvalidParams, "Invalid params: _meta is required");
  }
  const version = meta[META.protocolVersion];
  if (typeof version !== "string") {
    return errorResponse(
      id,
      ErrorCode.InvalidParams,
      `Invalid params: _meta["${META.protocolVersion}"] is required`,
    );
  }
  if (!isObject(meta[META.clientCapabilities])) {
    return errorResponse(
      id,
      ErrorCode.InvalidParams,
      `Invalid params: _meta["${META.clientCapabilities}"] is required`,
    );
  }
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return errorResponse(id, ErrorCode.UnsupportedProtocolVersion, "Unsupported protocol version", {
      supported: SUPPORTED_VERSIONS,
      requested: version,
    });
  }

  try {
    switch (method) {
      case "server/discover":
        return resultResponse(id, {
          supportedVersions: SUPPORTED_VERSIONS,
          capabilities: { tools: {} },
          instructions: "Spike server. Call divide(a, b) to divide two numbers.",
          ttlMs: DISCOVER_TTL_MS,
          cacheScope: "private",
        });
      case "tools/list":
        return resultResponse(id, {
          tools: listTools(),
          ttlMs: TOOLS_LIST_TTL_MS,
          cacheScope: "private",
        });
      case "tools/call": {
        const { name, arguments: args } = params;
        if (typeof name !== "string") {
          return errorResponse(
            id,
            ErrorCode.InvalidParams,
            "Invalid params: tool name must be a string",
          );
        }
        const result = callTool(name, args);
        if (!result) {
          return errorResponse(id, ErrorCode.InvalidParams, `Unknown tool: ${name}`);
        }
        return resultResponse(id, { ...result });
      }
      default:
        return errorResponse(id, ErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error("internal error handling", method, err);
    return errorResponse(id, ErrorCode.InternalError, "Internal error");
  }
}

// MCP spec revision 2026-07-28 (stateless): constants, JSON-RPC types and response builders.

export const PROTOCOL_VERSION = "2026-07-28";
export const SUPPORTED_VERSIONS: readonly string[] = [PROTOCOL_VERSION];
export const SERVER_INFO = { name: "raw-jsonrpc-spike", version: "0.0.1" } as const;

/** Reserved `_meta` keys carried on every request (and serverInfo on results). */
export const META = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  UnsupportedProtocolVersion: -32022,
} as const;

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: Record<string, unknown> }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: JsonRpcError };

export function errorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: JsonRpcError = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: "2.0", id, error };
}

/** Every 2026-07-28 result carries resultType "complete" and serverInfo in _meta. */
export function resultResponse(id: JsonRpcId, result: Record<string, unknown>): JsonRpcResponse {
  const existingMeta =
    typeof result._meta === "object" && result._meta !== null
      ? (result._meta as Record<string, unknown>)
      : {};
  return {
    jsonrpc: "2.0",
    id,
    result: {
      ...result,
      resultType: "complete",
      _meta: { ...existingMeta, [META.serverInfo]: SERVER_INFO },
    },
  };
}

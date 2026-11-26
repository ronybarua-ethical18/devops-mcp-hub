// Turns anything a tool or resource read throws into a reply the model can act on: an isError result or a JSON-RPC error.
// Known hub errors keep their fixed message and fix-it hint; anything else is logged and hidden behind fixed text.

import { GithubReadError } from "@hub/core";
import {
  type CallToolResult,
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
} from "@modelcontextprotocol/server";

/** Where hidden errors go (the server passes a logger that attaches the trace id). */
export type LogError = (error: unknown, details: { tool: string }) => void;

export const INTERNAL_ERROR_TEXT =
  "The hub hit an internal error while handling this request.\nTry again later. If it keeps failing, ask an admin to check the hub logs.";

/** The text the model sees for any thrown value. Known errors keep their fixed message and hint; anything else is logged and hidden. */
export function errorText(error: unknown, name: string, logError: LogError): string {
  if (error instanceof GithubReadError) {
    const wait =
      error.retryAfterSeconds === undefined ? "" : ` retryAfterSeconds: ${error.retryAfterSeconds}`;
    return `${error.message} (${error.kind}).\n${error.hint}${wait}`;
  }
  // Never error.message: an unknown error can carry a URL, a token or a provider reply.
  neverThrows(logError)(error, { tool: name });
  return INTERNAL_ERROR_TEXT;
}

/** Any thrown value -> an isError tool result. */
export function toErrorResult(error: unknown, tool: string, logError: LogError): CallToolResult {
  return { content: [{ type: "text", text: errorText(error, tool, logError) }], isError: true };
}

/**
 * Any thrown value -> a JSON-RPC error for a resource read. The SDK sends a thrown error's message and code as is,
 * so only these fixed-text errors may leave a read. Another org's repo gets the same error as a missing one.
 */
export function toResourceError(
  error: unknown,
  uri: string,
  name: string,
  logError: LogError,
): ProtocolError {
  const text = errorText(error, name, logError);
  if (!(error instanceof GithubReadError)) {
    return new ProtocolError(ProtocolErrorCode.InternalError, text);
  }
  switch (error.kind) {
    case "invalid_input":
      return new ProtocolError(ProtocolErrorCode.InvalidParams, text);
    case "not_found":
    case "repo_not_allowed":
      return new ResourceNotFoundError(uri, text);
    default:
      return new ProtocolError(ProtocolErrorCode.InternalError, text);
  }
}

/** A LogError that swallows its own failure: a thrown logger error would reach the model through the SDK. */
export function neverThrows(logError: LogError): LogError {
  return (error, details) => {
    try {
      logError(error, details);
    } catch {
      // Nothing safe to report: the logger itself is the way out, and its message may hold internals.
    }
  };
}

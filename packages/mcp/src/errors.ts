// Turns anything a tool throws into an isError result the model can act on.
// Known hub errors keep their fixed message and fix-it hint; anything else is logged and hidden behind fixed text.

import { GithubReadError } from "@hub/core";
import type { CallToolResult } from "@modelcontextprotocol/server";

/** Where hidden errors go (the server passes a logger that attaches the trace id). */
export type LogError = (error: unknown, details: { tool: string }) => void;

export const INTERNAL_ERROR_TEXT =
  "The hub hit an internal error while running this tool.\nTry again later. If it keeps failing, ask an admin to check the hub logs.";

/** Any thrown value -> an isError result. Known errors keep their fixed message and hint; anything else is logged and hidden. */
export function toErrorResult(error: unknown, tool: string, logError: LogError): CallToolResult {
  if (error instanceof GithubReadError) {
    const wait =
      error.retryAfterSeconds === undefined ? "" : ` retryAfterSeconds: ${error.retryAfterSeconds}`;
    return errorText(`${error.message} (${error.kind}).\n${error.hint}${wait}`);
  }
  // Never error.message: an unknown error can carry a URL, a token or a provider reply.
  neverThrows(logError)(error, { tool });
  return errorText(INTERNAL_ERROR_TEXT);
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

function errorText(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

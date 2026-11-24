// Shared low-level GitHub HTTP helpers: send with a timeout, turn bad statuses into GithubError,
// and parse JSON replies with a schema. Nothing here ever puts a token or reply body in an error.

import type { z } from "zod/v4";
import { GithubError } from "./errors.js";

export const DEFAULT_BASE_URL = "https://api.github.com";
export const DEFAULT_TIMEOUT_MS = 10_000;

export const GITHUB_HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  // GitHub requires a User-Agent. A generic name, nothing about the user or project.
  "user-agent": "devops-mcp-hub",
} as const;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** fetch with a hard timeout. A network failure or timeout becomes a GithubError. */
export async function send(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (isTimeout(error)) throw new GithubError("timeout");
    throw new GithubError("upstream", { detail: "network error" });
  }
}

function retryAfter(response: Response, nowMs: number): number | undefined {
  const header = response.headers.get("retry-after");
  if (header !== null && /^\d+$/.test(header)) return Number(header);
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset !== null && /^\d+$/.test(reset)) {
    return Math.max(0, Number(reset) - Math.floor(nowMs / 1000));
  }
  return undefined;
}

/** Map a non-2xx response to a GithubError. 403 is a rate limit when GitHub says so. */
export function errorForStatus(response: Response, nowMs: number = Date.now()): GithubError {
  const { status } = response;
  const limited =
    status === 429 ||
    (status === 403 &&
      (response.headers.has("retry-after") ||
        response.headers.get("x-ratelimit-remaining") === "0"));
  if (limited) {
    const seconds = retryAfter(response, nowMs);
    return new GithubError("rate_limited", {
      status,
      ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
    });
  }
  if (status === 401) return new GithubError("unauthorized", { status });
  if (status === 403) return new GithubError("forbidden", { status });
  if (status === 404) return new GithubError("not_found", { status });
  return new GithubError("upstream", { status });
}

/** Read a 2xx body as JSON and check it against `schema`. Anything else is an upstream error. */
export async function readJson<S extends z.ZodType>(
  response: Response,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isTimeout(error)) throw new GithubError("timeout");
    throw new GithubError("upstream", { detail: "reply was not valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new GithubError("upstream", { detail: "unexpected reply shape" });
  return parsed.data;
}

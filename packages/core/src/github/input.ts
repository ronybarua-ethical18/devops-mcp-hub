// Checks and shapes what callers send to the GitHub read service: repo names, page sizes, long text.
// Bad input fails here with a fix-it hint, before any database lookup or GitHub call.

import { GithubReadError, HINTS } from "./errors.js";

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 50;

// The same rules the GitHub adapter applies, so a name that passes here can't change a URL path there.
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** "owner/repo" only. Null for anything else, including "." / ".." and a ".git" suffix. */
export function parseRepo(value: string): { owner: string; repo: string } | null {
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (owner === undefined || repo === undefined) return null;
  if (!OWNER.test(owner) || !REPO.test(repo)) return null;
  if (repo === "." || repo === ".." || repo.toLowerCase().endsWith(".git")) return null;
  return { owner, repo };
}

const SHA = /^[0-9a-f]{7,40}$/i;

/** A commit SHA of 7 to 40 hex characters, lowercased; null for anything else (branch names too). */
export function parseSha(value: string): string | null {
  return SHA.test(value) ? value.toLowerCase() : null;
}

/** A page size of 1 to 50, default 30. Anything else is invalid_input, never silently clamped. */
export function checkLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new GithubReadError("invalid_input", HINTS.limit);
  }
  return limit;
}

/** Cut `text` to `max` characters and say how much was cut. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}[truncated: ${text.length - max} more characters]`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque repo-list cursor: base64url of {"after": "<connection id>"}. */
export function encodeCursor(after: string): string {
  return Buffer.from(JSON.stringify({ after })).toString("base64url");
}

/** The connection id inside a cursor this service issued; anything else is invalid_input. */
export function decodeCursor(cursor: string): string {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const after = (value as { after?: unknown } | null)?.after;
    if (typeof after === "string" && UUID.test(after)) return after;
  } catch {
    // fall through to the error below
  }
  throw new GithubReadError("invalid_input", HINTS.cursor);
}

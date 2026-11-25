// The one error the GitHub read service throws: a short kind, a fixed message, and a fix-it hint for the model.
// All text is written here; no token, GitHub reply or caller input is ever copied into an error.

import { GithubError } from "@hub/integrations";

export type GithubReadErrorKind =
  | "invalid_input"
  | "not_connected"
  | "repo_not_allowed"
  | "no_installation"
  | "not_found"
  | "forbidden"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "upstream";

const MESSAGES: Record<GithubReadErrorKind, string> = {
  invalid_input: "Invalid input",
  not_connected: "GitHub is not connected",
  repo_not_allowed: "Repo is not connected to the hub",
  no_installation: "GitHub App install is not finished",
  not_found: "Not found on GitHub",
  forbidden: "GitHub denied access",
  unauthorized: "GitHub rejected the hub's App credentials",
  rate_limited: "GitHub rate limit reached",
  timeout: "GitHub did not answer in time",
  upstream: "GitHub returned an unexpected result",
};

export const HINTS = {
  repo: "Use the form owner/repo, for example acme/api. Call github_list_repos to see the repos you can use.",
  limit: "limit must be a whole number from 1 to 50.",
  cursor:
    "Pass nextCursor from the previous result unchanged, or leave cursor out to start from the first page.",
  sha: "sha must be a commit SHA: 7 to 40 hexadecimal characters.",
  not_connected:
    "GitHub is not connected for this org. An admin can connect it in the hub dashboard.",
  repo_not_allowed:
    "This repo is not connected to the hub. Call github_list_repos to see the repos you can use.",
  no_installation:
    "The GitHub App install for this org is not finished. An admin must reconnect GitHub in the hub dashboard.",
  not_found: "GitHub could not find it, or the App was not given access to it.",
  refused:
    "The hub's GitHub App was refused. An admin must check the App's access in the hub dashboard.",
  rate_limited: "GitHub's rate limit was reached. Try again after retryAfterSeconds.",
  rate_limited_unknown: "GitHub's rate limit was reached. Try again in a few minutes.",
  commit_not_found: "No commit with that SHA in this repo. Check the sha and the repo.",
  flaky: "GitHub did not answer properly. Try again in a minute.",
} as const;

export class GithubReadError extends Error {
  readonly kind: GithubReadErrorKind;
  /** Fix-it text for the model: what to do next. */
  readonly hint: string;
  readonly retryAfterSeconds: number | undefined;

  constructor(kind: GithubReadErrorKind, hint: string, retryAfterSeconds?: number) {
    super(MESSAGES[kind]);
    this.name = "GithubReadError";
    this.kind = kind;
    this.hint = hint;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Turn an adapter error into a read error. Anything else is a bug and is rethrown as is. */
export function fromAdapterError(error: unknown): never {
  if (!(error instanceof GithubError)) throw error;
  switch (error.kind) {
    // Repo, sha and installation id are checked before the call, so only the cursor is left.
    case "invalid_input":
      throw new GithubReadError("invalid_input", HINTS.cursor);
    case "not_found":
      throw new GithubReadError("not_found", HINTS.not_found);
    case "forbidden":
    case "unauthorized":
      throw new GithubReadError(error.kind, HINTS.refused);
    case "rate_limited":
      // Point at retryAfterSeconds only when GitHub told us how long to wait.
      if (error.retryAfterSeconds === undefined) {
        throw new GithubReadError("rate_limited", HINTS.rate_limited_unknown);
      }
      throw new GithubReadError("rate_limited", HINTS.rate_limited, error.retryAfterSeconds);
    case "timeout":
    case "upstream":
      throw new GithubReadError(error.kind, HINTS.flaky);
  }
}

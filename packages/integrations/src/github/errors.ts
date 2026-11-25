// The one error type the GitHub adapter throws, with a short "kind" the layers above can act on.
// Messages are fixed text: GitHub's reply body, tokens and keys are never copied into an error.

export type GithubErrorKind =
  | "invalid_input"
  | "unauthorized"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "timeout"
  | "upstream";

const MESSAGES: Record<GithubErrorKind, string> = {
  invalid_input: "Invalid input for a GitHub call",
  unauthorized: "GitHub rejected the App credentials",
  not_found: "GitHub resource not found, or the App installation cannot see it",
  forbidden: "GitHub denied access to this resource",
  rate_limited: "GitHub rate limit reached",
  timeout: "GitHub did not answer in time",
  upstream: "GitHub returned an unexpected result",
};

export class GithubError extends Error {
  readonly kind: GithubErrorKind;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    kind: GithubErrorKind,
    details: { status?: number; retryAfterSeconds?: number; detail?: string } = {},
  ) {
    super(details.detail === undefined ? MESSAGES[kind] : `${MESSAGES[kind]}: ${details.detail}`);
    this.name = "GithubError";
    this.kind = kind;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

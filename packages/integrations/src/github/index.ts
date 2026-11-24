// Public entry of the GitHub adapter: the client, the token provider and the error type.
// Everything else in this folder is internal.

export { createInstallationTokenProvider } from "./app-auth.js";
export type { InstallationTokenProvider, InstallationTokenProviderOptions } from "./app-auth.js";
export { createGithubClient, MAX_PAGE_SIZE } from "./client.js";
export type {
  ChangedFile,
  CommitSummary,
  GithubClient,
  GithubClientOptions,
  Page,
  PageOptions,
  PullRequestSummary,
  RepoRef,
  Repository,
} from "./client.js";
export { GithubError } from "./errors.js";
export type { GithubErrorKind } from "./errors.js";

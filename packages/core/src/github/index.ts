// Public entry of the core GitHub read service: the service factory, its result types and its error.
// Input helpers stay internal.

export { createGithubReadService, MAX_COMMIT_FILES } from "./service.js";
export type {
  CommitDetail,
  GithubReadDeps,
  GithubReadService,
  PullRequestList,
  RepoList,
} from "./service.js";
export { GithubReadError, HINTS } from "./errors.js";
export type { GithubReadErrorKind } from "./errors.js";

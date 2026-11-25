// The GitHub read client: list repos, list pull requests, get a commit summary.
// Checks every input, caps page size at 50, drops diffs, and returns plain typed objects.

import type { InstallationTokenProvider } from "./app-auth.js";
import { GithubError } from "./errors.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  GITHUB_HEADERS,
  errorForStatus,
  readJson,
  send,
} from "./http.js";
import { commitSchema, pullListSchema, repoListSchema } from "./schemas.js";

export const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 30;

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null on the last page. */
  nextCursor: string | null;
}

export interface PageOptions {
  /** Items per page, 1 to 50 (larger values are lowered to 50). Default 30. */
  limit?: number;
  cursor?: string;
}

export interface Repository {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  url: string;
}

/** `title` and `author` are text written by other people: treat as untrusted. */
export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  author: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  headRef: string;
  baseRef: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

/** `message` is text written by the commit author: treat as untrusted. No diff is ever included. */
export interface CommitSummary {
  sha: string;
  url: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  date: string | null;
  stats: { additions: number; deletions: number; total: number } | null;
  /** First page of changed files only (GitHub sends at most 300 per page). */
  files: ChangedFile[];
  /** True when GitHub has more file pages, so `files` is not the full list. */
  filesTruncated: boolean;
}

export interface GithubClient {
  listRepositories(installationId: string, options?: PageOptions): Promise<Page<Repository>>;
  listPullRequests(
    installationId: string,
    repo: RepoRef,
    options?: PageOptions & { state?: "open" | "closed" | "all" },
  ): Promise<Page<PullRequestSummary>>;
  getCommit(installationId: string, repo: RepoRef, sha: string): Promise<CommitSummary>;
}

export interface GithubClientOptions {
  tokens: InstallationTokenProvider;
  baseUrl?: string;
  timeoutMs?: number;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{7,40}$/i;

function invalid(detail: string): GithubError {
  return new GithubError("invalid_input", { detail });
}

function checkRepo({ owner, repo }: RepoRef): string {
  if (!OWNER.test(owner)) throw invalid("owner is not a valid GitHub login");
  if (!REPO.test(repo) || /^\.{1,2}$/.test(repo)) throw invalid("repo is not a valid name");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function pageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 1;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const page = (value as { page?: unknown } | null)?.page;
    if (typeof page === "number" && Number.isInteger(page) && page >= 1) return page;
  } catch {
    // fall through to the error below
  }
  throw invalid("cursor was not issued by this server");
}

function nextCursor(link: string | null): string | null {
  const next = link?.match(/<([^>]+)>\s*;\s*rel="next"/)?.[1];
  if (next === undefined) return null;
  const page = Number(URL.parse(next)?.searchParams.get("page"));
  if (!Number.isInteger(page) || page < 1) return null;
  return Buffer.from(JSON.stringify({ page })).toString("base64url");
}

export function createGithubClient(options: GithubClientOptions): GithubClient {
  const { tokens, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  /** GET `path`; on a 401 drop the cached token and try once more with a fresh one. */
  async function get(installationId: string, path: string): Promise<Response> {
    const once = async (): Promise<Response> =>
      send(
        `${baseUrl}${path}`,
        {
          headers: {
            ...GITHUB_HEADERS,
            authorization: `Bearer ${await tokens.getToken(installationId)}`,
          },
        },
        timeoutMs,
      );
    let response = await once();
    if (response.status === 401) {
      await response.body?.cancel();
      tokens.invalidate(installationId);
      response = await once();
    }
    if (!response.ok) throw errorForStatus(response);
    return response;
  }

  function pagedPath(path: string, page: PageOptions, extra: Record<string, string> = {}): string {
    const query = new URLSearchParams({
      ...extra,
      per_page: String(pageSize(page.limit)),
      page: String(decodeCursor(page.cursor)),
    });
    return `${path}?${query.toString()}`;
  }

  return {
    async listRepositories(installationId, page = {}) {
      const response = await get(installationId, pagedPath("/installation/repositories", page));
      const body = await readJson(response, repoListSchema);
      return {
        items: body.repositories.map((r) => ({
          id: r.id,
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
          private: r.private,
          defaultBranch: r.default_branch,
          url: r.html_url,
        })),
        nextCursor: nextCursor(response.headers.get("link")),
      };
    },

    async listPullRequests(installationId, repo, page = {}) {
      const path = `${checkRepo(repo)}/pulls`;
      const response = await get(
        installationId,
        pagedPath(path, page, { state: page.state ?? "open" }),
      );
      const body = await readJson(response, pullListSchema);
      return {
        items: body.map((p) => ({
          number: p.number,
          title: p.title,
          state: p.state,
          draft: p.draft ?? false,
          author: p.user?.login ?? null,
          url: p.html_url,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          headRef: p.head.ref,
          baseRef: p.base.ref,
        })),
        nextCursor: nextCursor(response.headers.get("link")),
      };
    },

    async getCommit(installationId, repo, sha) {
      const base = checkRepo(repo);
      if (!SHA.test(sha)) throw invalid("sha must be 7 to 40 hex characters");
      const response = await get(installationId, `${base}/commits/${sha}`);
      const c = await readJson(response, commitSchema);
      return {
        sha: c.sha,
        url: c.html_url,
        message: c.commit.message,
        authorName: c.commit.author?.name ?? null,
        authorLogin: c.author?.login ?? null,
        date: c.commit.author?.date ?? null,
        stats: c.stats ?? null,
        files: (c.files ?? []).map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        })),
        // Deliberately one page: say so instead of passing a cut list off as complete.
        filesTruncated: nextCursor(response.headers.get("link")) !== null,
      };
    },
  };
}

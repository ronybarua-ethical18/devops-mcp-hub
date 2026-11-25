// Test doubles for the GitHub read service: fake org repositories and a fake GitHub client.
// Plain objects with vi.fn methods, so tests set replies and check calls without a database or network.

import { vi } from "vitest";
import type { ActiveIntegration, ConnectionsRepo, IntegrationsRepo, RepoConnection } from "@hub/db";
import type { CommitSummary, GithubClient, Page, PullRequestSummary } from "@hub/integrations";

export const github: ActiveIntegration = {
  id: "i1",
  provider: "github",
  externalAccountId: "424242",
};

export function connection(overrides: Partial<RepoConnection> = {}): RepoConnection {
  return {
    connectionId: "c1",
    projectId: "p1",
    externalRef: "acme/api",
    integration: github,
    ...overrides,
  };
}

/** Org repositories with fixed answers: `active` integrations and the `findRepo` result. */
export function fakeRepos(options: {
  active?: ActiveIntegration[];
  found?: RepoConnection | null;
  list?: { items: RepoConnection[]; nextAfter: string | null };
}) {
  const integrations = {
    listActive: vi.fn(async () => options.active ?? [github]),
  } satisfies IntegrationsRepo;
  const connections = {
    findRepo: vi.fn(async () => (options.found === undefined ? connection() : options.found)),
    list: vi.fn(async () => options.list ?? { items: [], nextAfter: null }),
  } satisfies ConnectionsRepo;
  return { integrations, connections };
}

export function pullRequest(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    number: 42,
    title: "Fix login redirect",
    state: "open",
    draft: false,
    author: "octocat",
    url: "https://github.com/acme/api/pull/42",
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-21T09:30:00Z",
    headRef: "fix-login",
    baseRef: "main",
    ...overrides,
  };
}

export function commit(overrides: Partial<CommitSummary> = {}): CommitSummary {
  return {
    sha: "a".repeat(40),
    url: `https://github.com/acme/api/commit/${"a".repeat(40)}`,
    message: "Fix login redirect",
    authorName: "Octo Cat",
    authorLogin: "octocat",
    date: "2026-11-21T09:00:00Z",
    stats: { additions: 5, deletions: 2, total: 7 },
    files: [{ filename: "src/login.ts", status: "modified", additions: 5, deletions: 2 }],
    filesTruncated: false,
    ...overrides,
  };
}

/** A GitHub client whose replies tests set; every method is a vi.fn. */
export function fakeGithub(replies: {
  pulls?: Page<PullRequestSummary>;
  commit?: CommitSummary;
  error?: unknown;
}) {
  const reply = async <T>(value: T | undefined): Promise<T> => {
    if (replies.error !== undefined) throw replies.error;
    if (value === undefined) throw new Error("no fake reply set");
    return value;
  };
  return {
    listRepositories: vi.fn(async () => reply<never>(undefined)),
    listPullRequests: vi.fn(async () => reply(replies.pulls)),
    getCommit: vi.fn(async () => reply(replies.commit)),
  } satisfies GithubClient;
}

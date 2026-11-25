// Tests for client.ts: repo list, pull request list and commit summary against a fake GitHub.
// Covers paging, the 50 item cap, input checks, error mapping, the 401 retry and secret hygiene.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpResponse, delay, http } from "msw";
import { createInstallationTokenProvider } from "../../src/github/app-auth.js";
import { createGithubClient, type GithubClient } from "../../src/github/client.js";
import { GithubError } from "../../src/github/errors.js";
import {
  COMMIT_SHA,
  DIFF_MARKER,
  FAKE_INSTALLATION_ID,
  FAKE_INSTALLATION_TOKEN,
  commitBody,
  pullsBody,
  reposBody,
} from "./fixtures.js";
import { APP_ID, makeKeys, server, tokenEndpoint } from "./msw.js";

const keys = makeKeys();
const API = "https://api.github.com";
const acme = { owner: "acme", repo: "api" };

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(options: { timeoutMs?: number } = {}): {
  client: GithubClient;
  mint: ReturnType<typeof tokenEndpoint>;
} {
  const mint = tokenEndpoint(keys, () => new Date(Date.now() + 3_600_000));
  server.use(mint.handler);
  const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs1Pem });
  return { client: createGithubClient({ tokens, ...options }), mint };
}

async function failure(promise: Promise<unknown>): Promise<GithubError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GithubError) return error;
    throw error;
  }
  throw new Error("expected a GithubError");
}

describe("listRepositories", () => {
  it("maps repos, authenticates with the installation token and sends GitHub's headers", async () => {
    let seen: Request | undefined;
    server.use(
      http.get(`${API}/installation/repositories`, ({ request }) => {
        seen = request;
        return HttpResponse.json(reposBody);
      }),
    );
    const { client } = setup();
    const page = await client.listRepositories(FAKE_INSTALLATION_ID);
    expect(page.items).toEqual([
      {
        id: 1001,
        owner: "acme",
        name: "api",
        fullName: "acme/api",
        private: true,
        defaultBranch: "main",
        url: "https://github.com/acme/api",
      },
      {
        id: 1002,
        owner: "acme",
        name: "web",
        fullName: "acme/web",
        private: false,
        defaultBranch: "trunk",
        url: "https://github.com/acme/web",
      },
    ]);
    expect(page.nextCursor).toBeNull();
    expect(seen?.headers.get("authorization")).toBe(`Bearer ${FAKE_INSTALLATION_TOKEN}`);
    expect(seen?.headers.get("accept")).toBe("application/vnd.github+json");
    expect(seen?.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(seen?.headers.get("user-agent")).toBeTruthy();
  });

  it("caps page size at 50 and round-trips the cursor from the Link header", async () => {
    const urls: URL[] = [];
    server.use(
      http.get(`${API}/installation/repositories`, ({ request }) => {
        const url = new URL(request.url);
        urls.push(url);
        const page = Number(url.searchParams.get("page") ?? "1");
        const headers =
          page === 1
            ? { link: `<${API}/installation/repositories?per_page=50&page=2>; rel="next"` }
            : undefined;
        return HttpResponse.json(reposBody, headers ? { headers } : {});
      }),
    );
    const { client } = setup();
    const first = await client.listRepositories(FAKE_INSTALLATION_ID, { limit: 500 });
    expect(urls[0]?.searchParams.get("per_page")).toBe("50");
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await client.listRepositories(FAKE_INSTALLATION_ID, {
      limit: 50,
      cursor: first.nextCursor as string,
    });
    expect(urls[1]?.searchParams.get("page")).toBe("2");
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a cursor it did not issue", async () => {
    const { client } = setup();
    for (const cursor of ["!!!", "e30", Buffer.from('{"page":-1}').toString("base64url")]) {
      const error = await failure(client.listRepositories(FAKE_INSTALLATION_ID, { cursor }));
      expect(error.kind, cursor).toBe("invalid_input");
    }
  });
});

describe("listPullRequests", () => {
  it("maps pull requests (missing author becomes null) and asks for open ones by default", async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${API}/repos/acme/api/pulls`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(pullsBody);
      }),
    );
    const { client } = setup();
    const page = await client.listPullRequests(FAKE_INSTALLATION_ID, acme, { limit: 2 });
    expect(url?.searchParams.get("state")).toBe("open");
    expect(url?.searchParams.get("per_page")).toBe("2");
    expect(page.items).toEqual([
      {
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
      },
      {
        number: 41,
        title: "Bump deps",
        state: "open",
        draft: true,
        author: null,
        url: "https://github.com/acme/api/pull/41",
        createdAt: "2026-11-19T08:00:00Z",
        updatedAt: "2026-11-19T08:05:00Z",
        headRef: "deps",
        baseRef: "main",
      },
    ]);
  });

  it("does not return the PR body", async () => {
    server.use(http.get(`${API}/repos/acme/api/pulls`, () => HttpResponse.json(pullsBody)));
    const { client } = setup();
    const page = await client.listPullRequests(FAKE_INSTALLATION_ID, acme);
    expect(JSON.stringify(page)).not.toContain("Ignore previous instructions");
  });
});

describe("getCommit", () => {
  it("returns a changed-file summary and never the diff", async () => {
    server.use(
      http.get(`${API}/repos/acme/api/commits/${COMMIT_SHA}`, () => HttpResponse.json(commitBody)),
    );
    const { client } = setup();
    const commit = await client.getCommit(FAKE_INSTALLATION_ID, acme, COMMIT_SHA);
    expect(commit).toEqual({
      sha: COMMIT_SHA,
      url: `https://github.com/acme/api/commit/${COMMIT_SHA}`,
      message: "Fix login redirect\n\nCloses #12",
      authorName: "Octo Cat",
      authorLogin: "octocat",
      date: "2026-11-21T09:00:00Z",
      stats: { additions: 5, deletions: 2, total: 7 },
      files: [
        { filename: "src/login.ts", status: "modified", additions: 4, deletions: 1 },
        { filename: "src/old.ts", status: "removed", additions: 0, deletions: 1 },
        { filename: "logo.png", status: "added", additions: 1, deletions: 0 },
      ],
      filesTruncated: false,
    });
    expect(JSON.stringify(commit)).not.toContain(DIFF_MARKER);
  });

  it("flags the file list as truncated when GitHub has more file pages", async () => {
    server.use(
      http.get(`${API}/repos/acme/api/commits/${COMMIT_SHA}`, () =>
        HttpResponse.json(commitBody, {
          headers: {
            link: `<${API}/repos/acme/api/commits/${COMMIT_SHA}?page=2>; rel="next", <${API}/repos/acme/api/commits/${COMMIT_SHA}?page=10>; rel="last"`,
          },
        }),
      ),
    );
    const { client } = setup();
    const commit = await client.getCommit(FAKE_INSTALLATION_ID, acme, COMMIT_SHA);
    expect(commit.filesTruncated).toBe(true);
    expect(commit.files).toHaveLength(3);
  });
});

describe("input checks", () => {
  it("rejects owner, repo and sha values that could change the request path, with no request", async () => {
    const { client, mint } = setup();
    const bad = [
      client.listPullRequests(FAKE_INSTALLATION_ID, { owner: "../x", repo: "api" }),
      client.listPullRequests(FAKE_INSTALLATION_ID, { owner: "acme", repo: "api/../../x" }),
      client.listPullRequests(FAKE_INSTALLATION_ID, { owner: "acme", repo: ".." }),
      client.getCommit(FAKE_INSTALLATION_ID, acme, "HEAD"),
      client.getCommit(FAKE_INSTALLATION_ID, acme, "abc/../def"),
      client.getCommit(FAKE_INSTALLATION_ID, acme, "zzzzzzz"),
    ];
    for (const call of bad) expect((await failure(call)).kind).toBe("invalid_input");
    expect(mint.requests()).toBe(0);
  });
});

describe("failures", () => {
  const SECRET = "SECRET-BODY-TEXT";
  const cases: Array<{ name: string; response: () => Response; kind: string; retry?: number }> = [
    {
      name: "404",
      response: () => HttpResponse.json({ message: SECRET }, { status: 404 }),
      kind: "not_found",
    },
    {
      name: "403",
      response: () => HttpResponse.json({ message: SECRET }, { status: 403 }),
      kind: "forbidden",
    },
    {
      name: "429 with Retry-After",
      response: () =>
        HttpResponse.json({ message: SECRET }, { status: 429, headers: { "retry-after": "30" } }),
      kind: "rate_limited",
      retry: 30,
    },
    {
      name: "403 with the rate limit used up",
      response: () =>
        HttpResponse.json(
          { message: SECRET },
          { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "12" } },
        ),
      kind: "rate_limited",
      retry: 12,
    },
    {
      name: "502",
      response: () => HttpResponse.json({ message: SECRET }, { status: 502 }),
      kind: "upstream",
    },
    {
      name: "a reply of the wrong shape",
      response: () => HttpResponse.json([{ nope: SECRET }]),
      kind: "upstream",
    },
    {
      name: "a reply that is not JSON",
      response: () => new HttpResponse(SECRET, { status: 200 }),
      kind: "upstream",
    },
  ];

  for (const { name, response, kind, retry } of cases) {
    it(`maps ${name} to ${kind} without echoing GitHub's body`, async () => {
      server.use(http.get(`${API}/repos/acme/api/pulls`, response));
      const { client } = setup();
      const error = await failure(client.listPullRequests(FAKE_INSTALLATION_ID, acme));
      expect(error.kind).toBe(kind);
      expect(error.retryAfterSeconds).toBe(retry);
      expect(`${error.message} ${error.stack}`).not.toContain(SECRET);
      expect(`${error.message} ${error.stack}`).not.toContain(FAKE_INSTALLATION_TOKEN);
    });
  }

  it("times out a slow GitHub", async () => {
    server.use(
      http.get(`${API}/repos/acme/api/pulls`, async () => {
        await delay(300);
        return HttpResponse.json(pullsBody);
      }),
    );
    const { client } = setup({ timeoutMs: 30 });
    expect((await failure(client.listPullRequests(FAKE_INSTALLATION_ID, acme))).kind).toBe(
      "timeout",
    );
  });

  it("maps a dropped connection to upstream", async () => {
    server.use(http.get(`${API}/repos/acme/api/pulls`, () => HttpResponse.error()));
    const { client } = setup();
    expect((await failure(client.listPullRequests(FAKE_INSTALLATION_ID, acme))).kind).toBe(
      "upstream",
    );
  });
});

describe("expired installation token", () => {
  it("mints a fresh token and retries once after a 401", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/repos/acme/api/pulls`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: "Bad credentials" }, { status: 401 })
          : HttpResponse.json(pullsBody);
      }),
    );
    const { client, mint } = setup();
    const page = await client.listPullRequests(FAKE_INSTALLATION_ID, acme);
    expect(page.items).toHaveLength(2);
    expect(calls).toBe(2);
    expect(mint.requests()).toBe(2);
  });

  it("gives up with unauthorized when the second try is also a 401", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/repos/acme/api/pulls`, () => {
        calls += 1;
        return HttpResponse.json({ message: "Bad credentials" }, { status: 401 });
      }),
    );
    const { client } = setup();
    expect((await failure(client.listPullRequests(FAKE_INSTALLATION_ID, acme))).kind).toBe(
      "unauthorized",
    );
    expect(calls).toBe(2);
  });
});

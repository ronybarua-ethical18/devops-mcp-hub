<!-- Implementation plan for Phase 3 task 6 (issue #3): the four GitHub read tools and the commit resource template.
     Written before coding, as CLAUDE.md rule 17 requires; it also settles item 1 of issue #27. -->

# Phase 3 task 6: GitHub read tools and commit resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `hub_whoami`, `github_list_repos`, `github_list_pull_requests`, `github_get_commit` and the resource template `github://{owner}/{repo}/commits/{sha}` to `packages/mcp`, as thin wrappers over the task 4 core service, served through the task 5 registry.

**Architecture:** Each tool is a `defineTool` definition whose `run` only calls `ctx.github` (a `GithubReadService` built per org by the server in task 7) and returns its result unchanged. The registry gains resource-template support with the same guarantees tools have: output re-parsed against a schema, fixed error text, nothing thrown to the SDK. Summaries quote only hub-owned values and counts, never provider-written text (issue #27 item 1).

**Tech Stack:** TypeScript (strict, ESM), zod `zod/v4` 4.6.7, `@modelcontextprotocol/server` 2.4.0, Vitest 5.1.0, `@modelcontextprotocol/client` 2.4.0 (tests only).

**Spec:** `docs/superpowers/plans/2026-11-24-phase-3-github-read-tools.md` (task 6), issue #3, issue #27 item 1. Builds on `docs/superpowers/plans/2026-11-25-phase-3-task-5-mcp-registry-error-mapper.md`.

Branch: `3-phase-3-task-6-github-read-tools`. The PR says "Part of #3" and "Part of #27" (item 2 of #27 belongs to task 7). No commits or pushes by Claude; each task ends with a suggested commit message.

## Global Constraints

- Provider calls only in `packages/integrations`, logic in `packages/core`; a tool's `run` is one call to `ctx.github.*` plus building the call's input. No business rules in `packages/mcp`.
- The org and user come only from `ctx`, never from tool arguments or the resource URI.
- Tool names: snake_case with a provider prefix (registry pattern `TOOL_NAME_PATTERN`). Inputs `z.strictObject`; outputs `z.object` at every level (no `looseObject`, `catchall`, `record`).
- Page size: 1–50, default 30 (core `checkLimit`). `github_get_commit` returns at most 100 files (core `MAX_COMMIT_FILES`), never diffs.
- Every new or edited file starts with a two-line plain-words purpose comment. Relative imports end in `.js`; type-only imports use `import type`.
- `exactOptionalPropertyTypes` is on: zod infers `limit?: number | undefined`, the service takes `limit?: number`. Build the service input without `undefined` keys; no `as` casts to get around it.
- Tests use a fake `GithubReadService`; never msw or real GitHub at this layer. Wire tests use `test/helpers/connect.ts` (SDK client pinned to `2026-07-28`).

## Decisions

1. **Summaries never quote provider text (issue #27 item 1).** `summarize` may use counts, numbers, SHAs, the `repo` returned by `listPullRequests`/`getCommit` (the core already checked it with `parseRepo`) and `ctx`-derived ids. It must not use `untrusted_content`, `author`, `authorLogin`, `url`, or the repo names from `listRepos` (stored refs that the core does not re-check). Enforced by one canary test per tool (Review Focus 1). The rule goes into the `summarize` JSDoc in `tool.ts`.
2. **`repo` and `sha` inputs are plain bounded strings, not regexes.** A zod regex would fail in the SDK with zod's generic text; leaving the check to the core returns the fix-it hint (`HINTS.repo`, `HINTS.sha`). `limit` keeps its `min(1).max(50)` in the schema, as in task 5.
3. **Annotations:** all four tools `readOnlyHint: true`. `openWorldHint: true` only for `github_list_pull_requests` and `github_get_commit` (they call GitHub); `hub_whoami` and `github_list_repos` read only the hub, so `false`.
4. **Output schemas match the core types exactly**, proven by tsc in `src` (test files are not type-checked): a field the schema forgot would otherwise be stripped silently at runtime.
5. **Resource reads are wrapped like tool calls.** SDK 2.4.0 sends a thrown handler error's `message` (and `code`, if it's an integer) as the JSON-RPC error (`src-*.mjs`, request error path). So the registry catches every error from a resource read and throws only `ProtocolError`s with fixed text: `invalid_input` → `InvalidParams` (-32602); `not_found`, `repo_not_allowed` → `ResourceNotFoundError` (the SDK sends -32602 on 2026-07-28), so a repo of another org looks exactly like a missing one; other `GithubReadError`s → `InternalError` (-32603) with their fixed text; anything else → `InternalError` with `INTERNAL_ERROR_TEXT`, logged.
6. **Resource JSON carries the notice.** The resource text is `JSON.stringify({ notice: UNTRUSTED_NOTICE, ...parsed })`, since a resource has no separate text line to put it in.
7. **Cache hints:** `resources/templates/list` and `resources/read` get the same `{ ttlMs: 60_000, cacheScope: "private" }` as `tools/list`. Access to a repo can be revoked, so a commit read is not cached longer than the list.
8. **Threat-model rows land with the tools** (deviation: the phase plan put them in task 11). The review guide treats a tool without its row as `must-fix:`. Rows 10–12 and the snapshot stay in task 11.

Not in this task: wiring the tools into `/mcp` and building `ctx` (task 7), per-tenant visibility (task 8), rate limits and risk levels (no infrastructure yet; flagged in the threat-model rows), issue #27 item 2 (task 7).

## Review Focus

1. **Provider text in a summary:** a PR title, branch, commit message, author or file name containing `CANARY` never appears in text line 1 of any tool. Test: Task 1 and Task 2 canary tests.
2. **Bad repo name** (`"acme"`, `"acme/api/x"`): `isError` whose text ends with `HINTS.repo`, not zod's message. Test: Task 2 `"a bad repo name returns the repo hint"`.
3. **Another org's repo:** the tool returns the `repo_not_allowed` hint; the resource returns JSON-RPC `-32602`, never data, and the same error as a truly missing commit. Test: Task 2 and Task 3.
4. **Cursor round-trip:** `nextCursor` from page 1 reaches the service unchanged on page 2, and `limit: 51` never reaches it. Test: Task 1 (`github_list_repos`) and Task 2 (`github_list_pull_requests`).
5. **Odd resource URIs** (`github://acme/api/commits/main`, a URI that doesn't match the template, an unexpected error with a secret in it): fixed error text on the wire, nothing logged to the client. Test: Task 3.

---

### Task 1: Tool context, `hub_whoami` and `github_list_repos`

**Files:**

- Create: `packages/mcp/src/context.ts`
- Create: `packages/mcp/src/tools/exact.ts`
- Create: `packages/mcp/src/tools/whoami.ts`
- Create: `packages/mcp/src/tools/list-repos.ts`
- Modify: `packages/mcp/src/tool.ts` (the `summarize` JSDoc only)
- Create: `packages/mcp/test/helpers/fake-github.ts`
- Test: `packages/mcp/test/tools/whoami.test.ts`, `packages/mcp/test/tools/list-repos.test.ts`

**Interfaces:**

- Consumes: `defineTool`, `HubTool`, `createHubServer` (task 5); `GithubReadService`, `RepoList`, `GithubReadError`, `HINTS` from `@hub/core`; `connect` from `test/helpers/connect.ts`.
- Produces:
  - `context.ts`: `export interface ToolContext { auth: { orgId: string; userId: string }; github: GithubReadService }`
  - `tools/exact.ts`: `export type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;` and `export type Assert<T extends true> = T;`
  - `whoamiTool: HubTool<ToolContext>`, `listReposTool: HubTool<ToolContext>`
  - `test/helpers/fake-github.ts`: `fakeGithub(overrides?: Partial<GithubReadService>): GithubReadService` where every method not overridden is a `vi.fn()` that rejects with `new Error("not stubbed")`, and `serveTools(tools: HubTool<ToolContext>[], github: GithubReadService, logError?: LogError): Promise<Connected>` (context `{ auth: { orgId: "org_1", userId: "user_1" }, github }`, closes in `afterEach` like `registry.test.ts`).

- [ ] **Step 1: Write the failing tests**

`whoami.test.ts`:

```ts
it("returns the caller from ctx, with read-only annotations", async () => {
  const { client } = await serveTools([whoamiTool], fakeGithub());
  const [tool] = (await client.listTools()).tools;
  expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  const result = await client.callTool({ name: "hub_whoami", arguments: {} });
  expect(result.structuredContent).toEqual({ orgId: "org_1", userId: "user_1" });
  expect(textOf(result).split("\n")[0]).toBe("Connected as user user_1 in org org_1.");
});
it("rejects any argument, including an org", async () => {
  // isError naming "orgId"; the fake github is never touched
});
```

`list-repos.test.ts`:

```ts
it("passes limit and cursor through and returns the page", async () => {
  const listRepos = vi.fn(async () => ({
    items: [{ repo: "acme/api", projectId: "p1" }],
    nextCursor: "c2",
  }));
  const { client } = await serveTools([listReposTool], fakeGithub({ listRepos }));
  const result = await client.callTool({
    name: "github_list_repos",
    arguments: { limit: 10, cursor: "c1" },
  });
  expect(listRepos).toHaveBeenCalledWith({ limit: 10, cursor: "c1" });
  expect(result.structuredContent).toEqual({
    items: [{ repo: "acme/api", projectId: "p1" }],
    nextCursor: "c2",
  });
  expect(textOf(result).split("\n")[0]).toBe(
    "Listed 1 connected repos. More pages: pass nextCursor as cursor.",
  );
});
it("calls the service with no undefined keys when arguments are left out", async () => {
  // listRepos called with exactly {} (toHaveBeenCalledWith({}) and Object.keys length 0)
});
it("limit 51 never reaches the service", async () => {
  // isError true, listRepos not called
});
it("a summary never quotes repo names", async () => {
  // items: [{ repo: "CANARY/x", projectId: "p1" }], nextCursor: null
  // line 1 === "Listed 1 connected repos." and does not contain "CANARY"
});
it("not_connected comes back as its hint", async () => {
  // listRepos rejects new GithubReadError("not_connected", HINTS.not_connected)
  // isError, text line 2 === HINTS.not_connected
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @hub/mcp test -- tools/`
Expected: FAIL, cannot resolve `../../src/tools/whoami.js`.

- [ ] **Step 3: Implement**

- `context.ts`: `ToolContext` as above.
- `tools/exact.ts`: `Exact` and `Assert` as above.
- `tools/whoami.ts`: input `z.strictObject({})`; output `z.object({ orgId: z.string(), userId: z.string() })`; annotations `{ readOnlyHint: true, openWorldHint: false }`; `run` returns `{ orgId: ctx.auth.orgId, userId: ctx.auth.userId }`; summary exactly `Connected as user ${userId} in org ${orgId}.` Title `Who am I`. Description, exact copy:
  > Shows which hub org and user this connection acts as. Use it to check that the connection works or to confirm the org before reading data. It does not list repos: use github_list_repos for that.
- `tools/list-repos.ts`: input `z.strictObject({ limit: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).max(200).optional() })`; output mirrors `RepoList` (`items: z.array(z.object({ repo: z.string(), projectId: z.string() }))`, `nextCursor: z.string().nullable()`); annotations `{ readOnlyHint: true, openWorldHint: false }`; add `export type _ListReposOutputMatches = Assert<Exact<z.infer<typeof output>, RepoList>>;`. Summary `Listed ${n} connected repos.`, plus ` More pages: pass nextCursor as cursor.` when `nextCursor !== null`. Title `List connected GitHub repos`. Description, exact copy:
  > Lists the GitHub repos connected to the hub for this org, as owner/repo names. Call it first to find the repo to pass to github_list_pull_requests or github_get_commit. It shows only connected repos, not every repo on GitHub. Up to 50 per page; pass nextCursor back as cursor for the next page.
- `tool.ts`: extend the `summarize` JSDoc with the rule from Decision 1, one sentence, naming the forbidden fields.

Pass explicit generics to `defineTool<ToolContext, typeof input, typeof output>` if inference fails (the task 5 follow-up); note in the PR which one was needed.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @hub/mcp test && pnpm --filter @hub/mcp typecheck`
Expected: all pass. Temporarily remove `projectId` from the list-repos output schema: typecheck must fail on `_ListReposOutputMatches`. Put it back.

- [ ] **Step 5: Suggested commit**

`feat(mcp): hub_whoami and github_list_repos tools (#3)`

---

### Task 2: `github_list_pull_requests`, `github_get_commit` and their threat-model rows

**Files:**

- Create: `packages/mcp/src/tools/list-pull-requests.ts`
- Create: `packages/mcp/src/tools/get-commit.ts`
- Create: `packages/mcp/src/tools/index.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: `docs/threat-model.md` (Tools table)
- Test: `packages/mcp/test/tools/list-pull-requests.test.ts`, `packages/mcp/test/tools/get-commit.test.ts`, `packages/mcp/test/tools/index.test.ts`

**Interfaces:**

- Consumes: Task 1 (`ToolContext`, `Exact`, `Assert`, `fakeGithub`, `serveTools`, `whoamiTool`, `listReposTool`); `PullRequestList`, `CommitDetail`, `MAX_COMMIT_FILES` from `@hub/core`.
- Produces: `listPullRequestsTool`, `getCommitTool`; `commitOutputSchema` (exported from `get-commit.ts`, reused by Task 3); `tools/index.ts`: `export const hubTools: readonly HubTool<ToolContext>[] = [whoamiTool, listReposTool, listPullRequestsTool, getCommitTool];`. `src/index.ts` exports `hubTools` and `type ToolContext`.

- [ ] **Step 1: Write the failing tests**

`list-pull-requests.test.ts`:

```ts
it("passes repo, state, limit and cursor through", async () => {
  // arguments { repo: "acme/api", state: "all", limit: 5, cursor: "c1" }
  // listPullRequests called with exactly that object; structuredContent equals the fake's PullRequestList
});
it("leaves out state, limit and cursor when not given", async () => {
  // called with exactly { repo: "acme/api" }
});
it("a bad repo name returns the repo hint", async () => {
  // fake throws new GithubReadError("invalid_input", HINTS.repo) for repo "acme"
  // isError; text === `Invalid input (invalid_input).\n${HINTS.repo}`
});
it("another org's repo returns repo_not_allowed, never data", async () => {
  // fake throws GithubReadError("repo_not_allowed", HINTS.repo_not_allowed)
  // isError; text line 2 === HINTS.repo_not_allowed; no structuredContent
});
it("a summary never quotes provider text", async () => {
  // every title, headRef, baseRef, author and url contains "CANARY"; repo "acme/api"
  // line 1 === "Listed 2 pull requests in acme/api." and line 1 has no "CANARY"
  // line 2 === UNTRUSTED_NOTICE
});
it("structuredContent validates against the advertised outputSchema", async () => {
  // listPullRequestsTool.outputSchema.safeParse(result.structuredContent).success === true
});
```

`get-commit.test.ts`:

```ts
it("passes repo and sha through and returns the summary", async () => {
  // getCommit called with exactly { repo: "acme/api", sha: "abc1234" }
});
it("a branch name as sha returns the sha hint", async () => {
  // fake throws GithubReadError("invalid_input", HINTS.sha); text line 2 === HINTS.sha
});
it("a summary never quotes provider text", async () => {
  // message, authorName, authorLogin, url and fileNames contain "CANARY"
  // sha "abc1234def", filesShown 3, stats { additions: 10, deletions: 2, total: 12 }, truncated false
  // line 1 === "Commit abc1234 in acme/api: 3 files changed, +10 -2." and has no "CANARY"
});
it("says when the file list was cut", async () => {
  // truncated true, filesShown 100, stats null
  // line 1 === "Commit abc1234 in acme/api: 100 files shown, list truncated."
});
it("has no diff or patch field in its output schema", () => {
  // JSON.stringify(z.toJSONSchema(getCommitTool.outputSchema)) contains neither "patch" nor "diff"
});
```

`index.test.ts`:

```ts
it("hubTools lists the four tools sorted by name with honest annotations", async () => {
  // serveTools(hubTools, fakeGithub()) → names
  // ["github_get_commit", "github_list_pull_requests", "github_list_repos", "hub_whoami"]
  // every readOnlyHint === true; openWorldHint true exactly for the two that call GitHub
});
it("every description names when to use another tool", () => {
  // each hubTools description except hub_whoami mentions at least one other hubTools name
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @hub/mcp test -- tools/`
Expected: FAIL, cannot resolve `../../src/tools/list-pull-requests.js`.

- [ ] **Step 3: Implement**

- `tools/list-pull-requests.ts`: input `z.strictObject({ repo: z.string().min(1).max(200), state: z.enum(["open", "closed", "all"]).optional(), limit: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).max(200).optional() })`; output mirrors `PullRequestList` with `Assert<Exact<…, PullRequestList>>`; annotations `{ readOnlyHint: true, openWorldHint: true }`. Summary `Listed ${n} pull requests in ${repo}.` plus the same ` More pages: pass nextCursor as cursor.` suffix. Title `List pull requests`. Description, exact copy:
  > Lists pull requests in one connected GitHub repo: number, state, draft, author, dates and link. Titles and branch names are under untrusted_content. Get the repo name from github_list_repos. To see what one commit changed, use github_get_commit. Defaults to open pull requests; up to 50 per page; pass nextCursor back as cursor for the next page.
- `tools/get-commit.ts`: input `z.strictObject({ repo: z.string().min(1).max(200), sha: z.string().min(1).max(64) })`; output `commitOutputSchema` mirrors `CommitDetail` with `Assert<Exact<…, CommitDetail>>`; annotations `{ readOnlyHint: true, openWorldHint: true }`. Summary: `Commit ${sha.slice(0, 7)} in ${repo}: ` then `${filesShown} files changed` (with `, +${additions} -${deletions}` when `stats !== null`) when not truncated, or `${filesShown} files shown, list truncated` when truncated, then `.`. Title `Get a commit`. Description, exact copy:
  > Summarises one commit in a connected GitHub repo: author, date, line counts and the changed files with their status, at most 100 files. It never returns diffs. The message, author name and file names are under untrusted_content. Get the repo name from github_list_repos; find recent work with github_list_pull_requests instead of guessing SHAs.
- `tools/index.ts`, `src/index.ts`: as in Interfaces.
- `docs/threat-model.md` Tools table: one row per tool. Where: `packages/mcp/src/tools/<file>.ts`. Reads/writes: read-only. Secrets touched: "GitHub installation token, inside `packages/integrations` only" for the two GitHub-calling tools, "None" for the other two. Notes: threats 1 (untrusted text under `untrusted_content`, summaries quote none of it), 5 (org from `ctx`; repo allowlist in core), 11 (page cap 50, file cap 100; per-tool rate limit not built yet, #3 task 7/11).

- [ ] **Step 4: Run everything**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`
Expected: all pass.

- [ ] **Step 5: Suggested commit**

`feat(mcp): GitHub pull request and commit tools (#3)`

---

### Task 3: Resource templates in the registry and `github://{owner}/{repo}/commits/{sha}`

**Files:**

- Modify: `packages/mcp/src/registry.ts`
- Modify: `packages/mcp/src/errors.ts`
- Create: `packages/mcp/src/resource.ts`
- Create: `packages/mcp/src/resources/commit.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: `docs/threat-model.md` (Tools table, one resource row)
- Modify: `packages/mcp/test/helpers/fake-github.ts` (`serveTools` takes an optional `resources` array)
- Test: `packages/mcp/test/resources/commit.test.ts`, `packages/mcp/test/errors.test.ts`, `packages/mcp/test/registry.test.ts`

**Interfaces:**

- Consumes: `commitOutputSchema` (Task 2), `ToolContext` and test helpers (Task 1), `neverThrows`, `INTERNAL_ERROR_TEXT` (task 5), `ProtocolError`, `ProtocolErrorCode`, `ResourceNotFoundError`, `ResourceTemplate` from `@modelcontextprotocol/server`.
- Produces:
  - `resource.ts`: `export interface HubResourceTemplate<Ctx> { name: string; title: string; description: string; uriTemplate: string; outputSchema: AnyObjectSchema; read(variables: Record<string, string>, ctx: Ctx): Promise<unknown> }`
  - `errors.ts`: `export function errorText(error: unknown, name: string, logError: LogError): string` (the text `toErrorResult` already builds; `toErrorResult` now calls it) and `export function toResourceError(error: unknown, uri: string, name: string, logError: LogError): ProtocolError`
  - `registry.ts`: `HubServerOptions<Ctx>` gains `resources?: readonly HubResourceTemplate<Ctx>[]`; `export const RESOURCES_CACHE_HINT = TOOLS_LIST_CACHE_HINT` used for `resources/templates/list` and `resources/read`.
  - `resources/commit.ts`: `export const commitResource: HubResourceTemplate<ToolContext>`; `src/index.ts` exports `hubResources = [commitResource]` and the new types.

- [ ] **Step 1: Write the failing tests**

`errors.test.ts`, add:

```ts
it("toResourceError maps kinds to wire codes with fixed text", () => {
  // invalid_input → code -32602, message `Invalid input (invalid_input).\n${HINTS.sha}`
  // repo_not_allowed and not_found → instanceof ResourceNotFoundError, message is their fixed text
  // rate_limited → code -32603, message includes HINTS.rate_limited
  // new Error("postgres://u:pw@h") → code -32603, message INTERNAL_ERROR_TEXT, logError called once
});
```

`commit.test.ts` (serve `[]` tools and `resources: [commitResource]` through a `serveTools` variant that takes resources):

```ts
it("reads a commit as JSON with the notice first", async () => {
  // client.readResource({ uri: "github://acme/api/commits/abc1234" })
  // getCommit called with exactly { repo: "acme/api", sha: "abc1234" }
  // contents[0].mimeType === "application/json"; JSON.parse(text).notice === UNTRUSTED_NOTICE
  // the rest of the parsed JSON equals the fake CommitDetail
});
it("strips fields the schema does not declare", async () => {
  // fake returns CommitDetail plus installationToken: "ghs_secret"; wire never contains "ghs_secret"
});
it("another org's commit looks exactly like a missing one", async () => {
  // fake throws repo_not_allowed, then not_found: both wire errors have code -32602; result undefined
});
it("a branch name as sha is invalid params with the sha hint", async () => {
  // "github://acme/api/commits/main", fake throws invalid_input/HINTS.sha → code -32602, message ends with HINTS.sha
});
it("a URI that doesn't match the template never reaches the service", async () => {
  // "github://acme/api/pulls/1" → wire error code -32602; getCommit not called
});
it("an unexpected error is hidden and logged", async () => {
  // fake throws new Error("connect postgres://u:pw@host/db failed") → code -32603, message INTERNAL_ERROR_TEXT
  // JSON.stringify(wire) has no "postgres://"; logError called with (error, { tool: "github_commit" })
});
it("lists the template with the private cache hint", async () => {
  // resources/templates/list result has uriTemplate "github://{owner}/{repo}/commits/{sha}", ttlMs 60000, cacheScope "private"
  // a successful resources/read result also carries ttlMs 60000, cacheScope "private"
});
```

`registry.test.ts`, add to the definition checks:

```ts
it("rejects a resource with a loose output schema or a bad name", () => {
  // same allowsUndeclaredKeys check as tools; name must match TOOL_NAME_PATTERN; error names the resource
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @hub/mcp test`
Expected: FAIL, `toResourceError` is not exported and `../../src/resources/commit.js` cannot be resolved.

- [ ] **Step 3: Implement**

- `errors.ts`: move the text building out of `toErrorResult` into `errorText`; `toResourceError` uses it with the code mapping in Decision 5 (`new ResourceNotFoundError(uri, text)` for `not_found` and `repo_not_allowed`).
- `registry.ts`: run the existing name and output-schema checks on resources too (one shared set of names, so a tool and a resource can't share one). Add `"resources/templates/list"` and `"resources/read"` to `cacheHints`. Register each resource with `new ResourceTemplate(uriTemplate, { list: undefined })`. The read callback: if any variable is an array, throw `new ProtocolError(ProtocolErrorCode.InvalidParams, "Each part of the resource URI must be a single value.")`; otherwise call `read`, re-parse with `outputSchema` (failure → log, `InternalError` with `INTERNAL_ERROR_TEXT`), return `{ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ notice: UNTRUSTED_NOTICE, ...parsed.data }) }] }`. Every error goes through `toResourceError`; the callback never lets anything else escape.
- `resources/commit.ts`: name `github_commit`, title `GitHub commit`, `uriTemplate` `github://{owner}/{repo}/commits/{sha}`, `outputSchema: commitOutputSchema`, `read` = `ctx.github.getCommit({ repo: \`${owner}/${repo}\`, sha })`. Description, exact copy:
  > One commit in a connected GitHub repo, as JSON: the same summary github_get_commit returns, with no diffs. Text written by other people is under untrusted_content.
- `docs/threat-model.md`: a row for `github://{owner}/{repo}/commits/{sha}` saying the same as `github_get_commit`, plus "another org's commit returns the same -32602 as a missing one".

- [ ] **Step 4: Run everything**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`
Expected: all pass. Remove the `catch` in the resource read callback: "an unexpected error is hidden and logged" must fail. Put it back.

- [ ] **Step 5: Suggested commit**

`feat(mcp): commit resource template with leak-proof reads (#3)`

---

## Done when (this task)

- All four tools and the resource are exported from `@hub/mcp` and pass the wire tests above.
- `structuredContent` of every tool validates against its advertised `outputSchema`.
- A bad repo name returns `isError` with `HINTS.repo` (issue #3 "Done when", at package level; over HTTP in task 12).
- Issue #27 item 1 is settled: the rule is in `tool.ts` and pinned by canary tests. Comment on #27 with the PR link.

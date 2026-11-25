<!-- Implementation plan for roadmap issue #3 (Phase 3: GitHub read tools over Streamable HTTP).
     Written before coding, as CLAUDE.md rule 17 requires. -->

# Phase 3: GitHub read tools over Streamable HTTP

## Context

Issue #3 starts Gate B (authorized GitHub reads). Phases 1–2 delivered the protocol spike (`spikes/sdk-server`) and the foundation (Fastify server, tenant-scoped `@hub/db`, envelope encryption, log redaction). `packages/mcp` and `packages/integrations` are empty stubs and `apps/server` has only `/health`. This phase builds the first real MCP surface: a stateless `/mcp` endpoint, a GitHub adapter, a thin tool registry, and four read-only tools. OAuth is #4; this phase uses a dev-only auth stub.

CLAUDE.md rule 17 requires this plan to be written in `docs/superpowers/plans/` before implementation. Branch: `3-phase-3-github-read-tools-over-streamable-http` via `gh issue develop 3 --checkout`. PR uses `Closes #3`. No commits or pushes by Claude; each task ends with a suggested commit message. Review risk class: **High** (new dependencies, credential use, tenant scoping).

## Decisions (confirmed)

1. **HTTP stack:** keep Fastify. Serve `/mcp` through `createMcpHonoApp` (ADR 0001, Host/Origin validation) from `@modelcontextprotocol/hono`, bridged into Fastify by forwarding the raw request to the Hono Fetch handler. Reference: `spikes/sdk-server/src/http.ts`.
2. **Auth in #3:** an env-gated dev auth context (fixed `orgId`/`userId`), accepted only when `NODE_ENV` is explicitly `development` or `test` (production or an unset `NODE_ENV` refuses to start), behind an `AuthContext` interface that #4 replaces with the token verifier. Tenant never comes from tool arguments.
3. **GitHub App credentials:** App id and private key in env; mint 1-hour installation tokens per call with an in-memory cache. Installation id in `Integration.externalAccountId`; picked repos in `ProjectConnection.externalRef` (`owner/repo`). **No migration.**

## Global constraints

- Pin exact dependency versions at least two weeks old (`pnpm view <pkg> time --json`); justify each new dependency in the PR (msw, `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/hono` 2.0.2, `hono` 4.13.17, `@hono/node-server` 2.1.6, a JWT lib for App JWTs: prefer `jose`, already in the store).
- Provider calls only in `packages/integrations`; logic in `packages/core`; handlers in `packages/mcp` stay validate → service → map. All DB access via `forOrg` repositories.
- Provider tokens never reach the MCP client or logs. Add the PEM private-key format to `apps/server/src/redact.ts`.
- Every new/edited file gets a two-line plain-words purpose comment (JSON and generated files excepted). Relative imports end in `.js`.
- Tests use msw fixtures; never call real GitHub. Spawned-server tests are `*.e2e.test.ts`; cross-cutting suites go in root `tests/`.
- Do not edit applied migrations. Do not read `.env*`; steps needing `DATABASE_URL` are run by the user with `! <command>`.

## Review focus (edge cases to test)

1. **Header mismatch:** `Mcp-Method`/`Mcp-Name` disagreeing with the body returns `HeaderMismatchError`, checked before body parsing.
2. **DNS rebinding:** bad `Host`/`Origin` rejected.
3. **Tenant isolation:** repo not in the tenant's `ProjectConnection` returns `isError`, never data. Cross-org connection never resolves.
4. **Bad repo name:** `isError` with a fix-it hint (e.g. "use `owner/repo`; call `github_list_repos`").
5. **Pagination cap:** `limit` > 50 rejected or clamped; cursor round-trips.
6. **No full diffs:** `github_get_commit` returns file names/status/counts only, bounded file count.
7. **Untrusted content:** PR titles/bodies, commit messages go only in `untrusted_content`.
8. **Token hygiene:** installation token and PEM never appear in logs, errors or tool output.
9. **Dev auth in prod:** server refuses to start with dev auth unless `NODE_ENV` is explicitly `development` or `test`, so a forgotten `NODE_ENV` fails closed.

## File structure

```
apps/server/src/
  index.ts            modify: mount /mcp (Hono bridge), --stdio flag
  env.ts              modify: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, DEV_AUTH_* (+tests)
  redact.ts           modify: scrub PEM private keys
  mcp/http.ts         create: createMcpHonoApp + header-check middleware + Fastify bridge
  mcp/stdio.ts        create: stdio transport entry
  mcp/auth.ts         create: AuthContext interface + dev stub
packages/mcp/src/
  registry.ts         tool registry, deterministic tools/list order, ttlMs/cacheScope
  errors.ts           error mapper -> isError with fix-it hints
  tools/{whoami,list-repos,list-pull-requests,get-commit}.ts
  resources.ts        github://{owner}/{repo}/commits/{sha}
  visibility.ts       per-tenant tools for connected providers + toolsListChanged
packages/core/src/
  github/service.ts   repo/PR/commit use-cases, cursor + limit rules, repo-allowlist check
  tenant-context.ts   resolve connected providers and allowed repos via forOrg
packages/integrations/src/github/
  app-auth.ts         App JWT -> installation token (1h, in-memory cache)
  client.ts           REST calls with timeout, 429/Retry-After handling, pagination cap
  fixtures/ + test/   msw handlers
packages/db/src/      modify: read repositories (integrations, project connections) via forOrg
docs/adr/0004-stateless-serving.md, 0005-tool-naming.md
docs/threat-model.md  rows for 4 tools; rows 11 and 12 marked implemented
docs/superpowers/plans/2026-11-24-phase-3-github-read-tools.md
tests/protocol/       tools/list snapshot, header mismatch, isError vs JSON-RPC errors
```

## Tasks (TDD: failing test, run, implement, run, suggested commit)

1. **Dependencies + env.** Add pinned deps; extend `env.ts` schema and tests; PEM redaction test. _Commit:_ `chore(server): add MCP SDK deps and GitHub App env`.
2. **GitHub adapter.** `app-auth.ts` (JWT, installation token, cache, expiry margin) and `client.ts` (list repos for installation, list PRs with cursor/max 50, get commit summary). msw fixtures for success, 404, 403, 429 with `Retry-After`, timeout. _Commit:_ `feat(integrations): GitHub App adapter with msw fixtures`.
3. **db read repositories.** Integration-by-provider and project-connection lookups on `forOrg`; extend tenant tests (foreign org returns null). _Commit:_ `feat(db): tenant-scoped integration and connection reads`.
4. **Core service.** `github/service.ts` enforces repo allowlist from `ProjectConnection`, cursor and limit rules, commit file cap; returns typed results with `untrusted_content`. _Commit:_ `feat(core): GitHub read service`.
5. **MCP registry + error mapper.** Deterministic `tools/list` order, annotations (`readOnlyHint`), `outputSchema`, `structuredContent` plus two-line text summary, `cacheScope: "private"` and `ttlMs` on list results; error mapper with fix-it hints. _Commit:_ `feat(mcp): tool registry and error mapper`.
6. **Four tools + resource template.** `hub_whoami`, `github_list_repos`, `github_list_pull_requests`, `github_get_commit`, `github://{owner}/{repo}/commits/{sha}`. Strict zod input (`zod/v4`). _Commit:_ `feat(mcp): GitHub read tools and commit resource`.
7. **HTTP endpoint.** `mcp/http.ts`: header-check middleware before body parse (`HeaderMismatchError`), `createMcpHandler(..., { legacy: "reject" })`, Host/Origin validation, Fastify bridge keeping the `trace_id` hook; dev `AuthContext`. _Commit:_ `feat(server): stateless /mcp over Streamable HTTP`.
8. **Visibility + `toolsListChanged`.** Show only tools for connected providers; emit change via `subscriptions/listen` when a provider connects. Verify against the pinned SDK first; if 2.4.0 lacks it, document the gap in the ADR and test the visibility filtering alone (flagged to the reviewer). _Commit:_ `feat(mcp): per-tenant tool visibility`.
9. **`--stdio` mode.** Same registry over stdio for local use. _Commit:_ `feat(server): stdio transport`.
10. **GitHub App install flow.** Minimal: installation callback records `externalAccountId` and chosen repos as `ProjectConnection` rows (via `forOrg`), without OAuth. If this balloons past ~400 lines of real code, split it into a follow-up issue and seed via a script for Gate B testing. _Commit:_ `feat(server): GitHub App install callback`.
11. **Snapshot, ADRs, threat model.** `tools/list` snapshot test; ADR 0004 (stateless serving) and 0005 (snake_case + provider prefix); threat-model tool rows and rows 11/12 updated. _Commit:_ `docs: Phase 3 ADRs, threat model, tools/list snapshot`.
12. **Done-when verification.** Run `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`; MCP Inspector (`--protocol-era modern`) lists and calls the tools over HTTP; `structuredContent` validates against `outputSchema`; a bad repo name returns `isError` with a hint.

## Verification

- Unit: adapter (msw), core service, registry/error mapper, env, redaction.
- Protocol (root `tests/`): SDK client pinned to `2026-07-28` driving the server in-process; assert JSON-RPC wire shapes for header mismatch and `isError`.
- E2E (`*.e2e.test.ts`): spawn the server over HTTP and stdio.
- Manual: Inspector against `http://localhost:4000/mcp` with a dev org seeded with a GitHub integration (DB steps run by the user).

## Risks / open items for the reviewer

- Dev auth stub must not be reachable in production (tested).
- `subscriptions/listen` support in SDK 2.4.0 is unverified (ADR 0001 is silent); Task 8 verifies first.
- Task 10 may need to be split out to stay under ~400 lines of real code per PR.
- `docs/reference/knowledge-guide.pdf` was not read; skim it for GitHub App guidance before Task 2.

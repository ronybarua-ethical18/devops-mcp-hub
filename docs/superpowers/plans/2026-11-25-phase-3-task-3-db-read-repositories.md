<!-- Implementation plan for Phase 3 task 3 (issue #3): tenant-scoped reads of integrations and project connections.
     Written before coding; the core GitHub service (task 4) builds on these two repositories. -->

# Phase 3 Task 3: Tenant-Scoped Integration and Connection Reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `forOrg()` two read-only repositories so later code can ask "which providers does this org have connected?" and "is `owner/repo` connected for this org, and through which integration?" — with another org's rows never resolving.

**Architecture:** Two new files in `packages/db/src/repositories/`, built on the existing tenant client (`createTenantClient`), which already forces `orgId` into every query and rejects relation filters, `include` and relation `select`. So each lookup is plain single-table queries (integration, then connections) joined in TypeScript. Repositories return their own small interfaces, never Prisma row types.

**Tech Stack:** TypeScript (strict, ESM), Prisma 7.10.1 via the tenant client, Vitest 5.1.0.

**Spec:** `docs/superpowers/plans/2026-11-24-phase-3-github-read-tools.md` (task 3 and decision 3: installation id in `Integration.externalAccountId`, picked repos in `ProjectConnection.externalRef` as `owner/repo`, no migration).

## Global Constraints

- No migration and no schema change (phase plan decision 3).
- Every query goes through the tenant client from `forOrg`; no raw Prisma client, no raw SQL (CLAUDE.md §3).
- Read-only: these repositories expose no create, update or delete.
- Another org's row is "not found": `null` or `[]`, never an error that reveals it exists (review guide, pass 1).
- Only `status: "active"` integrations resolve; `revoked` and `error` never do.
- Return types are plain interfaces defined in the repository file; no Prisma model types cross the package boundary.
- Every new or edited file starts with a two-line plain-words purpose comment. Relative imports end in `.js`; type-only imports use `import type`.
- Unit tests use a fake tenant client (pattern: `packages/db/test/repositories.test.ts`). Postgres tests go in `packages/db/test/db.integration.test.ts` and only run with `TEST_DATABASE_URL` set; the user runs them with `! TEST_DATABASE_URL=<neon test branch url> pnpm --filter @hub/db test`.
- Branch: same issue (#3). `3-phase-3-github-read-tools-over-streamable-http` was merged in PR #22, so new work needs a fresh branch from `main` (see "Before starting"). PR says `Part of #3`.

## Review Focus

1. **Repo name case:** GitHub treats `Acme/API` and `acme/api` as the same repo. `findRepo("github", "Acme/API")` must match a stored `acme/api`. Pinned in Task 2.
2. **Same repo in another org:** org B connected `acme/api` too; org A's lookup must return org A's connection only, never B's integration. Pinned in Task 2 (Postgres).
3. **Revoked integration with live connections:** connections still exist after the user revokes GitHub; `findRepo` must return `null`. Pinned in Task 2.
4. **Integration without an installation id yet** (`externalAccountId` null, e.g. an install that never finished): returned with `externalAccountId: null`, so core can refuse with a clear message instead of calling GitHub with no id. Pinned in Task 1.
5. **Same repo connected to two projects in one org:** `findRepo` returns one result, deterministically (oldest connection first), not a random one. Pinned in Task 2.

---

## Before starting

- [ ] Ask the user how to branch (their decision): recreate `3-phase-3-github-read-tools-over-streamable-http` from `main` after deleting the merged remote branch, or a new `3-…` name. Do not create or push branches without that answer.

### Task 1: `integrations.listActive` and wiring into `forOrg`

**Files:**

- Create: `packages/db/src/repositories/integrations.ts`
- Modify: `packages/db/src/repositories/index.ts` (add `integrations` to `OrgRepositories` and `forOrg`)
- Modify: `packages/db/src/index.ts` (export the new types)
- Test: `packages/db/test/integrations-repo.test.ts` (new, fake tenant client)
- Test: `packages/db/test/db.integration.test.ts` (Postgres cases)

**Interfaces:**

- Produces (exported from `@hub/db`):

  ```ts
  export type ProviderName = "github" | "vercel" | "sentry" | "postgres";
  export interface ActiveIntegration {
    id: string;
    provider: ProviderName;
    /** GitHub: the App installation id. Null until the install flow (task 10) records it. */
    externalAccountId: string | null;
  }
  export interface IntegrationsRepo {
    /** Active integrations of this org, oldest first; only `provider` when given. Never another org's. */
    listActive(provider?: ProviderName): Promise<ActiveIntegration[]>;
  }
  ```

  `OrgRepositories` gains `integrations: IntegrationsRepo`.

- [ ] **Step 1: Write the failing unit tests** in `test/integrations-repo.test.ts` with a fake `integration.findMany` (records its args, returns given rows):
  - `"asks only for active rows, oldest first, and maps them"`: `listActive()` calls `findMany` with `where: { status: "active" }`, `orderBy: { createdAt: "asc" }`, `select: { id: true, provider: true, externalAccountId: true }`; returns `[{ id: "i1", provider: "github", externalAccountId: "424242" }]`.
  - `"filters by provider when given"`: `listActive("github")` → `where: { status: "active", provider: "github" }`.
  - `"keeps a missing installation id as null"`: row with `externalAccountId: null` maps to `externalAccountId: null`.
  - `"returns an empty list when the org has none"`: `[]`.
- [ ] **Step 2: Run** `pnpm --filter @hub/db test -- integrations-repo` → FAIL (module not found).
- [ ] **Step 3: Implement** `createIntegrationsRepo(db: TenantClient): IntegrationsRepo` in `integrations.ts`; add it to `forOrg` and `OrgRepositories`; export `ActiveIntegration`, `IntegrationsRepo`, `ProviderName` from `src/index.ts`. Map rows field by field (no spread of Prisma rows).
- [ ] **Step 4: Add Postgres cases** to `db.integration.test.ts` (seed through the raw `prisma` client in `beforeAll`, like the existing seeding): org A has an active `github` integration with `externalAccountId: "1001"` and a `revoked` one; org B has an active `github` one.
  - `"lists only the org's own active integrations"`: `forOrg(prisma, orgA).integrations.listActive("github")` → exactly org A's active one; org B's call never contains org A's id.
- [ ] **Step 5: Run** `pnpm --filter @hub/db test` → unit tests PASS (Postgres cases skipped without `TEST_DATABASE_URL`). Then `pnpm typecheck`.
- [ ] **Step 6: Suggest commit** (do not commit): `feat(db): tenant-scoped active integration reads (#3)`

### Task 2: `connections.findRepo`

**Files:**

- Create: `packages/db/src/repositories/connections.ts`
- Modify: `packages/db/src/repositories/index.ts`, `packages/db/src/index.ts`
- Test: `packages/db/test/connections-repo.test.ts` (new, fake tenant client)
- Test: `packages/db/test/db.integration.test.ts` (Postgres cases)

**Interfaces:**

- Consumes: `ProviderName`, `ActiveIntegration` and `IntegrationsRepo.listActive` from Task 1.
- Produces (exported from `@hub/db`):

  ```ts
  export interface RepoConnection {
    connectionId: string;
    projectId: string;
    externalRef: string; // as stored, e.g. "acme/api"
    integration: ActiveIntegration;
  }
  export interface ConnectionsRepo {
    /**
     * The org's connection for `externalRef` (case-insensitive) through an active integration of
     * `provider`. Null when not connected, connected only through a revoked or errored
     * integration, or connected only in another org. Oldest connection wins.
     */
    findRepo(provider: ProviderName, externalRef: string): Promise<RepoConnection | null>;
  }
  ```

  `OrgRepositories` gains `connections: ConnectionsRepo`.

- [ ] **Step 1: Write the failing unit tests** in `test/connections-repo.test.ts` (fake `integration.findMany` and `projectConnection.findMany`):
  - `"matches the repo case-insensitively through an active integration"`: integrations `[{ id: "i1", provider: "github", externalAccountId: "424242" }]`; `findRepo("github", "Acme/API")` → `projectConnection.findMany` called with `where: { integrationId: { in: ["i1"] }, externalRef: { equals: "Acme/API", mode: "insensitive" } }`, `orderBy: { createdAt: "asc" }`; result `{ connectionId, projectId, externalRef: "acme/api", integration: { id: "i1", … } }`.
  - `"returns null without querying connections when no active integration exists"`: no integrations → `null`, `projectConnection.findMany` not called (covers revoked: `listActive` never returns it).
  - `"returns null when the repo is not connected"`.
  - `"returns the oldest connection when the repo is in two projects"`: two rows → first one.
  - `"never uses a relation filter"`: the `where` passed to `projectConnection.findMany` has no `integration` or `project` key (the tenant client would reject it).
- [ ] **Step 2: Run** `pnpm --filter @hub/db test -- connections-repo` → FAIL.
- [ ] **Step 3: Implement** `createConnectionsRepo(db: TenantClient, integrations: IntegrationsRepo): ConnectionsRepo`: `listActive(provider)` first; if empty return `null`; then one `projectConnection.findMany` (`take: 1`, `select` of `id`, `projectId`, `integrationId`, `externalRef`); attach the matching `ActiveIntegration`. Wire into `forOrg` and export the types.
- [ ] **Step 4: Add Postgres cases** to `db.integration.test.ts`: org A connects `acme/api` (project A, active integration); org B connects `acme/api` too; org A also connects `acme/old` only through its revoked integration.
  - `"finds the org's own connection, case-insensitively"`: org A `findRepo("github", "ACME/api")` → org A's connection and integration.
  - `"never resolves another org's connection"`: org B's result has org B's ids only; an org C with no rows gets `null`.
  - `"ignores connections of a revoked integration"`: org A `findRepo("github", "acme/old")` → `null`.
- [ ] **Step 5: Run** `pnpm --filter @hub/db test`, then `pnpm typecheck && pnpm test && pnpm format:check` → all pass. Ask the user to run the Postgres suite: `! TEST_DATABASE_URL=<neon test branch url> pnpm --filter @hub/db test` and paste the result.
- [ ] **Step 6: Suggest commit** (do not commit): `feat(db): tenant-scoped repo connection lookup (#3)`

## Done when

- `forOrg(…).integrations.listActive` and `forOrg(…).connections.findRepo` exist, are exported with their types from `@hub/db`, and are read-only.
- Unit tests pass; the Postgres suite (run by the user) proves another org's connection never resolves and revoked integrations are ignored.
- No migration, no change to `scope.ts` (if a query needs a scope change, stop and ask: that is High risk on its own).

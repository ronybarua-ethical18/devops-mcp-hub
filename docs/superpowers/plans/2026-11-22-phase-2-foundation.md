# Phase 2: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the data, security and observability foundation every later phase builds on: Prisma schema on Neon, a tenant-scoped client that cannot leak across orgs, envelope-encrypted credential storage, an append-only audit table, boot-time env validation, trace-aware logging, workspace-wide Vitest, the full threat model and two ADRs.

**Architecture:** `packages/db` owns the Prisma schema, the tenant-scoping client extension, the envelope-encryption module and two small repositories (`credentials`, `audit`). Crypto lives in `packages/db` (not `packages/core`) so that `core` can later depend on `db` without a cycle. `apps/server` gets `env.ts` (Zod, fail-fast) and `logger.ts` (Pino plus an `AsyncLocalStorage` trace ID). Everything is pure and unit-testable without a database; the few tests that need real Postgres are gated on `TEST_DATABASE_URL` and skip otherwise.

**Tech Stack:** TypeScript (ESM), Node ≥ 22.23.4, Prisma + Neon Postgres, `node:crypto` (AES-256-GCM), Zod ≥ 4.2 (`zod/v4`), Pino, Vitest 5.1.0, Fastify (existing).

**Spec:** Issue [#2](https://github.com/ronybarua-ethical18/devops-mcp-hub/issues/2). Blueprint `docs/reference/blueprint-v2.pdf` sections _Revised data model_, _Tech stack_, _MCP-specific threat model_, and the credential-storage paragraph under authorization.

**Branch:** `2-phase-2-foundation-prisma-schema-tenant-isolation-encryption-threat-model` (created with `gh issue develop 2`). Open the PR with `Closes #2`.

## Global Constraints

- CLAUDE.md rule 6 overrides the usual "commit" step: **do not commit or push**. Each task ends with a suggested commit message; the user commits.
- CLAUDE.md rule 14: never read `.env*`. Anything that needs `DATABASE_URL` / `DIRECT_URL` is a step the **user** runs (`! <command>`) with their own env.
- All schema changes go through Prisma migrations in `packages/db`. Hand-written SQL (the audit trigger) lives in a migration file, never applied ad hoc.
- Tenant tables carry `orgId` (`@map("org_id")`) and `@@index([orgId])`. One org per user in the MVP: `memberships.userId` is unique, and `role` is `owner` only.
- Tenant tables are: `memberships, projects, project_connections, integrations, credentials, tool_policies, tool_calls, proposals, approvals, workflow_runs, workflow_steps, audit_events`. Non-tenant: `users, organizations, mcp_clients`.
- Risk tiers are `read | low_write | high_write`. "Not exposed" has no enum value because no tool exists for it.
- Encryption: AES-256-GCM, 12-byte random IV, 16-byte tag, 32-byte master key from env, per-credential random 32-byte data key (DEK), `key_version` column. A cloud KMS is a recorded upgrade path, not built.
- Retention (noted, not enforced this phase): `tool_calls` 30 days, `audit_events` 1 year, `proposals` deleted 7 days after use or expiry.
- Zod is imported as `zod/v4`, version `^4.2.0`. Pino logs carry `trace_id` on every line. ESM, `NodeNext`: relative imports end in `.js`; cross-package imports use `@hub/<pkg>`.
- Dependency versions are pinned exactly and must be at least two weeks old (check with `pnpm view <pkg> time --json`). Vitest stays at `5.1.0` as in the Phase 1 spikes.
- Never call a real provider or a real database in default `pnpm test`. Provider and Postgres access is mocked, or gated on `TEST_DATABASE_URL`.
- Do only what the issue asks: no repositories beyond `credentials` and `audit`, no MCP code, no pg-boss install (the ADR only records the decision).

## Review Focus

1. **Caller passes an explicit different `orgId` in `where` or `data` on the tenant client:** expect a thrown `TenantViolationError`, never a silent override and never a cross-org write. Tested in Task 3.
2. **Nested relation args (`include`, relational `select`, nested `create`/`connect`) on a tenant model:** the extension only sees top-level args, so expect them rejected with `TenantViolationError` rather than allowed to traverse into another org. Tested in Task 3.
3. **Raw SQL (`$queryRaw`, `$executeRaw`, and the `Unsafe` variants) on the tenant client:** raw SQL bypasses the filter, so expect these to throw. Tested in Task 3.
4. **Tampered or swapped sealed secrets:** a flipped byte in `ciphertext` or `wrappedDek`, a wrong master key, a wrong `keyVersion`, or a sealed blob replayed under a different `orgId:credentialId` must throw, never return garbage, and the error text must not contain the plaintext or key. Tested in Task 2.
5. **Invalid env at boot (empty strings, `PORT=abc`, master key not base64 or not 32 bytes):** expect a single error that names every bad variable and never echoes a value. Tested in Task 6.

---

## File Structure

```
packages/db/
├── package.json                     + @prisma/client, prisma, vitest; scripts: test, generate, migrate:*
├── prisma.config.ts                 schema path, DIRECT_URL for migrations
├── prisma/
│   ├── schema.prisma                15 models, enums
│   └── migrations/                  init + audit_events append-only trigger (SQL)
├── src/
│   ├── index.ts                     public exports only (no raw PrismaClient)
│   ├── crypto/envelope.ts           sealSecret / openSecret / parseMasterKey
│   ├── tenant/scope.ts              TENANT_MODELS, TenantViolationError, scopeArgs
│   ├── tenant/client.ts             createTenantClient(prisma, orgId)
│   └── repositories/
│       ├── credentials.ts           store / reveal (seals and opens inside db)
│       ├── audit.ts                 append only
│       └── index.ts                 forOrg(prisma, orgId, deps)
└── test/
    ├── envelope.test.ts
    ├── schema.test.ts               parses schema.prisma as text
    ├── scope.test.ts                pure scopeArgs
    ├── tenant-client.test.ts        mocked delegates
    └── db.integration.test.ts       gated on TEST_DATABASE_URL
apps/server/
├── src/env.ts                       loadEnv(source) → Env, throws EnvError
├── src/logger.ts                    createLogger, runWithTrace, currentTraceId
├── src/index.ts                     modified: loadEnv at boot, logger, trace hook
└── test/{env,logger}.test.ts
docs/threat-model.md                 full table (keeps the Tools section)
docs/adr/0002-envelope-encryption.md
docs/adr/0003-pg-boss-over-bullmq.md
```

---

### Task 1: Vitest across the workspace

**Files:**

- Modify: `package.json` (root), `apps/server/package.json`, `packages/{core,db,integrations,mcp}/package.json`, `apps/web/package.json`
- Create: `packages/core/test/smoke.test.ts`

**Interfaces:**

- Produces: every workspace package has a `test` script (`vitest run --passWithNoTests`), so `pnpm test` (Turborepo) runs all of them. `vitest` is a pinned devDependency in each package that has the script.

- [ ] **Step 1: Write the failing test** `packages/core/test/smoke.test.ts`: `expect(HUB_NAME).toBe("devops-mcp-hub")` (check the real value in `packages/core/src/index.ts` first and assert that).
- [ ] **Step 2: Run** `pnpm --filter @hub/core test`. Expected: FAIL, "Missing script: test".
- [ ] **Step 3: Add** `"test": "vitest run --passWithNoTests"` and `vitest@5.1.0` (exact) to each package listed. `apps/web` gets the script only if it has no existing one; do not touch its Next.js config (read `apps/web/AGENTS.md` first, per CLAUDE.md rule 8).
- [ ] **Step 4: Run** `pnpm install && pnpm test`. Expected: PASS across all packages (empty packages report no tests, exit 0), and the Phase 1 spike tests still pass.
- [ ] **Step 5: Suggested commit:** `chore: set up Vitest across the workspace`

---

### Task 2: Envelope encryption

**Files:**

- Create: `packages/db/src/crypto/envelope.ts`, `packages/db/test/envelope.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface MasterKey {
    readonly version: number;
    readonly key: Buffer;
  } // key is 32 bytes
  export interface SealedSecret {
    ciphertext: Buffer; // ct || 16-byte tag, encrypted with the DEK
    iv: Buffer; // 12 bytes, for the DEK encryption
    wrappedDek: Buffer; // wrapIv(12) || wrapped DEK(32) || tag(16), encrypted with the master key
    keyVersion: number;
  }
  export function parseMasterKey(base64: string, version?: number): MasterKey; // default version 1; throws unless exactly 32 bytes
  export function sealSecret(plaintext: string, aad: string, master: MasterKey): SealedSecret;
  export function openSecret(sealed: SealedSecret, aad: string, master: MasterKey): string;
  ```
- `aad` is `` `${orgId}:${credentialId}` `` and is used as GCM additional authenticated data on **both** encryptions, so a sealed blob copied to another credential or org fails to open.

- [ ] **Step 1: Write the failing tests** in `envelope.test.ts`:
  - `round-trips`: `openSecret(sealSecret("ghp_abc", aad, m), aad, m) === "ghp_abc"`; also an empty string and a 10 KB unicode string.
  - `uses a fresh DEK and IV per seal`: two seals of the same plaintext differ in `ciphertext`, `iv` and `wrappedDek`.
  - `rejects a flipped byte` in `ciphertext` and in `wrappedDek` (loop over every byte position of a short secret).
  - `rejects a wrong master key`, `rejects keyVersion mismatch`, `rejects different aad` (`org-a:cred-1` vs `org-b:cred-1`).
  - `errors never contain plaintext or key material`: catch each error above and assert `message` does not include the plaintext, the base64 key, or the hex of the key.
  - `parseMasterKey` throws on non-base64, 31 bytes and 33 bytes, and the error does not echo the input.
- [ ] **Step 2: Run** `pnpm --filter @hub/db test envelope`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** with `node:crypto` only (`createCipheriv("aes-256-gcm")`, `randomBytes`). Catch Node's auth-tag failure and rethrow a fixed `Error("decryption failed")` so no input or key bytes leak.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Suggested commit:** `feat(db): AES-256-GCM envelope encryption for credentials`

---

### Task 3: Tenant-scoping client extension

**Files:**

- Create: `packages/db/src/tenant/scope.ts`, `packages/db/src/tenant/client.ts`, `packages/db/test/scope.test.ts`, `packages/db/test/tenant-client.test.ts`
- Depends on: the generated Prisma client from Task 4 for the real types. Write `scope.ts` against `unknown` args first so `scope.test.ts` runs without a database or generated client; write `client.ts` after Task 4's `prisma generate`.

**Interfaces:**

- Produces:

  ```ts
  export const TENANT_MODELS: ReadonlySet<string>; // PascalCase Prisma model names of the 12 tenant tables
  export class TenantViolationError extends Error {}
  export function scopeArgs(model: string, operation: string, args: unknown, orgId: string): unknown;
  // returns new args; never mutates the input

  export type TenantClient = ReturnType<typeof createTenantClient>;
  export function createTenantClient(prisma: PrismaClient, orgId: string): /* extended client */;
  ```

- Rules for `scopeArgs` (fail closed):
  - Reads/updates/deletes (`findFirst`, `findFirstOrThrow`, `findMany`, `findUnique`, `findUniqueOrThrow`, `count`, `aggregate`, `groupBy`, `update`, `updateMany`, `delete`, `deleteMany`): AND `{ orgId }` into `where`.
  - `create`: set `data.orgId`. `createMany`: set it on every row. `upsert`: scope `where` and set `orgId` in `create`; forbid `orgId` in `update`.
  - Any `orgId` present in `where` or `data` that is not equal to `orgId` throws `TenantViolationError`. An equal value is allowed.
  - Any unknown operation on a tenant model throws. Non-tenant models pass through unchanged.
  - Tenant-model args containing `include`, a relational `select`, or nested write keys (`create`, `connect`, `connectOrCreate`, `createMany`, `update`, `delete`, `set` inside a relation field) throw `TenantViolationError`. Scalar `select` is fine.
  - The tenant client exposes no `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`; each is overridden to throw `TenantViolationError`.

- [ ] **Step 1: Write failing tests** `scope.test.ts` (pure):
  - `findMany without where gets { AND: [{ orgId }] }` (assert the exact output shape you choose, and that the input object is unchanged).
  - `findMany with where keeps the caller filter and adds orgId`.
  - `findUnique by id gains orgId` (extended where-unique).
  - `create sets data.orgId`; `createMany sets it on every row`; `upsert` cases.
  - `explicit other-org orgId in where throws`; `... in data throws`; `... inside OR/AND/NOT nesting throws` (walk `where` recursively for the key `orgId`).
  - `include / relational select / nested create throw` (Review Focus 2).
  - `unknown operation throws`; `non-tenant model passes through` (`User`, `Organization`, `McpClient`).
  - `every name in TENANT_MODELS exists in schema.prisma` is covered in Task 4's schema test, not here.
- [ ] **Step 2: Run** `pnpm --filter @hub/db test scope`. Expected: FAIL.
- [ ] **Step 3: Implement `scope.ts`** to satisfy the rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5 (after Task 4): Write failing tests** `tenant-client.test.ts` with a fake `PrismaClient` whose model delegates are `vi.fn()` spies (CLAUDE.md rule 13: mock Postgres):
  - `calling project.findMany() reaches the underlying delegate with orgId in where` for org A and for org B (the two calls differ).
  - `a forgotten where cannot leak`: the delegate never receives args without the org filter for any tenant model (loop over `TENANT_MODELS` × a few operations).
  - `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe` each throw `TenantViolationError` (Review Focus 3).
- [ ] **Step 6: Implement `client.ts`** with `prisma.$extends({ query: { $allModels: { $allOperations({ model, operation, args, query }) { return query(scopeArgs(model, operation, args, orgId)); } } }, client: { $queryRaw: ..., ... } })`.
- [ ] **Step 7: Run** `pnpm --filter @hub/db test`. Expected: PASS.
- [ ] **Step 8: Suggested commit:** `feat(db): tenant-scoping Prisma client extension`

---

### Task 4: Prisma schema and migrations

**Files:**

- Create: `packages/db/prisma.config.ts`, `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/*`, `packages/db/test/schema.test.ts`
- Modify: `packages/db/package.json` (deps `@prisma/client` and `prisma`, pinned; scripts `generate`, `migrate:dev`, `migrate:deploy`, `typecheck` runs `prisma generate` first), `.gitignore` if the generated client path is not already ignored
- Read before starting: the Prisma docs for the **installed** version (client generation path, `prisma.config.ts`, driver adapter requirement). This plan does not assume them.

**Interfaces:**

- Produces models (Prisma names; every field mapped to snake_case with `@map`, tables with `@@map`), UUID primary keys, `createdAt` on all, `updatedAt` where rows mutate:
  - `User { email unique, name? }`, `Organization { name, slug unique }`
  - `Membership { orgId, userId unique, role enum(owner) }`
  - `Project { orgId, name, slug; unique(orgId, slug) }`
  - `Integration { orgId, provider enum(github|vercel|sentry|postgres), status enum(active|revoked|error), externalAccountId?, scopes String[] }`
  - `ProjectConnection { orgId, projectId, integrationId, externalRef; unique(projectId, integrationId, externalRef) }`
  - `Credential { orgId, integrationId, ciphertext Bytes, iv Bytes, wrappedDek Bytes, keyVersion Int, expiresAt?, rotatedAt? }`
  - `ToolPolicy { orgId, projectId, toolName, effect enum(allow|deny|require_approval), riskTier enum(read|low_write|high_write), constraints Json; unique(projectId, toolName) }`
  - `McpClient { clientId unique (metadata document URL), name?, firstSeenAt, lastSeenAt }`
  - `ToolCall { orgId, userId, mcpClientId?, toolName, argsHash, status enum(ok|error|denied), latencyMs, resultBytes, traceId; index(orgId, createdAt) }`
  - `Proposal { orgId, toolName, payload Json, payloadHash, status enum(pending|approved|rejected|expired|committed), requestedBy, expiresAt, usedAt? }`
  - `Approval { orgId, proposalId, approverId, channel enum(dashboard|elicitation), decision enum(approve|reject), decidedAt }`
  - `WorkflowRun { orgId, status enum(pending|running|succeeded|failed), traceId }`, `WorkflowStep { orgId, runId, name, status, attempts Int, idempotencyKey; unique(runId, idempotencyKey) }`
  - `AuditEvent { orgId, actorId, action, target, outcome, traceId, metadata Json?, createdAt }`
  - Retention is documented as a comment above `ToolCall`, `AuditEvent` and `Proposal`.
- `AuditEvent` has no `updatedAt`.
- A hand-written migration adds a Postgres trigger `audit_events_append_only` that raises on `UPDATE` and `DELETE` of `audit_events`. A later phase's retention job will use a dedicated privileged function; note this in a SQL comment.

- [ ] **Step 1: Write the failing test** `schema.test.ts` (reads `prisma/schema.prisma` as text, no DB):
  - `every model with an orgId field has @@index containing orgId` (leading column).
  - `the set of models with orgId equals TENANT_MODELS` from Task 3 (both directions).
  - `users, organizations and mcp_clients have no orgId`.
  - `memberships.userId is unique and role enum has only owner`.
  - `credentials has ciphertext, iv, wrappedDek, keyVersion`; `audit_events has no updatedAt`.
  - `a migration SQL file contains the audit_events append-only trigger`.
- [ ] **Step 2: Run** `pnpm --filter @hub/db test schema`. Expected: FAIL.
- [ ] **Step 3: Write `schema.prisma`**, then `pnpm --filter @hub/db generate`. Create the init migration with `prisma migrate dev --create-only`, then add the trigger as a second hand-written migration.
- [ ] **Step 4: Run** `pnpm --filter @hub/db test schema && pnpm --filter @hub/db typecheck`. Expected: PASS.
- [ ] **Step 5: USER STEP (needs the Neon connection strings, never read by Claude).** Use a dedicated Neon dev branch. Prisma migrations need the **direct** (non-pooled) connection in `DIRECT_URL`; runtime uses the pooled `DATABASE_URL`. Run: `! pnpm --filter @hub/db migrate:deploy`. Expected: both migrations applied; then in the Neon SQL editor, `UPDATE audit_events SET action = 'x'` on a test row fails with the trigger's message.
- [ ] **Step 6: Suggested commit:** `feat(db): Prisma schema, migrations and audit append-only trigger`

> Task order note: do Task 3's pure steps 1-4 first (they need no client), then this task, then Task 3's steps 5-8.

---

### Task 5: Repositories (credentials, audit) and the public API

**Files:**

- Create: `packages/db/src/repositories/credentials.ts`, `audit.ts`, `index.ts`, `packages/db/test/repositories.test.ts`, `packages/db/test/db.integration.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**

- Consumes: `createTenantClient`, `sealSecret`, `openSecret`, `MasterKey` from Tasks 2-3.
- Produces:

  ```ts
  export interface RepoDeps {
    master: MasterKey;
  }
  export function forOrg(
    prisma: PrismaClient,
    orgId: string,
    deps: RepoDeps,
  ): {
    credentials: {
      store(input: {
        integrationId: string;
        plaintext: string;
        expiresAt?: Date;
      }): Promise<{ id: string }>;
      reveal(id: string): Promise<string | null>; // null when the id belongs to another org or does not exist
    };
    audit: {
      append(event: {
        actorId: string;
        action: string;
        target: string;
        outcome: string;
        traceId: string;
        metadata?: unknown;
      }): Promise<void>;
    };
  };
  ```

  `credentials.store` generates the credential `id` with `randomUUID()` **before** sealing, so `aad = `${orgId}:${id}``. The audit repository exposes `append` only: no update, delete or read-modify API.

- `packages/db/src/index.ts` exports `forOrg`, `parseMasterKey`, `TenantViolationError`, and types. It must **not** export `PrismaClient` construction helpers other than a `createPrisma(databaseUrl)` used by the server, and must not export the raw client from `forOrg`.

- [ ] **Step 1: Write failing tests** `repositories.test.ts` with a mocked tenant client (spies):
  - `store seals the plaintext: the row passed to credential.create contains no plaintext bytes` (search `ciphertext` for the plaintext).
  - `reveal round-trips what store wrote` (spy storage in memory).
  - `reveal returns null for a row the tenant client does not return` (simulates another org).
  - `audit.append calls auditEvent.create with orgId from the scope` and the module exposes no `update`/`delete` keys.
- [ ] **Step 2: Run** `pnpm --filter @hub/db test repositories`. Expected: FAIL.
- [ ] **Step 3: Implement** the repositories on top of `createTenantClient`.
- [ ] **Step 4: Write `db.integration.test.ts`** using `describe.skipIf(!process.env.TEST_DATABASE_URL)`: seed two orgs; org B cannot `findMany`, `findUnique`, `update`, `delete` org A's project; encrypt/decrypt round-trip through real `credentials`; audit `UPDATE` and `DELETE` through a raw admin connection are rejected by the trigger. Without the env var the file reports skipped, not failed.
- [ ] **Step 5: Run** `pnpm --filter @hub/db test`. Expected: PASS (integration file skipped). **USER STEP:** `! TEST_DATABASE_URL=<neon test branch> pnpm --filter @hub/db test db.integration` and expect PASS; this is the "tenant isolation proved against Neon" evidence for the issue's done-when.
- [ ] **Step 6: Suggested commit:** `feat(db): credentials and audit repositories behind forOrg`

---

### Task 6: Env validation and logger in `apps/server`

**Files:**

- Create: `apps/server/src/env.ts`, `apps/server/src/logger.ts`, `apps/server/test/env.test.ts`, `apps/server/test/logger.test.ts`
- Modify: `apps/server/src/index.ts`, `apps/server/package.json` (deps `zod@^4.2.0`, `pino`, `@hub/db: workspace:*`)

**Interfaces:**

- Produces:

  ```ts
  export interface Env {
    NODE_ENV: "development" | "test" | "production";
    PORT: number; // default 4000
    LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace"; // default "info"
    DATABASE_URL: string; // postgres:// or postgresql://
    HUB_MASTER_KEY: MasterKey; // parsed from base64, 32 bytes
  }
  export class EnvError extends Error {
    readonly variables: string[];
  } // names only
  export function loadEnv(source: Record<string, string | undefined>): Env;

  export function createLogger(opts: { level: string }): pino.Logger;
  export function runWithTrace<T>(traceId: string, fn: () => T): T;
  export function currentTraceId(): string; // "none" outside a trace
  ```

- [ ] **Step 1: Write failing tests** `env.test.ts`:
  - `valid source parses with defaults` (PORT 4000, LOG_LEVEL info).
  - `missing DATABASE_URL and HUB_MASTER_KEY: one EnvError whose variables list contains both names`.
  - `PORT=abc`, `PORT=0`, `PORT=70000`, `empty-string DATABASE_URL`, `DATABASE_URL=mysql://...`, `HUB_MASTER_KEY` not base64 / 31 bytes / 33 bytes each fail.
  - `no error message or variables entry contains any supplied value` (use a distinctive secret string as the bad master key and assert it never appears in `message`).
- [ ] **Step 2: Write failing tests** `logger.test.ts` (capture output through a Pino destination stream):
  - `every line has trace_id`, `"none"` outside `runWithTrace` and the given ID inside, including after an `await` (AsyncLocalStorage survives async).
  - `redacts token, password, authorization and *.token fields` (a logged `{ token: "ghp_x" }` never appears in output).
- [ ] **Step 3: Run** `pnpm --filter @hub/server test`. Expected: FAIL.
- [ ] **Step 4: Implement** `env.ts` with a Zod 4 schema and `safeParse`, mapping issues to variable names only; `logger.ts` with `AsyncLocalStorage<string>`, Pino `mixin()` returning `{ trace_id }`, and `redact` paths.
- [ ] **Step 5: Wire `index.ts`:** call `loadEnv(process.env)` first and exit 1 with the `EnvError` message on failure (before any listen). Create the logger and pass it to Fastify as `loggerInstance`. An `onRequest` hook calls `runWithTrace(randomUUID(), done)`; honor an incoming `traceparent` header's trace ID only if you choose to, otherwise leave as a later stretch.
- [ ] **Step 6: Run** `pnpm --filter @hub/server typecheck && pnpm --filter @hub/server test`. Expected: PASS. Then smoke: `pnpm --filter @hub/server start` with `DATABASE_URL` and `HUB_MASTER_KEY` unset must exit 1 naming both variables and no values. (Running with real values is a USER STEP.)
- [ ] **Step 7: Suggested commit:** `feat(server): fail-fast env validation and trace-aware Pino logger`

---

### Task 7: Threat model and ADRs

**Files:**

- Modify: `docs/threat-model.md` (replace the placeholder paragraph, keep the Tools section)
- Create: `docs/adr/0002-envelope-encryption.md`, `docs/adr/0003-pg-boss-over-bullmq.md`

**Interfaces:**

- Produces `docs/threat-model.md` with the blueprint table's 12 rows, each with columns: `Threat | Example in this hub | Mitigation | Owning phase | Test`. Rows: indirect prompt injection; injection from end users; exfiltration through writes; token passthrough (confused deputy); cross-tenant access; SSRF through user-supplied hosts; SQL abuse; secrets in logs; PII in error events; tool definition drift (rug pull); resource exhaustion; DNS rebinding. Copy the example and mitigation text from the blueprint (pages 10-11). `Owning phase` maps each row to the issue number that builds the mitigation (e.g. cross-tenant → #2, SQL abuse → #10, DNS rebinding → #3). `Test` is `—` for rows with no test yet, and names the Phase 2 test file for the rows this phase covers (cross-tenant: `packages/db/test/tenant-client.test.ts`; secrets in logs: `apps/server/test/logger.test.ts`, partial: logger redaction only).
- Add a short section above the table: the lethal-trifecta framing (private data, untrusted content, exfiltration channel) from the blueprint, and one line: "one test per row by week 12 (#11)".
- ADR format follows `docs/adr/0001-mcp-spec-revision-and-sdk-pin.md` (Status, Date, Issue, Context, Decision, Consequences).
  - **0002:** AES-256-GCM envelope encryption. Decision: per-credential DEK, master key from env, `key_version` column, AAD `orgId:credentialId` on both layers; crypto lives in `packages/db` to avoid a core↔db cycle. Consequences: rotation means re-wrapping DEKs (no re-encrypting secrets); a leaked master key exposes every credential, so it never sits in the repo or logs; KMS is the recorded upgrade path (swap the wrap step).
  - **0003:** pg-boss over BullMQ. Decision: jobs run on the same Postgres, no Redis. Consequences: one less service to run and pay for, transactional enqueue next to business writes; lower throughput ceiling than Redis, acceptable for approval and workflow volume. Not installed in this phase.

- [ ] **Step 1: Write** the three documents.
- [ ] **Step 2: Verify:** `pnpm format:check` passes; a grep confirms 12 threat rows (`grep -c '^| ' docs/threat-model.md` accounts for the Tools table rows separately) and both ADR files exist.
- [ ] **Step 3: Suggested commit:** `docs: full threat model and ADRs for envelope encryption and pg-boss`

---

### Task 8: Done-when verification

- [ ] **Step 1: Run** `pnpm format:check && pnpm typecheck && pnpm test` from the repo root and paste the output.
- [ ] **Step 2:** Confirm each "Done when" line has evidence: migrations applied to Neon (Task 4 step 5), tenant-isolation test passing both mocked and against Neon (Tasks 3 and 5), encrypt/decrypt round-trip test (Task 2), threat model committed (Task 7).
- [ ] **Step 3:** Open the PR with `Closes #2`, using `.github/pull_request_template.md`. The user pushes and opens it.
- [ ] **Step 4:** Update `README.md` status line only if the Phase 1 PR did not already; otherwise leave it.

---

## Self-Review

- **Spec coverage:** schema for all 15 tables (Task 4), `org_id` + index (Task 4), Prisma extension (Task 3), append-only audit + retention notes (Tasks 4, 5), envelope encryption with `key_version` (Task 2), Zod env fail-fast (Task 6), Pino `trace_id` (Task 6), Vitest workspace-wide (Task 1), threat table (Task 7), two ADRs (Task 7). Done-when: migrations on Neon (Task 4), isolation test (Tasks 3, 5), round-trip test (Task 2), threat model (Task 7).
- **Type consistency:** `MasterKey` is defined in Task 2 and used in Tasks 5 and 6; `TENANT_MODELS` is defined in Task 3 and checked against the schema in Task 4; `forOrg`'s `RepoDeps` carries `MasterKey`; model names are PascalCase in `TENANT_MODELS` and the schema.
- **Known judgment calls for the reviewer:** (1) crypto in `packages/db`, not `core`; (2) nested relation args are rejected on the tenant client rather than scoped; (3) non-tenant models (`User`, `Organization`, `McpClient`) pass through the tenant client; (4) `project_connections` fields are not in the blueprint, so `externalRef` is a chosen design.

<!-- The step-by-step plan for issue #18: the small security and schema fixes left over from Phase 2.
     Each task closes one box of that issue, with the test that proves it. -->

# Phase 2 Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every box of issue #18 before Phase 3 (#3) starts. The boxes cover tenant-client edge cases, wider log redaction, auditing `credentials.reveal`, an overclaiming comment, missing foreign-key indexes and two caret ranges.

**Architecture:** No new subsystems. Five of the changes stay inside an existing file and its test: `scope.ts`, `logger.ts` (plus a new `redact.ts` beside it), `credentials.ts`, `schema.prisma`, and the threat model. The sixth is one new generated migration, which adds indexes only.

**Tech Stack:** TypeScript (ESM), Prisma 7.10.1 + Neon Postgres, Pino, Vitest 5.1.0.

**Spec:** Issue [#18](https://github.com/ronybarua-ethical18/devops-mcp-hub/issues/18). Background: `docs/threat-model.md` row 8, and the Phase 2 plan `docs/superpowers/plans/2026-11-22-phase-2-foundation.md`.

**Branch:** `18-phase-2-follow-ups-tenant-client-edge-cases-log-redaction-audit-indexes`. The **user** creates it with `gh issue develop 18 --checkout`, because that command creates the branch on GitHub. The PR body uses `Closes #18`.

## Global Constraints

- CLAUDE.md rule 6: **do not commit or push.** Each task ends with a suggested commit message, and the user commits.
- CLAUDE.md rule 14: never read `.env*`. Steps that need `DIRECT_URL` or `TEST_DATABASE_URL` are run by the **user**, in their own terminal.
- **Never edit an applied migration** (`20261122000000_init`, `20261122000100_audit_events_append_only`, `20261123000000_org_bound_foreign_keys`). Changing one changes its checksum and breaks `migrate deploy`.
- Every created or edited file starts with a two-line plain-words purpose comment (memory rule). Keep the existing header if it's still true, and update it if the change makes it wrong. Skip JSON files.
- TDD: write each test first and watch it fail for the expected reason.
- The tenant client stays **fail-closed**: anything a check can't prove safe throws `TenantViolationError`.
- Done means `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check` all pass.

## Review Focus

1. **Token inside a log message string**, not a field: `logger.info(\`using ${token}\`)` must not print the token. Covered by a test in Task 2.
2. **Token inside an `Error`** passed as `err`: the message and the stack must be scrubbed. Covered by a test in Task 2.
3. **Over-redaction:** UUIDs, `trace_id` and ordinary words must survive the value scrub. Covered by a test in Task 2.
4. **The audit write fails during `reveal`:** the token must not be returned (fail closed). Covered by a test in Task 3.
5. **Cursor on `organization` queries:** a cursor must be forced to the scope's own row, as `where` already is. Covered by a test in Task 1.

---

### Task 1: Compound unique keys and `cursor` in the tenant client

**Files:**

- Modify: `packages/db/src/tenant/scope.ts`, in `checkWhere` and in `scopeArgs`'s organization and `WHERE_OPERATIONS` branches
- Test: `packages/db/test/scope.test.ts`, `packages/db/test/db.integration.test.ts`

**Interfaces:**

- Produces: `scopeArgs` behaves as before, except that `cursor` is now checked and scoped. No signature changes.

- [ ] **Step 1: Write the failing unit tests** in `scope.test.ts`, as a new `describe("scopeArgs: compound keys and cursor")`:

```ts
it("rejects another org inside a compound unique key", () => {
  const key = { orgId_slug: { orgId: OTHER, slug: "web" } };
  expect(() => scopeArgs("Project", "findUnique", { where: key }, ORG)).toThrow(
    TenantViolationError,
  );
  expect(() =>
    scopeArgs(
      "Project",
      "upsert",
      { where: key, create: { name: "w", slug: "web" }, update: {} },
      ORG,
    ),
  ).toThrow(TenantViolationError);
  expect(() =>
    scopeArgs(
      "Project",
      "findMany",
      { where: { OR: [{ orgId_id: { orgId: OTHER, id: "p" } }] } },
      ORG,
    ),
  ).toThrow(TenantViolationError);
});

it("allows a compound unique key with the scope's own org", () => {
  const where = { orgId_slug: { orgId: ORG, slug: "web" } };
  expect(scopeArgs("Project", "findUnique", { where }, ORG)).toEqual({
    where: { ...where, orgId: ORG },
  });
});

it("adds orgId to a cursor and rejects a foreign one", () => {
  expect(scopeArgs("Project", "findMany", { cursor: { id: "p1" }, take: 2 }, ORG)).toEqual({
    cursor: { id: "p1", orgId: ORG },
    take: 2,
    where: { orgId: ORG },
  });
  for (const cursor of [{ id: "p", orgId: OTHER }, { orgId_id: { orgId: OTHER, id: "p" } }]) {
    expect(() => scopeArgs("Project", "findMany", { cursor }, ORG)).toThrow(TenantViolationError);
  }
});

it("forces an organization cursor onto the scope's own row", () => {
  expect(scopeArgs("Organization", "findMany", { cursor: { id: ORG } }, ORG)).toEqual({
    cursor: { id: ORG },
    where: { id: ORG },
  });
  expect(() => scopeArgs("Organization", "findMany", { cursor: { id: OTHER } }, ORG)).toThrow(
    TenantViolationError,
  );
});
```

- [ ] **Step 2: Run** `pnpm --filter @hub/db test -- scope`. Expected: the 4 new tests FAIL, with no throw on the compound keys and the cursor returned unchanged.

- [ ] **Step 3: Implement.**
  - In `checkWhere`, add a last `else if`: if the value is a plain object that has the `scopeKey` as its own key (this is how Prisma's compound unique inputs look, such as `orgId_slug` and `orgId_id`), it must equal `orgId`. Otherwise throw `"${scopeKey} in compound key "${key}" does not match the tenant scope"`. Keep it after the relation-field branch.
  - In both the organization branch and the `WHERE_OPERATIONS` branch, when `input["cursor"] !== undefined`, run `checkWhere(cursor, orgId, scopeKey)` and return `cursor: { ...cursor, [scopeKey]: orgId }`. Prisma 7 accepts extra filters in a unique input, so a cursor that names another org's row matches nothing.

- [ ] **Step 4: Run** `pnpm --filter @hub/db test`. Expected: PASS, with no other tests changed.

- [ ] **Step 5: Add the integration test** in `db.integration.test.ts` (it runs on Neon in Task 4, Step 6):

```ts
it("ignores a cursor that points at another org's row", async () => {
  const b = createTenantClient(prisma, ids.orgB);
  await prisma.project.create({ data: { orgId: ids.orgB, name: "b", slug: `b-${run}` } });
  expect(await b.project.findMany({ cursor: { id: ids.projectA }, take: 5 })).toEqual([]);
});
```

- [ ] **Step 6: Suggested commit:** `fix(db): scope compound unique keys and cursors on the tenant client`

---

### Task 2: Wider log redaction

**Files:**

- Create: `apps/server/src/redact.ts`
- Modify: `apps/server/src/logger.ts`, replacing `REDACT_PATHS` with an import and wiring the scrub into `pino(...)`
- Modify: `docs/threat-model.md`, row 8's test column and the "Logs:" bullet
- Test: `apps/server/test/logger.test.ts`

**Interfaces:**

- Produces, in `apps/server/src/redact.ts`:
  - `export const REDACT_PATHS: readonly string[]` contains the existing six paths, plus `cookie`, `*.cookie`, `headers.authorization`, `headers.cookie`, `headers["set-cookie"]`, `*.headers.authorization`, `*.headers.cookie`, `*.headers["set-cookie"]`, `DATABASE_URL`, `DIRECT_URL`, `HUB_MASTER_KEY`, `*.DATABASE_URL`, `*.DIRECT_URL` and `*.HUB_MASTER_KEY`.
  - `export function scrubString(text: string): string` replaces token values with `[REDACTED]`.
  - `export function scrubSecrets(value: unknown): unknown` deep-scrubs strings in plain objects, arrays and `Error` (message and stack). It never mutates its input.
- The value patterns, which `scrubString` must match:
  - GitHub: `/\bgh[pousr]_[A-Za-z0-9]{20,}/g` and `/\bgithub_pat_[A-Za-z0-9_]{20,}/g`
  - Sentry: `/\bsntry[su]_[A-Za-z0-9+/=_-]{20,}/g`
  - Bearer: `/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g`, replaced with `Bearer [REDACTED]`
  - The password in a Postgres URL: `/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/g`, replaced with `$1[REDACTED]@`
  - Vercel tokens have no stable prefix, so field-name redaction covers them. Note this in the threat model as remaining risk.

- [ ] **Step 1: Write the failing tests** in `logger.test.ts`:

```ts
it("redacts cookies, set-cookie, nested authorization and secret env names", () => {
  const { logger, lines } = capture();
  logger.info({
    req: { headers: { authorization: "Bearer AAAAAAAAAAAAAAAAAAAA1", cookie: "sid=COOKIE1" } },
    res: { headers: { "set-cookie": "sid=COOKIE2" } },
    env: { DATABASE_URL: "postgres://u:DBPASS1@h/db", HUB_MASTER_KEY: "MASTERKEY1" },
  });
  const out = lines.join("\n");
  for (const s of ["AAAAAAAAAAAAAAAAAAAA1", "COOKIE1", "COOKIE2", "DBPASS1", "MASTERKEY1"]) {
    expect(out).not.toContain(s);
  }
});

it("scrubs token formats from any string, including the message", () => {
  const { logger, lines } = capture();
  const ghp = `ghp_${"a".repeat(36)}`;
  const pat = `github_pat_${"b".repeat(40)}`;
  const sentry = `sntrys_${"c".repeat(40)}`;
  logger.info({ note: `pasted ${pat}`, list: [sentry] }, `using ${ghp}`);
  logger.warn("connect postgresql://user:PGSECRET@host/db failed");
  const out = lines.join("\n");
  for (const s of [ghp, pat, sentry, "PGSECRET"]) expect(out).not.toContain(s);
});

it("scrubs a token from an Error message and stack", () => {
  const { logger, lines } = capture();
  const ghp = `ghp_${"d".repeat(36)}`;
  logger.error({ err: new Error(`bad token ${ghp}`) }, "failed");
  expect(lines.join("\n")).not.toContain(ghp);
});

it("leaves ordinary values alone", () => {
  const { logger, records } = capture();
  const id = "3f2b6c1e-8a4d-4c2b-9e7f-1a2b3c4d5e6f";
  runWithTrace(id, () => logger.info({ id, word: "ghost_writer" }, "plain message"));
  expect(records()[0]).toMatchObject({
    id,
    word: "ghost_writer",
    msg: "plain message",
    trace_id: id,
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @hub/server test`. Expected: the first 3 tests FAIL because their secrets show up in the output. The 4th may already pass, which is fine: it's a guard.

- [ ] **Step 3: Implement** `redact.ts` as described in Interfaces. In `logger.ts`, pass `redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" }` and `formatters: { log: (obj) => scrubSecrets(obj) as Record<string, unknown> }`. Also pass `hooks: { logMethod }`, which runs `scrubString` on every string argument, so message strings are covered. If Pino's `err` serializer runs after `formatters.log`, scrub the `Error` before serialization, inside `logMethod`. The `Error` test decides which.

- [ ] **Step 4: Run** `pnpm --filter @hub/server test`. Expected: PASS.

- [ ] **Step 5: Update `docs/threat-model.md`.** Change row 8's test column to `apps/server/test/logger.test.ts` (hub logs: secret fields, cookies, env secrets, and GitHub/Sentry/Bearer/Postgres-URL values; build-log scrubbing is still #5). Change the "Logs:" bullet to match. Add one line saying Vercel tokens have no prefix, so they are redacted by field name only.

- [ ] **Step 6: Suggested commit:** `fix(server): redact cookies, env secrets and known token formats in logs`

---

### Task 3: Audit every `credentials.reveal`

**Files:**

- Modify: `packages/db/src/repositories/credentials.ts`, `packages/db/src/repositories/index.ts`
- Modify: `docs/threat-model.md`, adding "every credential reveal is audited" to the audit-trail bullet
- Test: `packages/db/test/repositories.test.ts`, `packages/db/test/db.integration.test.ts`

**Interfaces:**

- Consumes: `AuditRepo` from `repositories/audit.ts` (unchanged).
- Produces:
  - `export interface RevealContext { actorId: string; traceId: string }` in `credentials.ts`
  - `reveal(id: string, ctx: RevealContext): Promise<string | null>`
  - `createCredentialsRepo(db: TenantClient, orgId: string, master: MasterKey, audit: AuditRepo): CredentialsRepo`
  - `forOrg` builds the audit repo first and passes it in.
- Audit events (`action: "credential.reveal"`, `target: <credential id>`, the ctx's `actorId` and `traceId`, no metadata, **never the value**):
  - decrypted → `outcome: "ok"`, written **before** the plaintext is returned
  - no visible row → `outcome: "not_found"`, then return `null`
  - decryption throws → `outcome: "error"`, then rethrow the original error
  - if `audit.append` rejects, `reveal` rejects and returns no token

- [ ] **Step 1: Write the failing tests** in `repositories.test.ts`. Pass `createAuditRepo(db, "org-a")` as the 4th argument everywhere, add `ctx = { actorId: "u1", traceId: "t1" }` to the existing `reveal` calls, then add:

```ts
it("audits a successful reveal with the credential id, never the value", async () => {
  const { db, auditCreate } = fakeTenantDb("org-a");
  const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
  const { id } = await repo.store({ integrationId: "i1", plaintext: "tok-secret" });
  await repo.reveal(id, ctx);
  expect(auditCreate).toHaveBeenCalledWith({
    data: {
      orgId: "org-a",
      actorId: "u1",
      action: "credential.reveal",
      target: id,
      outcome: "ok",
      traceId: "t1",
    },
  });
  expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("tok-secret");
});

it("audits an unknown id as not_found", async () => {
  /* reveal("nope", ctx) → null; outcome "not_found", target "nope" */
});

it("audits a failed decryption as error and still throws", async () => {
  /* forged row as in "refuses to open a row copied under another org id"; rejects "decryption failed"; outcome "error" */
});

it("returns no token when the audit write fails", async () => {
  const { db, auditCreate } = fakeTenantDb("org-a");
  const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
  const { id } = await repo.store({ integrationId: "i1", plaintext: "tok" });
  auditCreate.mockRejectedValueOnce(new Error("db down"));
  await expect(repo.reveal(id, ctx)).rejects.toThrow("db down");
});
```

- [ ] **Step 2: Run** `pnpm --filter @hub/db test -- repositories`. Expected: FAIL. The new tests fail because no audit call is made. Typecheck errors on the 4th argument are also expected.

- [ ] **Step 3: Implement** the Interfaces block in `credentials.ts` and wire it up in `index.ts`. Update the header comment in `credentials.ts`, because "every reveal is written to the audit log" is now part of its purpose.

- [ ] **Step 4: Update the integration test.** Change the existing `reveal(id)` calls in `db.integration.test.ts` to `reveal(id, { actorId: "u1", traceId: run })`. After org A's reveal, add:

```ts
expect(
  await prisma.auditEvent.count({
    where: { orgId: ids.orgA, action: "credential.reveal", target: id },
  }),
).toBe(1);
```

- [ ] **Step 5: Run** `pnpm typecheck && pnpm --filter @hub/db test`. Expected: PASS.

- [ ] **Step 6: Suggested commit:** `feat(db): write an audit event for every credential reveal`

---

### Task 4: Index foreign-key columns

**Files:**

- Modify: `packages/db/prisma/schema.prisma`, adding to the models below
- Create: `packages/db/prisma/migrations/20261123100000_fk_lookup_indexes/migration.sql`, generated, with the two-line `--` header prepended **before** it is ever applied
- Test: `packages/db/test/schema.test.ts`

**Interfaces:**

- Schema lines:
  - `ProjectConnection`: `@@index([orgId, integrationId])`
  - `Credential`: `@@index([orgId, integrationId])`
  - `Approval`: `@@index([orgId, proposalId])`
  - `ToolCall`: `@@index([userId])` and `@@index([mcpClientId])` (these columns point at global tables, so no `orgId`)
- Expected index names in the SQL: `project_connections_org_id_integration_id_idx`, `credentials_org_id_integration_id_idx`, `approvals_org_id_proposal_id_idx`, `tool_calls_user_id_idx`, `tool_calls_mcp_client_id_idx`.

- [ ] **Step 1: Write the failing test** in `schema.test.ts`:

```ts
it("indexes foreign-key columns that no other index leads with", () => {
  const expected: Array<[string, string]> = [
    ["ProjectConnection", "@@index([orgId, integrationId])"],
    ["Credential", "@@index([orgId, integrationId])"],
    ["Approval", "@@index([orgId, proposalId])"],
    ["ToolCall", "@@index([userId])"],
    ["ToolCall", "@@index([mcpClientId])"],
  ];
  for (const [model, line] of expected) {
    expect(
      byName(model).lines.some((l) => l.startsWith(line)),
      `${model} ${line}`,
    ).toBe(true);
  }
  const migrations = join(root, "prisma", "migrations");
  const sql = readdirSync(migrations, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readFileSync(join(migrations, d.name, "migration.sql"), "utf8"))
    .join("\n");
  for (const name of [
    "project_connections_org_id_integration_id_idx",
    "credentials_org_id_integration_id_idx",
    "approvals_org_id_proposal_id_idx",
    "tool_calls_user_id_idx",
    "tool_calls_mcp_client_id_idx",
  ]) {
    expect(sql, name).toContain(`CREATE INDEX "${name}"`);
  }
});
```

- [ ] **Step 2: Run** `pnpm --filter @hub/db test -- schema`. Expected: FAIL on the first missing `@@index`.

- [ ] **Step 3: Add the five `@@index` lines** to `schema.prisma`.

- [ ] **Step 4: Generate the migration offline**, the same way as `20261123000000`:

```bash
git show HEAD:packages/db/prisma/schema.prisma > <scratchpad>/old.prisma
mkdir -p packages/db/prisma/migrations/20261123100000_fk_lookup_indexes
pnpm --filter @hub/db exec prisma migrate diff \
  --from-schema <scratchpad>/old.prisma --to-schema prisma/schema.prisma --script \
  > packages/db/prisma/migrations/20261123100000_fk_lookup_indexes/migration.sql
```

Expected: exactly 5 `CREATE INDEX` statements, and no `DROP`. Then prepend the header: `-- Adds indexes so looking up or deleting by these link columns doesn't scan a whole org.` and `-- Indexes only: no data or constraint changes.` Run `pnpm --filter @hub/db exec prisma generate`.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm test`. Expected: PASS.

- [ ] **Step 6 (user, own terminal): Apply and run against Neon.** This also runs the integration tests from Tasks 1 and 3.

```bash
! DIRECT_URL='<dev direct url>' pnpm --filter @hub/db migrate:deploy
! DIRECT_URL='<test-branch direct url>' pnpm --filter @hub/db migrate:deploy
! TEST_DATABASE_URL='<test-branch direct url>' pnpm --filter @hub/db test
```

Expected: 1 migration applied on each branch, and the integration tests pass (8 of them). Paste the output with the URL removed.

- [ ] **Step 7: Suggested commit:** `perf(db): index foreign-key columns not covered by an existing index`

---

### Task 5: Housekeeping: audit-trigger claim and dependency pins

**Files:**

- Modify: `docs/threat-model.md`, the "Audit trail:" bullet
- Modify: `packages/db/prisma/schema.prisma:325`, the retention comment
- Modify: `apps/server/package.json` (`zod`), `packages/db/package.json` (`@types/node`), and `pnpm-lock.yaml` through `pnpm install` only
- **Not modified:** `20261122000100_audit_events_append_only/migration.sql` (already applied; see Global Constraints)

**Decision (recommended):** reword, and don't switch roles yet. Today the app connects as the Neon owner role, so it _can_ disable the trigger. Running as a separate non-owner role is deployment work, so it belongs with the deploy phase, not here.

- [ ] **Step 1: Correct the claim where it can still be edited.**
  - Threat-model "Audit trail:" bullet: add "The trigger blocks the app's own UPDATE/DELETE/TRUNCATE. The table's owner role can still disable it, and the app runs as the owner today. Running the app as a non-owner role without `TRIGGER` privilege is planned for the deploy phase. The comment in migration `20261122000100` overstates this and can't be edited, because the migration is already applied."
  - `schema.prisma:325`: add a line saying the trigger does not stop the owner role (see the threat model).

- [ ] **Step 2: Pin the versions.** Change `"zod": "^4.6.7"` to `"4.6.7"` and `"@types/node": "^22.20.5"` to `"22.20.5"`. These are the versions already in the lockfile. Then run `pnpm install`. Expected: the lockfile only changes its specifier lines, and no version changes.

- [ ] **Step 3: Run** `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`. Expected: all pass.

- [ ] **Step 4: Suggested commit:** `docs: correct the audit-trigger claim; pin zod and @types/node`

---

## Done when

- Every box in #18 is either checked with the test listed above, or (for the trigger-role item) closed with the threat-model note from Task 5.
- Threat-model row 8 names the wider redaction test.
- The user has run Task 4, Step 6 on Neon and it passed.

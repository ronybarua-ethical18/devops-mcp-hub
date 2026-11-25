// Tests for the integrations repository: which providers an org has connected, using a fake tenant client.
// Proves only active rows are asked for, in a stable order, and mapped to plain objects (no Prisma rows).

import { describe, expect, it, vi } from "vitest";
import { createIntegrationsRepo } from "../src/repositories/integrations.js";
import type { TenantClient } from "../src/tenant/client.js";
import { scopeArgs } from "../src/tenant/scope.js";

/** Fake tenant client: `integration.findMany` records its args and returns `rows`. */
function fakeDb(rows: Array<Record<string, unknown>>) {
  const findMany = vi.fn(async (_args: unknown) => rows);
  const db = { integration: { findMany } } as unknown as TenantClient;
  return { db, findMany };
}

describe("integrations repository", () => {
  it("asks only for active rows, oldest first, and maps them", async () => {
    const { db, findMany } = fakeDb([
      { id: "i1", provider: "github", externalAccountId: "424242", scopes: ["repo"] },
    ]);
    const result = await createIntegrationsRepo(db).listActive();
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, provider: true, externalAccountId: true },
    });
    // Mapped field by field: extra columns a row might carry never leak out.
    expect(result).toEqual([{ id: "i1", provider: "github", externalAccountId: "424242" }]);
  });

  it("filters by provider when given", async () => {
    const { db, findMany } = fakeDb([]);
    await createIntegrationsRepo(db).listActive("github");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active", provider: "github" } }),
    );
  });

  it("keeps a missing installation id as null", async () => {
    const { db } = fakeDb([{ id: "i2", provider: "github", externalAccountId: null }]);
    expect(await createIntegrationsRepo(db).listActive("github")).toEqual([
      { id: "i2", provider: "github", externalAccountId: null },
    ]);
  });

  it("sends a query the tenant scope accepts, which then pins it to the org", async () => {
    const { db, findMany } = fakeDb([]);
    await createIntegrationsRepo(db).listActive("github");
    // The real tenant client runs every query through scopeArgs: a relation filter or include
    // would throw here; an accepted query comes back with the org filter added.
    expect(
      scopeArgs("Integration", "findMany", findMany.mock.calls[0]?.[0], "org-a"),
    ).toMatchObject({ where: { status: "active", provider: "github", orgId: "org-a" } });
  });

  it("returns an empty list when the org has none", async () => {
    const { db } = fakeDb([]);
    expect(await createIntegrationsRepo(db).listActive()).toEqual([]);
  });
});

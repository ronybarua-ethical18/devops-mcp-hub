import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../src/generated/client.js";
import { createTenantClient, scopeOperation } from "../src/tenant/client.js";
import { TENANT_MODELS, TenantViolationError } from "../src/tenant/scope.js";

const OPERATIONS = ["findMany", "findFirst", "count", "updateMany", "deleteMany", "aggregate"];

describe("scopeOperation (the extension handler)", () => {
  it("reaches the underlying query with the scope's orgId, per org", async () => {
    const query = vi.fn(async (args: unknown) => args);
    await scopeOperation("org-a")({ model: "Project", operation: "findMany", args: {}, query });
    await scopeOperation("org-b")({ model: "Project", operation: "findMany", args: {}, query });
    expect(query.mock.calls.map((c) => c[0])).toEqual([
      { where: { orgId: "org-a" } },
      { where: { orgId: "org-b" } },
    ]);
  });

  it("never lets a forgotten where reach any tenant model", async () => {
    for (const model of TENANT_MODELS) {
      for (const operation of OPERATIONS) {
        const query = vi.fn(async (args: unknown) => args);
        await scopeOperation("org-a")({ model, operation, args: undefined, query });
        expect(query, `${model}.${operation}`).toHaveBeenCalledWith({ where: { orgId: "org-a" } });
      }
    }
  });

  it("rejects instead of calling the query on a violation", async () => {
    const query = vi.fn(async (args: unknown) => args);
    await expect(
      scopeOperation("org-a")({
        model: "Project",
        operation: "findMany",
        args: { where: { orgId: "org-b" } },
        query,
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects raw operations, which carry no model", async () => {
    const query = vi.fn(async (args: unknown) => args);
    await expect(
      scopeOperation("org-a")({ operation: "$queryRaw", args: [], query }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    expect(query).not.toHaveBeenCalled();
  });
});

// A real client pointed at a port nobody listens on: violations are rejected before any
// connection is attempted, so these tests need no database.
describe("createTenantClient (real $extends, no connection)", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: "postgresql://nobody@127.0.0.1:1/none" }),
  });
  const tenant = createTenantClient(prisma, "org-a");

  it("rejects raw SQL of every kind", async () => {
    await expect(tenant.$queryRaw`SELECT 1`).rejects.toBeInstanceOf(TenantViolationError);
    await expect(tenant.$queryRawUnsafe("SELECT 1")).rejects.toBeInstanceOf(TenantViolationError);
    await expect(tenant.$executeRaw`SELECT 1`).rejects.toBeInstanceOf(TenantViolationError);
    await expect(tenant.$executeRawUnsafe("SELECT 1")).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("rejects a foreign orgId and nested relations through a real model delegate", async () => {
    await expect(tenant.project.findMany({ where: { orgId: "org-b" } })).rejects.toBeInstanceOf(
      TenantViolationError,
    );
    await expect(
      tenant.project.findMany({ include: { toolPolicies: true } as never }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });
});

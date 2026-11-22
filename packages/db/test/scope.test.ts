import { describe, expect, it } from "vitest";
import { scopeArgs, TENANT_MODELS, TenantViolationError } from "../src/tenant/scope.js";

const ORG = "org-a";
const OTHER = "org-b";

describe("scopeArgs: reads, updates, deletes", () => {
  it("adds orgId when there is no where, without mutating the input", () => {
    const args = { take: 5 };
    expect(scopeArgs("Project", "findMany", args, ORG)).toEqual({ take: 5, where: { orgId: ORG } });
    expect(args).toEqual({ take: 5 });
    expect(scopeArgs("Project", "findMany", undefined, ORG)).toEqual({ where: { orgId: ORG } });
  });

  it("keeps the caller's filter and adds orgId", () => {
    expect(scopeArgs("Project", "findFirst", { where: { slug: "web" } }, ORG)).toEqual({
      where: { slug: "web", orgId: ORG },
    });
  });

  it("scopes unique lookups, updates and deletes", () => {
    for (const operation of ["findUnique", "findUniqueOrThrow", "update", "delete"]) {
      const args = scopeArgs("Project", operation, { where: { id: "p1" }, data: {} }, ORG);
      expect(args).toMatchObject({ where: { id: "p1", orgId: ORG } });
    }
    for (const operation of ["count", "aggregate", "groupBy", "updateMany", "deleteMany"]) {
      expect(scopeArgs("Project", operation, {}, ORG)).toMatchObject({ where: { orgId: ORG } });
    }
  });

  it("allows an explicit orgId equal to the scope", () => {
    expect(scopeArgs("Project", "findMany", { where: { orgId: ORG } }, ORG)).toEqual({
      where: { orgId: ORG },
    });
  });
});

describe("scopeArgs: writes", () => {
  it("sets data.orgId on create", () => {
    expect(scopeArgs("Project", "create", { data: { name: "x", slug: "x" } }, ORG)).toEqual({
      data: { name: "x", slug: "x", orgId: ORG },
    });
  });

  it("sets orgId on every createMany row", () => {
    const out = scopeArgs("Project", "createMany", { data: [{ name: "a" }, { name: "b" }] }, ORG);
    expect(out).toEqual({
      data: [
        { name: "a", orgId: ORG },
        { name: "b", orgId: ORG },
      ],
    });
    const single = scopeArgs("Project", "createManyAndReturn", { data: { name: "a" } }, ORG);
    expect(single).toEqual({ data: { name: "a", orgId: ORG } });
  });

  it("scopes upsert where and create, and forbids a foreign orgId in update", () => {
    const out = scopeArgs(
      "Project",
      "upsert",
      { where: { id: "p" }, create: { name: "n" }, update: { name: "m" } },
      ORG,
    );
    expect(out).toEqual({
      where: { id: "p", orgId: ORG },
      create: { name: "n", orgId: ORG },
      update: { name: "m" },
    });
    expect(() =>
      scopeArgs("Project", "upsert", { where: {}, create: {}, update: { orgId: OTHER } }, ORG),
    ).toThrow(TenantViolationError);
  });

  it("forbids moving a row to another org through update data", () => {
    expect(() =>
      scopeArgs("Project", "update", { where: { id: "p" }, data: { orgId: OTHER } }, ORG),
    ).toThrow(TenantViolationError);
  });
});

describe("scopeArgs: foreign orgId", () => {
  it("throws for another org in where, data, nested boolean logic and filter objects", () => {
    const bad: Array<[string, unknown]> = [
      ["findMany", { where: { orgId: OTHER } }],
      ["findMany", { where: { OR: [{ slug: "a" }, { orgId: OTHER }] } }],
      ["findMany", { where: { AND: [{ NOT: { orgId: OTHER } }] } }],
      ["findMany", { where: { orgId: { not: ORG } } }],
      ["findMany", { where: { orgId: { in: [ORG, OTHER] } } }],
      ["create", { data: { orgId: OTHER } }],
      ["createMany", { data: [{ name: "a" }, { orgId: OTHER }] }],
    ];
    for (const [operation, args] of bad) {
      expect(() => scopeArgs("Project", operation, args, ORG), operation).toThrow(
        TenantViolationError,
      );
    }
  });
});

describe("scopeArgs: relations and unknown operations", () => {
  it("rejects include, relational select, _count and nested writes", () => {
    const bad: unknown[] = [
      { include: { toolPolicies: true } },
      { select: { id: true, toolPolicies: true } },
      { select: { _count: true } },
      { where: { toolPolicies: { some: {} } } },
      { where: { OR: [{ organization: { is: {} } }] } },
      { orderBy: { organization: { name: "asc" } } },
      { orderBy: [{ slug: "asc" }, { organization: { name: "asc" } }] },
    ];
    for (const args of bad) {
      expect(() => scopeArgs("Project", "findMany", args, ORG)).toThrow(TenantViolationError);
    }
    expect(() =>
      scopeArgs("Project", "create", { data: { name: "x", toolPolicies: { create: {} } } }, ORG),
    ).toThrow(TenantViolationError);
    expect(() =>
      scopeArgs("ToolPolicy", "create", { data: { project: { connect: { id: "p" } } } }, ORG),
    ).toThrow(TenantViolationError);
  });

  it("allows scalar select and Json column values that look like operations", () => {
    expect(scopeArgs("Project", "findMany", { select: { id: true, slug: true } }, ORG)).toEqual({
      select: { id: true, slug: true },
      where: { orgId: ORG },
    });
    const data = { toolName: "t", constraints: { create: true, set: [1] } };
    expect(scopeArgs("ToolPolicy", "create", { data }, ORG)).toEqual({
      data: { ...data, orgId: ORG },
    });
  });

  it("throws for an unknown operation on a tenant model", () => {
    for (const operation of ["findRaw", "aggregateRaw", "somethingNew"]) {
      expect(() => scopeArgs("Project", operation, {}, ORG)).toThrow(TenantViolationError);
    }
  });

  it("passes plain non-tenant queries through unchanged", () => {
    const args = { where: { email: "a@b.c" }, select: { id: true } };
    for (const model of ["User", "Organization", "McpClient"]) {
      expect(scopeArgs(model, "findMany", args, ORG)).toBe(args);
    }
  });

  it("rejects relation traversal through non-tenant models into tenant tables", () => {
    const bad: Array<[string, string, unknown]> = [
      ["Organization", "findMany", { include: { credentialRows: true } }],
      ["Organization", "findMany", { select: { auditRows: true } }],
      ["Organization", "findMany", { where: { credentialRows: { some: {} } } }],
      ["Organization", "findMany", { orderBy: { projects: { _count: "asc" } } }],
      ["User", "findUnique", { where: { id: "u" }, include: { memberships: true } }],
      ["User", "create", { data: { email: "e", memberships: { create: { orgId: OTHER } } } }],
      ["McpClient", "update", { where: { id: "c" }, data: { toolCalls: { deleteMany: {} } } }],
      ["User", "createMany", { data: [{ email: "e", toolCalls: { create: {} } }] }],
      [
        "User",
        "upsert",
        { where: { id: "u" }, create: { email: "e" }, update: { toolCalls: { create: {} } } },
      ],
    ];
    for (const [model, operation, args] of bad) {
      expect(() => scopeArgs(model, operation, args, ORG), `${model}.${operation}`).toThrow(
        TenantViolationError,
      );
    }
  });

  it("lists exactly the twelve tenant models", () => {
    expect([...TENANT_MODELS].sort()).toEqual(
      [
        "Approval",
        "AuditEvent",
        "Credential",
        "Integration",
        "Membership",
        "Project",
        "ProjectConnection",
        "Proposal",
        "ToolCall",
        "ToolPolicy",
        "WorkflowRun",
        "WorkflowStep",
      ].sort(),
    );
  });
});

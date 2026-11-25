// Tests against a real Postgres database (Neon): org isolation, encrypted tokens, and the locked audit table.
// They only run when TEST_DATABASE_URL is set; otherwise they are skipped.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma, forOrg, parseMasterKey, TenantViolationError } from "../src/index.js";
import { createTenantClient } from "../src/tenant/client.js";

// Runs only against a disposable Neon test branch: TEST_DATABASE_URL=<direct url> pnpm test.
// audit_events rows cannot be deleted (append-only trigger), so seeded orgs are left behind.
const url = process.env["TEST_DATABASE_URL"];
const master = parseMasterKey(randomBytes(32).toString("base64"));

describe.skipIf(!url)("tenant isolation and credentials against Postgres", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomUUID().slice(0, 8);
  const ids = { orgA: "", orgB: "", projectA: "", integrationA: "" };

  beforeAll(async () => {
    const orgA = await prisma.organization.create({ data: { name: "A", slug: `a-${run}` } });
    const orgB = await prisma.organization.create({ data: { name: "B", slug: `b-${run}` } });
    const project = await prisma.project.create({
      data: { orgId: orgA.id, name: "web", slug: "web" },
    });
    const integration = await prisma.integration.create({
      data: { orgId: orgA.id, provider: "github", scopes: ["repo"] },
    });
    Object.assign(ids, {
      orgA: orgA.id,
      orgB: orgB.id,
      projectA: project.id,
      integrationA: integration.id,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const deps = { master };

  it("hides org A's project from org B on every operation", async () => {
    const b = createTenantClient(prisma, ids.orgB);
    expect(await b.project.findMany({ where: { id: ids.projectA } })).toEqual([]);
    expect(await b.project.findUnique({ where: { id: ids.projectA } })).toBeNull();
    await expect(
      b.project.update({ where: { id: ids.projectA }, data: { name: "x" } }),
    ).rejects.toThrow();
    await expect(b.project.delete({ where: { id: ids.projectA } })).rejects.toThrow();
    expect((await b.project.updateMany({ data: { name: "x" } })).count).toBe(0);
    expect((await b.project.deleteMany({})).count).toBe(0);
    await expect(b.project.findMany({ where: { orgId: ids.orgA } })).rejects.toBeInstanceOf(
      TenantViolationError,
    );
    const still = await prisma.project.findUnique({ where: { id: ids.projectA } });
    expect(still?.name).toBe("web");
  });

  it("round-trips a credential, stores no plaintext, and hides it from org B", async () => {
    const plaintext = `ghp_${randomUUID()}`;
    const a = forOrg(prisma, ids.orgA, deps);
    const { id } = await a.credentials.store({ integrationId: ids.integrationA, plaintext });
    const ctx = { actorId: "u1", traceId: run };
    expect(await a.credentials.reveal(id, ctx)).toBe(plaintext);
    expect(
      await prisma.auditEvent.count({
        where: { orgId: ids.orgA, action: "credential.reveal", target: id },
      }),
    ).toBe(1);

    const row = await prisma.credential.findUniqueOrThrow({ where: { id } });
    expect(Buffer.from(row.ciphertext).includes(Buffer.from(plaintext))).toBe(false);
    expect(row.keyVersion).toBe(1);

    expect(await forOrg(prisma, ids.orgB, deps).credentials.reveal(id, ctx)).toBeNull();
  });

  it("refuses to attach a credential to another org's integration", async () => {
    await expect(
      forOrg(prisma, ids.orgB, deps).credentials.store({
        integrationId: ids.integrationA,
        plaintext: "tok",
      }),
    ).rejects.toThrow("integration not found");
    expect(await prisma.credential.count({ where: { orgId: ids.orgB } })).toBe(0);
  });

  it("rejects a row in org B that points at org A's project, at the database", async () => {
    const b = createTenantClient(prisma, ids.orgB);
    await expect(
      b.toolPolicy.create({
        data: {
          orgId: ids.orgB,
          projectId: ids.projectA,
          toolName: "t",
          effect: "allow",
          riskTier: "read",
        },
      }),
      // P2003 is Prisma's foreign-key violation: the database refused it, not some other error.
    ).rejects.toMatchObject({ code: "P2003" });
    expect(await prisma.toolPolicy.count({ where: { orgId: ids.orgB } })).toBe(0);
  });

  it("ignores a cursor that points at another org's row", async () => {
    const b = createTenantClient(prisma, ids.orgB);
    await prisma.project.create({ data: { orgId: ids.orgB, name: "b", slug: `b-${run}` } });
    expect(await b.project.findMany({ cursor: { id: ids.projectA }, take: 5 })).toEqual([]);
  });

  it("forces organization queries onto the scope's own row", async () => {
    const b = createTenantClient(prisma, ids.orgB);
    expect((await b.organization.findMany()).map((o) => o.id)).toEqual([ids.orgB]);
    await expect(b.organization.delete({ where: { id: ids.orgA } })).rejects.toBeInstanceOf(
      TenantViolationError,
    );
  });

  it("rejects UPDATE, DELETE and TRUNCATE of audit_events at the database", async () => {
    await forOrg(prisma, ids.orgA, deps).audit.append({
      actorId: "u1",
      action: "test.append",
      target: "x",
      outcome: "ok",
      traceId: run,
    });
    await expect(prisma.$executeRaw`UPDATE audit_events SET action = 'x'`).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.$executeRaw`DELETE FROM audit_events`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe("TRUNCATE audit_events")).rejects.toThrow(/append-only/);
  });
});

describe.skipIf(!url)("integration and connection reads against Postgres", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomUUID().slice(0, 8);
  const ids = {
    orgA: "",
    orgB: "",
    orgC: "",
    activeA: "",
    revokedA: "",
    activeB: "",
    connA: "",
    connB: "",
  };
  const deps = { master };

  beforeAll(async () => {
    const orgA = await prisma.organization.create({ data: { name: "A", slug: `ra-${run}` } });
    const orgB = await prisma.organization.create({ data: { name: "B", slug: `rb-${run}` } });
    const github = { provider: "github" as const, scopes: ["contents:read"] };
    const activeA = await prisma.integration.create({
      data: { ...github, orgId: orgA.id, externalAccountId: "1001" },
    });
    const revokedA = await prisma.integration.create({
      data: { ...github, orgId: orgA.id, externalAccountId: "1002", status: "revoked" },
    });
    const activeB = await prisma.integration.create({
      data: { ...github, orgId: orgB.id, externalAccountId: "2001" },
    });
    const orgC = await prisma.organization.create({ data: { name: "C", slug: `rc-${run}` } });
    const projectA = await prisma.project.create({
      data: { orgId: orgA.id, name: "a", slug: "a" },
    });
    const projectB = await prisma.project.create({
      data: { orgId: orgB.id, name: "b", slug: "b" },
    });
    // Both orgs connect the same repo; org A also has a repo only behind its revoked integration.
    const connA = await prisma.projectConnection.create({
      data: {
        orgId: orgA.id,
        projectId: projectA.id,
        integrationId: activeA.id,
        externalRef: "acme/api",
      },
    });
    const connB = await prisma.projectConnection.create({
      data: {
        orgId: orgB.id,
        projectId: projectB.id,
        integrationId: activeB.id,
        externalRef: "acme/api",
      },
    });
    await prisma.projectConnection.create({
      data: {
        orgId: orgA.id,
        projectId: projectA.id,
        integrationId: revokedA.id,
        externalRef: "acme/old",
      },
    });
    Object.assign(ids, {
      orgA: orgA.id,
      orgB: orgB.id,
      orgC: orgC.id,
      activeA: activeA.id,
      revokedA: revokedA.id,
      activeB: activeB.id,
      connA: connA.id,
      connB: connB.id,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists only the org's own active integrations", async () => {
    expect(await forOrg(prisma, ids.orgA, deps).integrations.listActive("github")).toEqual([
      { id: ids.activeA, provider: "github", externalAccountId: "1001" },
    ]);
    const forB = await forOrg(prisma, ids.orgB, deps).integrations.listActive();
    expect(forB.map((i) => i.id)).toEqual([ids.activeB]);
  });

  it("finds the org's own connection, case-insensitively", async () => {
    const found = await forOrg(prisma, ids.orgA, deps).connections.findRepo("github", "ACME/api");
    expect(found).toMatchObject({
      connectionId: ids.connA,
      externalRef: "acme/api",
      integration: { id: ids.activeA, externalAccountId: "1001" },
    });
  });

  it("never resolves another org's connection", async () => {
    const forB = await forOrg(prisma, ids.orgB, deps).connections.findRepo("github", "acme/api");
    expect(forB).toMatchObject({ connectionId: ids.connB, integration: { id: ids.activeB } });
    expect(
      await forOrg(prisma, ids.orgC, deps).connections.findRepo("github", "acme/api"),
    ).toBeNull();
  });

  it("treats _ and % in the repo name as plain characters, not wildcards", async () => {
    const a = forOrg(prisma, ids.orgA, deps).connections;
    expect(await a.findRepo("github", "acme/a_i")).toBeNull();
    expect(await a.findRepo("github", "acme/%")).toBeNull();
    expect(await a.findRepo("github", "%")).toBeNull();
  });

  it("returns the oldest connection when the repo is in two projects", async () => {
    // Created after connA in its own statement, so its created_at is later.
    const project2 = await prisma.project.create({
      data: { orgId: ids.orgA, name: "a2", slug: "a2" },
    });
    await prisma.projectConnection.create({
      data: {
        orgId: ids.orgA,
        projectId: project2.id,
        integrationId: ids.activeA,
        externalRef: "acme/api",
      },
    });
    const found = await forOrg(prisma, ids.orgA, deps).connections.findRepo("github", "acme/api");
    expect(found?.connectionId).toBe(ids.connA);
  });

  it("ignores connections of a revoked integration", async () => {
    expect(
      await forOrg(prisma, ids.orgA, deps).connections.findRepo("github", "acme/old"),
    ).toBeNull();
  });
});

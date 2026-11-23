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
    expect(await a.credentials.reveal(id)).toBe(plaintext);

    const row = await prisma.credential.findUniqueOrThrow({ where: { id } });
    expect(Buffer.from(row.ciphertext).includes(Buffer.from(plaintext))).toBe(false);
    expect(row.keyVersion).toBe(1);

    expect(await forOrg(prisma, ids.orgB, deps).credentials.reveal(id)).toBeNull();
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
    ).rejects.toThrow();
    expect(await prisma.toolPolicy.count({ where: { orgId: ids.orgB } })).toBe(0);
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

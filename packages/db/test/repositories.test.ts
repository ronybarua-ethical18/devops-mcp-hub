// Tests for the credentials and audit repositories, using a fake in-memory database.
// Proves tokens are stored only encrypted, one org can't open another's token, and every reveal is audited.

import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAuditRepo } from "../src/repositories/audit.js";
import { createCredentialsRepo } from "../src/repositories/credentials.js";
import type { MasterKey } from "../src/crypto/envelope.js";
import type { TenantClient } from "../src/tenant/client.js";

const master: MasterKey = { version: 1, key: randomBytes(32) };
const ctx = { actorId: "u1", traceId: "t1" };

interface Row {
  id: string;
  orgId: string;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  wrappedDek: Uint8Array;
  keyVersion: number;
}

/** In-memory stand-in for the tenant client: only rows of `visibleOrg` are ever returned. */
function fakeTenantDb(visibleOrg: string, integrationIds: string[] = ["i1"]) {
  const rows: Row[] = [];
  const create = vi.fn(async ({ data }: { data: Row }) => {
    rows.push(data);
    return data;
  });
  const findFirst = vi.fn(async ({ where }: { where: { id: string } }) => {
    return rows.find((r) => r.id === where.id && r.orgId === visibleOrg) ?? null;
  });
  const auditCreate = vi.fn(async (args: unknown) => args);
  // Only integrations of the visible org are returned, like the real tenant client.
  const integrationFindFirst = vi.fn(async ({ where }: { where: { id: string } }) =>
    integrationIds.includes(where.id) ? { id: where.id } : null,
  );
  const db = {
    credential: { create, findFirst },
    integration: { findFirst: integrationFindFirst },
    auditEvent: { create: auditCreate },
  } as unknown as TenantClient;
  return { db, rows, create, auditCreate };
}

describe("credentials repository", () => {
  it("refuses an integration id the tenant client cannot see (another org's)", async () => {
    const { db, create } = fakeTenantDb("org-a", ["i1"]);
    const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
    await expect(
      repo.store({ integrationId: "org-b-integration", plaintext: "tok" }),
    ).rejects.toThrow("integration not found");
    expect(create).not.toHaveBeenCalled();
  });

  it("stores sealed bytes only: the plaintext never reaches the database layer", async () => {
    const plaintext = "ghp_super_secret_token_value";
    const { db, create } = fakeTenantDb("org-a");
    await createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a")).store({
      integrationId: "i1",
      plaintext,
    });
    const data = create.mock.calls[0]?.[0].data;
    expect(data).toBeDefined();
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(plaintext);
    for (const field of [data?.ciphertext, data?.iv, data?.wrappedDek]) {
      expect(Buffer.from(field ?? []).includes(Buffer.from(plaintext))).toBe(false);
    }
    expect(data).toMatchObject({ orgId: "org-a", integrationId: "i1", keyVersion: 1 });
  });

  it("reveals what store wrote", async () => {
    const { db } = fakeTenantDb("org-a");
    const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
    const { id } = await repo.store({ integrationId: "i1", plaintext: "tok-1" });
    await expect(repo.reveal(id, ctx)).resolves.toBe("tok-1");
  });

  it("returns null for an unknown id or a row the tenant client does not return", async () => {
    const a = fakeTenantDb("org-a");
    const { id } = await createCredentialsRepo(
      a.db,
      "org-a",
      master,
      createAuditRepo(a.db, "org-a"),
    ).store({
      integrationId: "i1",
      plaintext: "tok",
    });
    const other = fakeTenantDb("org-b");
    other.rows.push(...a.rows);
    await expect(
      createCredentialsRepo(other.db, "org-b", master, createAuditRepo(other.db, "org-b")).reveal(
        id,
        ctx,
      ),
    ).resolves.toBeNull();
    await expect(
      createCredentialsRepo(a.db, "org-a", master, createAuditRepo(a.db, "org-a")).reveal(
        "nope",
        ctx,
      ),
    ).resolves.toBeNull();
  });

  it("refuses to open a row copied under another org id", async () => {
    const a = fakeTenantDb("org-a");
    const { id } = await createCredentialsRepo(
      a.db,
      "org-a",
      master,
      createAuditRepo(a.db, "org-a"),
    ).store({
      integrationId: "i1",
      plaintext: "tok",
    });
    const forged = fakeTenantDb("org-b");
    forged.rows.push(...a.rows.map((r) => ({ ...r, orgId: "org-b" })));
    await expect(
      createCredentialsRepo(forged.db, "org-b", master, createAuditRepo(forged.db, "org-b")).reveal(
        id,
        ctx,
      ),
    ).rejects.toThrow("decryption failed");
  });

  it("audits a successful reveal with the credential id, never the value", async () => {
    const { db, auditCreate } = fakeTenantDb("org-a");
    const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
    const { id } = await repo.store({ integrationId: "i1", plaintext: "tok-secret" });
    await expect(repo.reveal(id, ctx)).resolves.toBe("tok-secret");
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
    const { db, auditCreate } = fakeTenantDb("org-a");
    const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
    await expect(repo.reveal("nope", ctx)).resolves.toBeNull();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "credential.reveal",
        target: "nope",
        outcome: "not_found",
      }),
    });
  });

  it("audits a failed decryption as error and still throws", async () => {
    const a = fakeTenantDb("org-a");
    const { id } = await createCredentialsRepo(
      a.db,
      "org-a",
      master,
      createAuditRepo(a.db, "org-a"),
    ).store({ integrationId: "i1", plaintext: "tok" });
    const forged = fakeTenantDb("org-b");
    forged.rows.push(...a.rows.map((r) => ({ ...r, orgId: "org-b" })));
    const repo = createCredentialsRepo(
      forged.db,
      "org-b",
      master,
      createAuditRepo(forged.db, "org-b"),
    );
    await expect(repo.reveal(id, ctx)).rejects.toThrow("decryption failed");
    expect(forged.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "credential.reveal", target: id, outcome: "error" }),
    });
  });

  it("keeps the decryption error when the error audit write also fails", async () => {
    const a = fakeTenantDb("org-a");
    const { id } = await createCredentialsRepo(
      a.db,
      "org-a",
      master,
      createAuditRepo(a.db, "org-a"),
    ).store({ integrationId: "i1", plaintext: "tok" });
    const forged = fakeTenantDb("org-b");
    forged.rows.push(...a.rows.map((r) => ({ ...r, orgId: "org-b" })));
    forged.auditCreate.mockRejectedValueOnce(new Error("db down"));
    const repo = createCredentialsRepo(
      forged.db,
      "org-b",
      master,
      createAuditRepo(forged.db, "org-b"),
    );
    await expect(repo.reveal(id, ctx)).rejects.toThrow("decryption failed");
  });

  it("returns no token when the audit write fails", async () => {
    const { db, auditCreate } = fakeTenantDb("org-a");
    const repo = createCredentialsRepo(db, "org-a", master, createAuditRepo(db, "org-a"));
    const { id } = await repo.store({ integrationId: "i1", plaintext: "tok" });
    auditCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(repo.reveal(id, ctx)).rejects.toThrow("db down");
  });
});

describe("audit repository", () => {
  it("appends with the scope's orgId and exposes no update or delete", async () => {
    const { db, auditCreate } = fakeTenantDb("org-a");
    const repo = createAuditRepo(db, "org-a");
    await repo.append({
      actorId: "u1",
      action: "tool.call",
      target: "github_list_prs",
      outcome: "ok",
      traceId: "t1",
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        orgId: "org-a",
        actorId: "u1",
        action: "tool.call",
        target: "github_list_prs",
        outcome: "ok",
        traceId: "t1",
      },
    });
    expect(Object.keys(repo)).toEqual(["append"]);
  });
});

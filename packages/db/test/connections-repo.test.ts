// Tests for the connections repository: "is this repo connected for this org, and through what?"
// Uses a fake tenant client; proves case-insensitive matching, revoked integrations ignored, stable picks.

import { describe, expect, it, vi } from "vitest";
import { createConnectionsRepo } from "../src/repositories/connections.js";
import type { ActiveIntegration, IntegrationsRepo } from "../src/repositories/integrations.js";
import type { TenantClient } from "../src/tenant/client.js";
import { scopeArgs } from "../src/tenant/scope.js";

const github: ActiveIntegration = { id: "i1", provider: "github", externalAccountId: "424242" };

/** Fake repos: `listActive` returns `active`; `projectConnection.findMany` returns `rows`. */
function setup(active: ActiveIntegration[], rows: Array<Record<string, unknown>>) {
  const listActive = vi.fn(async (_provider?: string) => active);
  const integrations = { listActive } as unknown as IntegrationsRepo;
  const findMany = vi.fn(async (_args: unknown) => rows);
  const db = { projectConnection: { findMany } } as unknown as TenantClient;
  return { repo: createConnectionsRepo(db, integrations), listActive, findMany };
}

const row = { id: "c1", projectId: "p1", integrationId: "i1", externalRef: "acme/api" };

describe("connections repository", () => {
  it("matches the repo case-insensitively through an active integration", async () => {
    const { repo, listActive, findMany } = setup([github], [row]);
    const found = await repo.findRepo("github", "Acme/API");
    expect(listActive).toHaveBeenCalledWith("github");
    expect(findMany).toHaveBeenCalledWith({
      where: {
        integrationId: { in: ["i1"] },
        externalRef: { equals: "Acme/API", mode: "insensitive" },
      },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { id: true, projectId: true, integrationId: true, externalRef: true },
    });
    expect(found).toEqual({
      connectionId: "c1",
      projectId: "p1",
      externalRef: "acme/api",
      integration: github,
    });
  });

  it("escapes LIKE wildcards, so _ and % in the input match only themselves", async () => {
    // Prisma turns insensitive `equals` into an unescaped ILIKE on Postgres: "acme/my_api" would
    // otherwise match a stored "acme/my-api", and "acme/%" any acme repo.
    const { repo, findMany } = setup([github], []);
    await repo.findRepo("github", "acme/my_api%\\x");
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { externalRef: { equals: "acme/my\\_api\\%\\\\x", mode: "insensitive" } },
    });
  });

  it("returns null when the stored ref is not the same repo, ignoring case only", async () => {
    // Second guard: even if the database matched loosely, a different repo never resolves.
    const { repo } = setup([github], [{ ...row, externalRef: "acme/my-api" }]);
    expect(await repo.findRepo("github", "acme/my_api")).toBeNull();
  });

  it("returns null without querying connections when no active integration exists", async () => {
    // A revoked integration is never returned by listActive, so its connections never resolve.
    const { repo, findMany } = setup([], [row]);
    expect(await repo.findRepo("github", "acme/api")).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns null when the repo is not connected", async () => {
    const { repo } = setup([github], []);
    expect(await repo.findRepo("github", "acme/other")).toBeNull();
  });

  it("returns the oldest connection when the repo is in two projects", async () => {
    const second = { ...row, id: "c2", projectId: "p2" };
    // The database applies orderBy + take: 1; the repo must use the first row it gets.
    const { repo } = setup([github], [row, second]);
    expect((await repo.findRepo("github", "acme/api"))?.connectionId).toBe("c1");
  });

  it("sends a query the tenant scope accepts: no relation filter, org filter added", async () => {
    const { repo, findMany } = setup([github], [row]);
    await repo.findRepo("github", "acme/api");
    const args = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(Object.keys(args.where)).not.toContain("integration");
    expect(Object.keys(args.where)).not.toContain("project");
    expect(scopeArgs("ProjectConnection", "findMany", args, "org-a")).toMatchObject({
      where: { orgId: "org-a" },
    });
  });
});

describe("connections.list (paged allowlist)", () => {
  const rows = ["c1", "c2", "c3"].map((id, i) => ({
    id,
    projectId: "p1",
    integrationId: "i1",
    externalRef: `acme/r${i}`,
  }));

  it("lists through active integrations, sorted, one extra row to detect more", async () => {
    const { repo, findMany } = setup([github], rows);
    const page = await repo.list("github", { limit: 2 });
    expect(findMany).toHaveBeenCalledWith({
      where: { integrationId: { in: ["i1"] } },
      orderBy: [{ externalRef: "asc" }, { id: "asc" }],
      take: 3,
      select: { id: true, projectId: true, integrationId: true, externalRef: true },
    });
    expect(page.items.map((c) => c.connectionId)).toEqual(["c1", "c2"]);
    expect(page.items[0]).toEqual({
      connectionId: "c1",
      projectId: "p1",
      externalRef: "acme/r0",
      integration: github,
    });
    expect(page.nextAfter).toBe("c2");
  });

  it("has no next page when fewer rows than limit + 1 come back", async () => {
    const { repo } = setup([github], rows.slice(0, 2));
    expect((await repo.list("github", { limit: 2 })).nextAfter).toBeNull();
  });

  it("continues after the given id", async () => {
    const { repo, findMany } = setup([github], []);
    await repo.list("github", { limit: 2, after: "c2" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "c2" }, skip: 1 }),
    );
  });

  it("returns an empty page without querying when no active integration exists", async () => {
    const { repo, findMany } = setup([], rows);
    expect(await repo.list("github", { limit: 2 })).toEqual({ items: [], nextAfter: null });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("the query passes the tenant scope", async () => {
    const { repo, findMany } = setup([github], []);
    await repo.list("github", { limit: 2, after: "c2" });
    const scoped = scopeArgs("ProjectConnection", "findMany", findMany.mock.calls[0]?.[0], "org-a");
    expect(scoped).toMatchObject({ where: { orgId: "org-a" } });
  });
});

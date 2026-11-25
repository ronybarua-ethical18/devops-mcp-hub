// Answers "is this repo connected for this org, and through which integration?" and lists the org's repos.
// Read-only and org-bound: another org's connection, or one behind a revoked integration, never resolves.

import type { TenantClient } from "../tenant/client.js";
import type { ActiveIntegration, IntegrationsRepo, ProviderName } from "./integrations.js";

export interface RepoConnection {
  connectionId: string;
  projectId: string;
  /** As stored, e.g. "acme/api". */
  externalRef: string;
  integration: ActiveIntegration;
}

export interface ConnectionsRepo {
  /**
   * The org's connection for `externalRef` (case-insensitive) through an active integration of
   * `provider`. Null when not connected, connected only through a revoked or errored
   * integration, or connected only in another org. Oldest connection wins.
   */
  findRepo(provider: ProviderName, externalRef: string): Promise<RepoConnection | null>;
  /**
   * The org's connections for `provider` through active integrations, by externalRef then id.
   * `after` is the last connection id of the previous page; a row that no longer exists yields
   * an empty page.
   */
  list(
    provider: ProviderName,
    page: { limit: number; after?: string },
  ): Promise<{ items: RepoConnection[]; nextAfter: string | null }>;
}

const CONNECTION_FIELDS = {
  id: true,
  projectId: true,
  integrationId: true,
  externalRef: true,
} as const;

interface ConnectionRow {
  id: string;
  projectId: string;
  integrationId: string;
  externalRef: string;
}

/** Plain result object; null when the row's integration is not one of the active ones. */
function toRepoConnection(row: ConnectionRow, active: ActiveIntegration[]): RepoConnection | null {
  const integration = active.find((i) => i.id === row.integrationId);
  if (integration === undefined) return null;
  return {
    connectionId: row.id,
    projectId: row.projectId,
    externalRef: row.externalRef,
    integration,
  };
}

/** Make every character of `value` match only itself in a Postgres LIKE/ILIKE pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function createConnectionsRepo(
  db: TenantClient,
  integrations: IntegrationsRepo,
): ConnectionsRepo {
  return {
    async findRepo(provider, externalRef) {
      // Two plain queries instead of a relation filter: the tenant client rejects relation
      // traversal, because it can only pin the org on the top-level table.
      const active = await integrations.listActive(provider);
      if (active.length === 0) return null;
      const [row] = await db.projectConnection.findMany({
        where: {
          integrationId: { in: active.map((i) => i.id) },
          // GitHub treats owner/repo names case-insensitively. On Postgres Prisma runs this as
          // ILIKE without escaping, so _ and % would be wildcards: escape them (and \).
          externalRef: { equals: escapeLike(externalRef), mode: "insensitive" },
        },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: CONNECTION_FIELDS,
      });
      if (row === undefined) return null;
      // Second guard on the allowlist: only the same name, differing in case at most, resolves.
      if (row.externalRef.toLowerCase() !== externalRef.toLowerCase()) return null;
      return toRepoConnection(row, active);
    },

    async list(provider, { limit, after }) {
      const active = await integrations.listActive(provider);
      if (active.length === 0) return { items: [], nextAfter: null };
      // One extra row tells whether another page exists. Prisma's cursor is pinned to the org by
      // the tenant client; a cursor row that is gone returns no rows.
      const rows = await db.projectConnection.findMany({
        where: { integrationId: { in: active.map((i) => i.id) } },
        orderBy: [{ externalRef: "asc" }, { id: "asc" }],
        take: limit + 1,
        ...(after === undefined ? {} : { cursor: { id: after }, skip: 1 }),
        select: CONNECTION_FIELDS,
      });
      const items = rows
        .slice(0, limit)
        .map((row) => toRepoConnection(row, active))
        .filter((c): c is RepoConnection => c !== null);
      const last = rows[limit - 1];
      return { items, nextAfter: rows.length > limit && last !== undefined ? last.id : null };
    },
  };
}

// Answers "is this repo (or other provider resource) connected for this org, and through which integration?"
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
        select: { id: true, projectId: true, integrationId: true, externalRef: true },
      });
      if (row === undefined) return null;
      // Second guard on the allowlist: only the same name, differing in case at most, resolves.
      if (row.externalRef.toLowerCase() !== externalRef.toLowerCase()) return null;
      const integration = active.find((i) => i.id === row.integrationId);
      if (integration === undefined) return null;
      return {
        connectionId: row.id,
        projectId: row.projectId,
        externalRef: row.externalRef,
        integration,
      };
    },
  };
}

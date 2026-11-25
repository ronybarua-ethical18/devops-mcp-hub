// Reads which providers (GitHub, Vercel, ...) an org has connected, for one org only.
// Read-only: only active integrations count; revoked or broken ones are never returned.

import type { TenantClient } from "../tenant/client.js";

export type ProviderName = "github" | "vercel" | "sentry" | "postgres";

export interface ActiveIntegration {
  id: string;
  provider: ProviderName;
  /** GitHub: the App installation id. Null until the install flow records it. */
  externalAccountId: string | null;
}

export interface IntegrationsRepo {
  /** Active integrations of this org, oldest first; only `provider` when given. Never another org's. */
  listActive(provider?: ProviderName): Promise<ActiveIntegration[]>;
}

export function createIntegrationsRepo(db: TenantClient): IntegrationsRepo {
  return {
    async listActive(provider) {
      const rows = await db.integration.findMany({
        where: { status: "active", ...(provider === undefined ? {} : { provider }) },
        orderBy: { createdAt: "asc" },
        select: { id: true, provider: true, externalAccountId: true },
      });
      return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        externalAccountId: row.externalAccountId,
      }));
    },
  };
}

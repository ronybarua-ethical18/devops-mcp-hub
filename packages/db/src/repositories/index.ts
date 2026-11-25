// forOrg(): the single entry point app code uses to reach one org's data.
// It hands out repositories that are already locked to that org.

import type { MasterKey } from "../crypto/envelope.js";
import type { PrismaClient } from "../generated/client.js";
import { createTenantClient } from "../tenant/client.js";
import { createAuditRepo, type AuditRepo } from "./audit.js";
import { createConnectionsRepo, type ConnectionsRepo } from "./connections.js";
import { createCredentialsRepo, type CredentialsRepo } from "./credentials.js";
import { createIntegrationsRepo, type IntegrationsRepo } from "./integrations.js";

export interface RepoDeps {
  master: MasterKey;
}

export interface OrgRepositories {
  credentials: CredentialsRepo;
  audit: AuditRepo;
  integrations: IntegrationsRepo;
  connections: ConnectionsRepo;
}

/** The only way application code reaches tenant data: every query is forced into `orgId`. */
export function forOrg(prisma: PrismaClient, orgId: string, deps: RepoDeps): OrgRepositories {
  const db = createTenantClient(prisma, orgId);
  const audit = createAuditRepo(db, orgId);
  const integrations = createIntegrationsRepo(db);
  return {
    credentials: createCredentialsRepo(db, orgId, deps.master, audit),
    audit,
    integrations,
    connections: createConnectionsRepo(db, integrations),
  };
}

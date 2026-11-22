import type { MasterKey } from "../crypto/envelope.js";
import type { PrismaClient } from "../generated/client.js";
import { createTenantClient } from "../tenant/client.js";
import { createAuditRepo, type AuditRepo } from "./audit.js";
import { createCredentialsRepo, type CredentialsRepo } from "./credentials.js";

export interface RepoDeps {
  master: MasterKey;
}

export interface OrgRepositories {
  credentials: CredentialsRepo;
  audit: AuditRepo;
}

/** The only way application code reaches tenant data: every query is forced into `orgId`. */
export function forOrg(prisma: PrismaClient, orgId: string, deps: RepoDeps): OrgRepositories {
  const db = createTenantClient(prisma, orgId);
  return {
    credentials: createCredentialsRepo(db, orgId, deps.master),
    audit: createAuditRepo(db, orgId),
  };
}

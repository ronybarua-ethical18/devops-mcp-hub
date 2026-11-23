// Writes entries to the audit log, the permanent record of who did what.
// It can only add entries; there is no way to change or delete them, on purpose.

import type { Prisma } from "../generated/client.js";
import type { TenantClient } from "../tenant/client.js";

export interface AuditEventInput {
  actorId: string;
  action: string;
  target: string;
  outcome: string;
  traceId: string;
  metadata?: Prisma.InputJsonValue;
}

/** Append-only by construction: the only operation is `append`. A DB trigger backs this up. */
export interface AuditRepo {
  append(event: AuditEventInput): Promise<void>;
}

export function createAuditRepo(db: TenantClient, orgId: string): AuditRepo {
  return {
    async append({ metadata, ...event }) {
      await db.auditEvent.create({
        data: { orgId, ...event, ...(metadata === undefined ? {} : { metadata }) },
      });
    },
  };
}

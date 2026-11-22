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

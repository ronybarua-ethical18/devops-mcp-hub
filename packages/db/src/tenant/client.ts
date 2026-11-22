import { Prisma, type PrismaClient } from "../generated/client.js";
import { scopeArgs, TenantViolationError } from "./scope.js";

interface OperationParams {
  /** Undefined for operations that are not tied to a model (raw SQL). */
  model?: string | undefined;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/** The extension handler: injects the tenant filter, or rejects. Exported for unit tests. */
export function scopeOperation(orgId: string) {
  return async ({ model, operation, args, query }: OperationParams): Promise<unknown> => {
    if (model === undefined) {
      throw new TenantViolationError(`"${operation}" is not allowed on the tenant client`);
    }
    return query(scopeArgs(model, operation, args, orgId));
  };
}

/**
 * A Prisma client whose every tenant-table query is forced into one org. Raw SQL is rejected
 * because it would bypass the filter.
 */
export function createTenantClient(prisma: PrismaClient, orgId: string) {
  const handler = scopeOperation(orgId);
  return prisma.$extends(
    Prisma.defineExtension({
      name: "tenant-scope",
      query: {
        $allOperations: (params) => handler(params as OperationParams),
      },
    }),
  );
}

export type TenantClient = ReturnType<typeof createTenantClient>;

// Prisma schema, migrations and tenant-scoped repositories.
export { createPrisma } from "./client.js";
export { parseMasterKey, type MasterKey } from "./crypto/envelope.js";
export { forOrg, type OrgRepositories, type RepoDeps } from "./repositories/index.js";
export type { AuditEventInput, AuditRepo } from "./repositories/audit.js";
export type { CredentialsRepo } from "./repositories/credentials.js";
export { TenantViolationError } from "./tenant/scope.js";
export type { PrismaClient } from "./generated/client.js";

// Creates the raw database client that talks to Postgres.
// Only the server's startup code should use it directly; everything else goes through forOrg().

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

/** Create the raw client. Keep it inside the server's composition root; use `forOrg` for queries. */
export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

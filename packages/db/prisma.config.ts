// Settings for the Prisma command-line tool: where the schema and migrations live, and which database to use.
// Migrations read the database address from the DIRECT_URL environment variable.

import { defineConfig } from "prisma/config";

// Migrations need the direct (non-pooled) Neon connection string. The Prisma 7 CLI does not
// load .env files: export DIRECT_URL in your shell before running migrate commands.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DIRECT_URL"] ?? "" },
});

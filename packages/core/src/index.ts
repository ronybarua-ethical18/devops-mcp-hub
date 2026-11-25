// Application core: services, policy, proposals, audit, shared types.
// Business rules live here; providers are reached only through @hub/integrations, data through @hub/db.

export const HUB_NAME = "devops-mcp-hub";

export * from "./github/index.js";

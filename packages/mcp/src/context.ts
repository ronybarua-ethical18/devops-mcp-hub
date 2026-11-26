// What every hub tool receives as ctx: the verified caller and the services scoped to that caller's org.
// The server builds it per request (task 7); tools never take the org or user from their arguments.

import type { GithubReadService } from "@hub/core";

export interface ToolContext {
  auth: { orgId: string; userId: string };
  /** Already scoped to auth.orgId. */
  github: GithubReadService;
}

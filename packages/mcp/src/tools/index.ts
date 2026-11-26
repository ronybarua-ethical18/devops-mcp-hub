// The hub's tool set: every tool the server registers for a caller.
// The registry sorts them by name, so the order here does not matter.

import type { ToolContext } from "../context.js";
import type { HubTool } from "../tool.js";
import { getCommitTool } from "./get-commit.js";
import { listPullRequestsTool } from "./list-pull-requests.js";
import { listReposTool } from "./list-repos.js";
import { whoamiTool } from "./whoami.js";

export const hubTools: readonly HubTool<ToolContext>[] = [
  whoamiTool,
  listReposTool,
  listPullRequestsTool,
  getCommitTool,
];

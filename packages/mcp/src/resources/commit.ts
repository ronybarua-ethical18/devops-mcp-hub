// The github://{owner}/{repo}/commits/{sha} resource: the same commit summary github_get_commit returns, as JSON.
// A thin wrapper over the core service; the registry re-parses the output and maps every error to fixed text.

import type { ToolContext } from "../context.js";
import type { HubResourceTemplate } from "../resource.js";
import { commitOutputSchema } from "../tools/get-commit.js";

export const commitResource: HubResourceTemplate<ToolContext> = {
  name: "github_commit",
  title: "GitHub commit",
  description:
    "One commit in a connected GitHub repo, as JSON: the same summary github_get_commit returns, with no diffs. Text written by other people is under untrusted_content.",
  uriTemplate: "github://{owner}/{repo}/commits/{sha}",
  outputSchema: commitOutputSchema,
  // Missing variables become "", which the core rejects with its fix-it hint like any bad input.
  read: async ({ owner = "", repo = "", sha = "" }, ctx) =>
    ctx.github.getCommit({ repo: `${owner}/${repo}`, sha }),
};

export const hubResources: readonly HubResourceTemplate<ToolContext>[] = [commitResource];

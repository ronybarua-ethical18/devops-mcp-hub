// github_list_repos: the org's connected GitHub repos, one page at a time.
// A thin wrapper over the core service; the summary counts repos and never quotes their names.

import type { RepoList } from "@hub/core";
import * as z from "zod/v4";
import type { ToolContext } from "../context.js";
import { defineTool } from "../tool.js";
import type { Assert, Exact } from "./exact.js";

const input = z.strictObject({
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(200).optional(),
});
const output = z.object({
  items: z.array(z.object({ repo: z.string(), projectId: z.string() })),
  nextCursor: z.string().nullable(),
});
export type _ListReposOutputMatches = Assert<Exact<z.infer<typeof output>, RepoList>>;

export const MORE_PAGES = " More pages: pass nextCursor as cursor.";

export const listReposTool = defineTool<ToolContext, typeof input, typeof output>({
  name: "github_list_repos",
  title: "List connected GitHub repos",
  description:
    "Lists the GitHub repos connected to the hub for this org, as owner/repo names. Call it first to find the repo to pass to github_list_pull_requests or github_get_commit. It shows only connected repos, not every repo on GitHub. Up to 50 per page; pass nextCursor back as cursor for the next page.",
  inputSchema: input,
  outputSchema: output,
  annotations: { readOnlyHint: true, openWorldHint: false },
  // Stored repo refs are not re-checked by the core, so the summary only counts them.
  summarize: (out) =>
    `Listed ${out.items.length} connected repos.${out.nextCursor === null ? "" : MORE_PAGES}`,
  run: async ({ limit, cursor }, ctx) =>
    ctx.github.listRepos({
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    }),
});

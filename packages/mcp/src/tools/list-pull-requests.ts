// github_list_pull_requests: one page of pull requests in a connected repo.
// A thin wrapper over the core service; titles and branch names stay under untrusted_content.

import type { PullRequestList } from "@hub/core";
import * as z from "zod/v4";
import type { ToolContext } from "../context.js";
import { defineTool } from "../tool.js";
import type { Assert, Exact } from "./exact.js";
import { MORE_PAGES } from "./list-repos.js";

// repo stays a plain string so the core answers a bad name with its fix-it hint, not zod's text.
const input = z.strictObject({
  repo: z.string().min(1).max(200),
  state: z.enum(["open", "closed", "all"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(200).optional(),
});
const output = z.object({
  repo: z.string(),
  items: z.array(
    z.object({
      number: z.number(),
      state: z.string(),
      draft: z.boolean(),
      author: z.string().nullable(),
      url: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
  untrusted_content: z.object({
    pullRequests: z.array(
      z.object({
        number: z.number(),
        title: z.string(),
        headRef: z.string(),
        baseRef: z.string(),
      }),
    ),
  }),
});
export type _ListPullRequestsOutputMatches = Assert<Exact<z.infer<typeof output>, PullRequestList>>;

export const listPullRequestsTool = defineTool<ToolContext, typeof input, typeof output>({
  name: "github_list_pull_requests",
  title: "List pull requests",
  description:
    "Lists pull requests in one connected GitHub repo: number, state, draft, author, dates and link. Titles and branch names are under untrusted_content. Get the repo name from github_list_repos. To see what one commit changed, use github_get_commit. Defaults to open pull requests; up to 50 per page; pass nextCursor back as cursor for the next page.",
  inputSchema: input,
  outputSchema: output,
  annotations: { readOnlyHint: true, openWorldHint: true },
  summarize: (out) =>
    `Listed ${out.items.length} pull requests in ${out.repo}.${out.nextCursor === null ? "" : MORE_PAGES}`,
  run: async ({ repo, state, limit, cursor }, ctx) =>
    ctx.github.listPullRequests({
      repo,
      ...(state === undefined ? {} : { state }),
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    }),
});

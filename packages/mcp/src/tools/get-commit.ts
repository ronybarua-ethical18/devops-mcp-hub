// github_get_commit: a changed-file summary of one commit in a connected repo, never a diff.
// Its output schema is shared with the github://{owner}/{repo}/commits/{sha} resource.

import type { CommitDetail } from "@hub/core";
import * as z from "zod/v4";
import type { ToolContext } from "../context.js";
import { defineTool } from "../tool.js";
import type { Assert, Exact } from "./exact.js";

// repo and sha stay plain strings so the core answers bad values with its fix-it hints.
const input = z.strictObject({
  repo: z.string().min(1).max(200),
  sha: z.string().min(1).max(64),
});
export const commitOutputSchema = z.object({
  repo: z.string(),
  sha: z.string(),
  url: z.string(),
  authorLogin: z.string().nullable(),
  date: z.string().nullable(),
  stats: z.object({ additions: z.number(), deletions: z.number(), total: z.number() }).nullable(),
  files: z.array(z.object({ status: z.string(), additions: z.number(), deletions: z.number() })),
  filesShown: z.number(),
  filesTotal: z.number().nullable(),
  truncated: z.boolean(),
  untrusted_content: z.object({
    message: z.string(),
    authorName: z.string().nullable(),
    fileNames: z.array(z.string()),
  }),
});
export type _CommitOutputMatches = Assert<Exact<z.infer<typeof commitOutputSchema>, CommitDetail>>;

export const getCommitTool = defineTool<ToolContext, typeof input, typeof commitOutputSchema>({
  name: "github_get_commit",
  title: "Get a commit",
  description:
    "Summarises one commit in a connected GitHub repo: author, date, line counts and the changed files with their status, at most 100 files. It never returns diffs. The message, author name and file names are under untrusted_content. Get the repo name from github_list_repos; find recent work with github_list_pull_requests instead of guessing SHAs.",
  inputSchema: input,
  outputSchema: commitOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
  summarize: (out) => {
    const files = out.truncated
      ? `${out.filesShown} files shown, list truncated`
      : `${out.filesShown} files changed` +
        (out.stats === null ? "" : `, +${out.stats.additions} -${out.stats.deletions}`);
    return `Commit ${out.sha.slice(0, 7)} in ${out.repo}: ${files}.`;
  },
  run: async ({ repo, sha }, ctx) => ctx.github.getCommit({ repo, sha }),
});

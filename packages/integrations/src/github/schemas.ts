// What we accept from GitHub's REST API, as zod schemas that keep only the fields we use.
// Unknown fields (like a commit's full diff `patch`) are dropped at parse time.

import { z } from "zod/v4";

export const installationTokenSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().min(1),
});

const repoSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  default_branch: z.string(),
  html_url: z.string(),
  owner: z.object({ login: z.string() }),
});

export const repoListSchema = z.object({ repositories: z.array(repoSchema) });

const pullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.string(),
  draft: z.boolean().optional(),
  user: z.object({ login: z.string() }).nullable(),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  head: z.object({ ref: z.string() }),
  base: z.object({ ref: z.string() }),
});

export const pullListSchema = z.array(pullSchema);

export const commitSchema = z.object({
  sha: z.string(),
  html_url: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({ name: z.string(), date: z.string() }).nullable(),
  }),
  author: z.object({ login: z.string() }).nullable(),
  stats: z
    .object({ additions: z.number().int(), deletions: z.number().int(), total: z.number().int() })
    .optional(),
  files: z
    .array(
      z.object({
        filename: z.string(),
        status: z.string(),
        additions: z.number().int(),
        deletions: z.number().int(),
      }),
    )
    .optional(),
});

// hub_whoami: tells the client which hub org and user this connection acts as.
// Everything comes from ctx (the verified caller); the tool takes no arguments.

import * as z from "zod/v4";
import type { ToolContext } from "../context.js";
import { defineTool } from "../tool.js";

const input = z.strictObject({});
const output = z.object({ orgId: z.string(), userId: z.string() });

export const whoamiTool = defineTool<ToolContext, typeof input, typeof output>({
  name: "hub_whoami",
  title: "Who am I",
  description:
    "Shows which hub org and user this connection acts as. Use it to check that the connection works or to confirm the org before reading data. It does not list repos: use github_list_repos for that.",
  inputSchema: input,
  outputSchema: output,
  annotations: { readOnlyHint: true, openWorldHint: false },
  summarize: (out) => `Connected as user ${out.userId} in org ${out.orgId}.`,
  run: async (_input, ctx) => ({ orgId: ctx.auth.orgId, userId: ctx.auth.userId }),
});

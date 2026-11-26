// Test helper: a fake GitHub read service and a way to serve tools against it over the real SDK client.
// Any service method a test did not stub rejects, so a tool that calls the wrong method fails loudly.

import type { GithubReadService } from "@hub/core";
import { afterEach, vi } from "vitest";
import type { ToolContext } from "../../src/context.js";
import type { LogError } from "../../src/errors.js";
import { createHubServer } from "../../src/registry.js";
import type { HubResourceTemplate } from "../../src/resource.js";
import type { HubTool } from "../../src/tool.js";
import { connect, type Connected } from "./connect.js";

const notStubbed = () => vi.fn(async () => Promise.reject(new Error("not stubbed")));

export function fakeGithub(overrides: Partial<GithubReadService> = {}): GithubReadService {
  return {
    listRepos: notStubbed(),
    listPullRequests: notStubbed(),
    getCommit: notStubbed(),
    ...overrides,
  };
}

let open: Connected[] = [];
afterEach(async () => {
  await Promise.all(open.map((c) => c.client.close()));
  open = [];
});

export async function serveTools(
  tools: HubTool<ToolContext>[],
  github: GithubReadService,
  logError: LogError = vi.fn(),
  resources: HubResourceTemplate<ToolContext>[] = [],
): Promise<Connected> {
  const context: ToolContext = { auth: { orgId: "org_1", userId: "user_1" }, github };
  const connected = await connect(() => createHubServer({ tools, resources, context, logError }));
  open.push(connected);
  return connected;
}

/** Text of the first content block of a tool result. */
export const textOf = (result: unknown): string => {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.[0]?.text ?? "";
};

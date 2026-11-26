// Wire tests for hub_whoami: it reports the caller from the server's context and accepts no arguments.
// The org can never be picked by the client.

import { describe, expect, it } from "vitest";
import { whoamiTool } from "../../src/tools/whoami.js";
import { fakeGithub, serveTools, textOf } from "../helpers/fake-github.js";

describe("hub_whoami", () => {
  it("returns the caller from ctx, with read-only annotations", async () => {
    const { client } = await serveTools([whoamiTool], fakeGithub());
    const [tool] = (await client.listTools()).tools;
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    const result = await client.callTool({ name: "hub_whoami", arguments: {} });
    expect(result.structuredContent).toEqual({ orgId: "org_1", userId: "user_1" });
    expect(textOf(result).split("\n")[0]).toBe("Connected as user user_1 in org org_1.");
  });

  it("rejects any argument, including an org", async () => {
    const github = fakeGithub();
    const { client } = await serveTools([whoamiTool], github);
    const result = await client.callTool({ name: "hub_whoami", arguments: { orgId: "org_2" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("orgId");
    expect(result.structuredContent).toBeUndefined();
  });
});

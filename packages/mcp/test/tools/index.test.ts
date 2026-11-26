// Tests for the hub's tool set as a whole: the four tools, in name order, with honest annotations,
// and descriptions that point the model at the right neighbouring tool.

import { describe, expect, it } from "vitest";
import { hubTools } from "../../src/tools/index.js";
import { fakeGithub, serveTools } from "../helpers/fake-github.js";

describe("hubTools", () => {
  it("hubTools lists the four tools sorted by name with honest annotations", async () => {
    const { client } = await serveTools([...hubTools], fakeGithub());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "github_get_commit",
      "github_list_pull_requests",
      "github_list_repos",
      "hub_whoami",
    ]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
    const openWorld = tools.filter((t) => t.annotations?.openWorldHint === true).map((t) => t.name);
    expect(openWorld).toEqual(["github_get_commit", "github_list_pull_requests"]);
  });

  it("every description names when to use another tool", () => {
    const names = hubTools.map((t) => t.name);
    for (const tool of hubTools) {
      const others = names.filter((n) => n !== tool.name);
      expect(
        others.some((n) => tool.description.includes(n)),
        tool.name,
      ).toBe(true);
    }
  });
});

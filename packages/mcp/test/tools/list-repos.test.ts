// Wire tests for github_list_repos: arguments reach the service unchanged, bad input never does,
// and the summary counts repos without quoting their names.

import { GithubReadError, HINTS } from "@hub/core";
import { describe, expect, it, vi } from "vitest";
import { listReposTool } from "../../src/tools/list-repos.js";
import { fakeGithub, serveTools, textOf } from "../helpers/fake-github.js";

const page = (repo: string, nextCursor: string | null) =>
  vi.fn(async () => ({ items: [{ repo, projectId: "p1" }], nextCursor }));

describe("github_list_repos", () => {
  it("passes limit and cursor through and returns the page", async () => {
    const listRepos = page("acme/api", "c2");
    const { client } = await serveTools([listReposTool], fakeGithub({ listRepos }));
    const result = await client.callTool({
      name: "github_list_repos",
      arguments: { limit: 10, cursor: "c1" },
    });
    expect(listRepos).toHaveBeenCalledWith({ limit: 10, cursor: "c1" });
    expect(result.structuredContent).toEqual({
      items: [{ repo: "acme/api", projectId: "p1" }],
      nextCursor: "c2",
    });
    expect(textOf(result).split("\n")[0]).toBe(
      "Listed 1 connected repos. More pages: pass nextCursor as cursor.",
    );
  });

  it("calls the service with no undefined keys when arguments are left out", async () => {
    const listRepos = page("acme/api", null);
    const { client } = await serveTools([listReposTool], fakeGithub({ listRepos }));
    await client.callTool({ name: "github_list_repos", arguments: {} });
    expect(listRepos).toHaveBeenCalledTimes(1);
    expect(Object.keys(listRepos.mock.calls[0]?.[0] ?? { missing: true })).toEqual([]);
  });

  it("limit 51 never reaches the service", async () => {
    const listRepos = page("acme/api", null);
    const { client } = await serveTools([listReposTool], fakeGithub({ listRepos }));
    const result = await client.callTool({ name: "github_list_repos", arguments: { limit: 51 } });
    expect(result.isError).toBe(true);
    expect(listRepos).not.toHaveBeenCalled();
  });

  it("a summary never quotes repo names", async () => {
    const listRepos = page("CANARY/x", null);
    const { client } = await serveTools([listReposTool], fakeGithub({ listRepos }));
    const result = await client.callTool({ name: "github_list_repos", arguments: {} });
    const line1 = textOf(result).split("\n")[0];
    expect(line1).toBe("Listed 1 connected repos.");
    expect(line1).not.toContain("CANARY");
  });

  it("not_connected comes back as its hint", async () => {
    const listRepos = vi.fn(async () => {
      throw new GithubReadError("not_connected", HINTS.not_connected);
    });
    const { client } = await serveTools([listReposTool], fakeGithub({ listRepos }));
    const result = await client.callTool({ name: "github_list_repos", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result).split("\n")[1]).toBe(HINTS.not_connected);
  });
});

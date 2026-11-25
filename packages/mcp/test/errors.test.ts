// Tests for the error mapper: known hub errors keep their fixed message and fix-it hint,
// anything else is logged and replaced by fixed text, so no internal detail reaches the model.

import { GithubReadError, HINTS } from "@hub/core";
import { describe, expect, it, vi } from "vitest";
import { INTERNAL_ERROR_TEXT, toErrorResult } from "../src/errors.js";

const textOf = (result: ReturnType<typeof toErrorResult>): string =>
  result.content[0]?.type === "text" ? result.content[0].text : "";

describe("toErrorResult", () => {
  it("maps a GithubReadError to its message, kind and hint", () => {
    const logError = vi.fn();
    const result = toErrorResult(
      new GithubReadError("repo_not_allowed", HINTS.repo_not_allowed),
      "github_list_pull_requests",
      logError,
    );
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Repo is not connected to the hub (repo_not_allowed).\n" + HINTS.repo_not_allowed,
        },
      ],
      isError: true,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("adds retryAfterSeconds when GitHub sent it", () => {
    const withWait = toErrorResult(
      new GithubReadError("rate_limited", HINTS.rate_limited, 30),
      "github_get_commit",
      vi.fn(),
    );
    expect(textOf(withWait).split("\n")[1]).toBe(`${HINTS.rate_limited} retryAfterSeconds: 30`);

    const withoutWait = toErrorResult(
      new GithubReadError("rate_limited", HINTS.rate_limited_unknown),
      "github_get_commit",
      vi.fn(),
    );
    expect(textOf(withoutWait).split("\n")[1]).toBe(HINTS.rate_limited_unknown);
  });

  it("hides an unknown error and logs it", () => {
    const logError = vi.fn();
    const error = new Error("connect postgres://u:pw@host/db failed");
    const result = toErrorResult(error, "github_list_repos", logError);
    expect(result).toEqual({
      content: [{ type: "text", text: INTERNAL_ERROR_TEXT }],
      isError: true,
    });
    expect(textOf(result)).not.toContain("postgres://");
    expect(logError).toHaveBeenCalledWith(error, { tool: "github_list_repos" });
  });

  it("hides a thrown non-Error", () => {
    for (const thrown of ["boom", { token: "ghs_x" }]) {
      const logError = vi.fn();
      expect(textOf(toErrorResult(thrown, "hub_whoami", logError))).toBe(INTERNAL_ERROR_TEXT);
      expect(logError).toHaveBeenCalledWith(thrown, { tool: "hub_whoami" });
    }
  });

  it("does not echo the caller's input", () => {
    const result = toErrorResult(
      new GithubReadError("invalid_input", HINTS.repo),
      "github_get_commit",
      vi.fn(),
    );
    expect(textOf(result)).toBe(`Invalid input (invalid_input).\n${HINTS.repo}`);
  });
});

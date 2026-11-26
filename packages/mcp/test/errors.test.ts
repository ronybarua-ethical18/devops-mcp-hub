// Tests for the error mapper: known hub errors keep their fixed message and fix-it hint,
// anything else is logged and replaced by fixed text, so no internal detail reaches the model.

import { GithubReadError, HINTS } from "@hub/core";
import { describe, expect, it, vi } from "vitest";
import { ResourceNotFoundError } from "@modelcontextprotocol/server";
import { INTERNAL_ERROR_TEXT, toErrorResult, toResourceError } from "../src/errors.js";

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

  it("a logger that throws does not escape", () => {
    const logError = vi.fn(() => {
      throw new Error("logger down at https://logs.internal/?key=secret");
    });
    const result = toErrorResult(new Error("boom"), "github_get_commit", logError);
    expect(textOf(result)).toBe(INTERNAL_ERROR_TEXT);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("toResourceError maps kinds to wire codes with fixed text", () => {
    const uri = "github://acme/api/commits/main";
    const invalid = toResourceError(
      new GithubReadError("invalid_input", HINTS.sha),
      uri,
      "github_commit",
      vi.fn(),
    );
    expect(invalid.code).toBe(-32602);
    expect(invalid.message).toBe(`Invalid input (invalid_input).\n${HINTS.sha}`);

    for (const kind of ["repo_not_allowed", "not_found"] as const) {
      const hint = kind === "not_found" ? HINTS.commit_not_found : HINTS.repo_not_allowed;
      const missing = toResourceError(
        new GithubReadError(kind, hint),
        uri,
        "github_commit",
        vi.fn(),
      );
      expect(missing).toBeInstanceOf(ResourceNotFoundError);
      expect(missing.message).toContain(`(${kind}).\n${hint}`);
    }

    const limited = toResourceError(
      new GithubReadError("rate_limited", HINTS.rate_limited, 30),
      uri,
      "github_commit",
      vi.fn(),
    );
    expect(limited.code).toBe(-32603);
    expect(limited.message).toContain(HINTS.rate_limited);

    const logError = vi.fn();
    const hidden = toResourceError(new Error("postgres://u:pw@h"), uri, "github_commit", logError);
    expect(hidden.code).toBe(-32603);
    expect(hidden.message).toBe(INTERNAL_ERROR_TEXT);
    expect(logError).toHaveBeenCalledTimes(1);
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

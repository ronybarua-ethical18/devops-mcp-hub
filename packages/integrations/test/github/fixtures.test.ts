// Checks the hand-written fixtures against the same zod schemas the adapter uses on live replies.
// A fixture that drifts from the schema fails here, so tests cannot pass on a wrong fake.

import { describe, expect, it } from "vitest";
import {
  commitSchema,
  installationTokenSchema,
  pullListSchema,
  repoListSchema,
} from "../../src/github/schemas.js";
import { commitBody, installationTokenBody, pullsBody, reposBody } from "./fixtures.js";

describe("fixtures match the adapter's schemas", () => {
  it("installation token", () => {
    expect(installationTokenSchema.safeParse(installationTokenBody(new Date())).success).toBe(true);
  });
  it("repository list", () => {
    expect(repoListSchema.safeParse(reposBody).success).toBe(true);
  });
  it("pull request list", () => {
    expect(pullListSchema.safeParse(pullsBody).success).toBe(true);
  });
  it("commit", () => {
    expect(commitSchema.safeParse(commitBody).success).toBe(true);
  });
});

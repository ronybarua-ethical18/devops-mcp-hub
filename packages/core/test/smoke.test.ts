// A minimal test that checks the core package loads and exports its name.
// It exists so the core package has at least one test while its real logic is still to come.

import { describe, expect, it } from "vitest";
import { HUB_NAME } from "../src/index.js";

describe("core", () => {
  it("exports the hub name", () => {
    expect(HUB_NAME).toBe("devops-mcp-hub");
  });
});

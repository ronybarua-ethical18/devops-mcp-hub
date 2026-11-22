import { describe, expect, it } from "vitest";
import { HUB_NAME } from "../src/index.js";

describe("core", () => {
  it("exports the hub name", () => {
    expect(HUB_NAME).toBe("devops-mcp-hub");
  });
});

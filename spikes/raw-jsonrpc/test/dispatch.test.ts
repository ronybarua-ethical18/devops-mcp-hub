import { describe, expect, it } from "vitest";
import { handleLine } from "../src/dispatch.js";

const VALID_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};

function req(
  method: string,
  params: Record<string, unknown> = {},
  id: string | number = 1,
  meta: Record<string, unknown> = VALID_META,
): string {
  const { _meta: extraMeta, ...rest } = params as { _meta?: Record<string, unknown> };
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: { ...rest, _meta: { ...meta, ...extraMeta } },
  });
}

// Loose view of a response for assertions. Fields are optional: tests check their presence.
type Res = {
  id: unknown;
  result?: {
    resultType?: unknown;
    cacheScope?: unknown;
    ttlMs?: unknown;
    tools?: { name?: unknown }[];
    content?: { type?: unknown; text?: unknown }[];
    structuredContent?: unknown;
    isError?: unknown;
    _meta?: Record<string, { name?: unknown } | undefined>;
  };
  error?: { code: number; message: string; data?: unknown };
};
const text = (res: Res): string => String(res.result?.content?.[0]?.text);
const call = (line: string) => handleLine(line) as Res;

describe("handleLine", () => {
  it("returns -32700 with id null for malformed JSON", () => {
    const res = call("{oops");
    expect(res.error?.code).toBe(-32700);
    expect(res.id).toBeNull();
  });

  it("returns -32600 for a batch array", () => {
    const res = call("[" + req("tools/list") + "]");
    expect(res.error?.code).toBe(-32600);
    expect(res.id).toBeNull();
  });

  it("returns -32600 when jsonrpc is not '2.0'", () => {
    const res = call(JSON.stringify({ jsonrpc: "1.0", id: 1, method: "tools/list" }));
    expect(res.error?.code).toBe(-32600);
  });

  it("ignores blank lines", () => {
    expect(handleLine("")).toBeNull();
    expect(handleLine("   ")).toBeNull();
  });

  it("trims trailing \\r", () => {
    const res = call(req("server/discover") + "\r");
    expect(res.result).toBeDefined();
  });

  it("returns null for notifications", () => {
    const line = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1, _meta: VALID_META },
    });
    expect(handleLine(line)).toBeNull();
  });

  it("returns -32602 when params is missing on a request", () => {
    const res = call(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(res.error?.code).toBe(-32602);
  });

  it("returns -32602 when _meta protocolVersion is missing", () => {
    const res = call(
      req("tools/list", {}, 1, { "io.modelcontextprotocol/clientCapabilities": {} }),
    );
    expect(res.error?.code).toBe(-32602);
  });

  it("returns -32602 when _meta clientCapabilities is missing", () => {
    const res = call(
      req("tools/list", {}, 1, { "io.modelcontextprotocol/protocolVersion": "2026-07-28" }),
    );
    expect(res.error?.code).toBe(-32602);
  });

  it("returns -32022 for an unsupported version", () => {
    const res = call(
      req("tools/list", {}, 1, {
        ...VALID_META,
        "io.modelcontextprotocol/protocolVersion": "1900-01-01",
      }),
    );
    expect(res.error?.code).toBe(-32022);
    expect(res.error?.data).toEqual({ supported: ["2026-07-28"], requested: "1900-01-01" });
  });

  it("rejects initialize with -32601 naming supported versions", () => {
    const res = call(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      }),
    );
    expect(res.error?.code).toBe(-32601);
    expect(res.error?.message).toContain("2026-07-28");
  });

  it("rejects ping with -32601", () => {
    expect(call(req("ping")).error?.code).toBe(-32601);
  });

  it("returns -32601 for unknown methods", () => {
    expect(call(req("resources/list")).error?.code).toBe(-32601);
  });

  it("server/discover returns capabilities and cache hints", () => {
    const { result } = call(req("server/discover"));
    expect(result).toMatchObject({
      resultType: "complete",
      supportedVersions: ["2026-07-28"],
      capabilities: { tools: {} },
      cacheScope: "private",
    });
    expect(typeof result?.ttlMs).toBe("number");
    expect(result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name).toBe("raw-jsonrpc-spike");
  });

  it("echoes string and number ids unchanged", () => {
    expect(call(req("server/discover", {}, "abc")).id).toBe("abc");
    expect(call(req("server/discover", {}, 42)).id).toBe(42);
  });
});

describe("tools", () => {
  const callDivide = (args: unknown) =>
    call(req("tools/call", { name: "divide", arguments: args }));

  it("tools/list returns divide with cache hints", () => {
    const { result } = call(req("tools/list"));
    expect(result?.tools?.[0]?.name).toBe("divide");
    expect(result?.cacheScope).toBe("private");
    expect(typeof result?.ttlMs).toBe("number");
    expect(result?.resultType).toBe("complete");
  });

  it("divide returns structuredContent and a JSON text block", () => {
    const res = callDivide({ a: 6, b: 3 });
    expect(res.result?.structuredContent).toEqual({ quotient: 2 });
    expect(JSON.parse(text(res))).toEqual({ quotient: 2 });
    expect(res.result?.isError).toBe(false);
  });

  it("divide by zero is a tool error, not a protocol error", () => {
    const res = callDivide({ a: 1, b: 0 });
    expect(res.error).toBeUndefined();
    expect(res.result?.isError).toBe(true);
    expect(text(res)).toContain("non-zero b");
  });

  it("a quotient that overflows to Infinity is a tool error", () => {
    const res = callDivide({ a: 1e308, b: 1e-308 });
    expect(res.error).toBeUndefined();
    expect(res.result?.isError).toBe(true);
    expect(res.result?.structuredContent).toBeUndefined();
    expect(text(res)).toContain("too large");
  });

  it("wrong argument types are a tool error with a hint", () => {
    for (const args of [{ a: 6, b: "2" }, { a: 6 }]) {
      const res = callDivide(args);
      expect(res.result?.isError).toBe(true);
      expect(text(res)).toContain("must both be numbers");
    }
  });

  it("extra argument keys are a tool error, matching additionalProperties: false", () => {
    const res = callDivide({ a: 6, b: 3, c: 1 });
    expect(res.error).toBeUndefined();
    expect(res.result?.isError).toBe(true);
    expect(res.result?.structuredContent).toBeUndefined();
    expect(text(res)).toContain("only a and b");
  });

  it("reports wrong types and extra keys together, so one retry fixes both", () => {
    const res = callDivide({ a: 6, c: 1 });
    expect(res.result?.isError).toBe(true);
    expect(text(res)).toContain("must both be numbers");
    expect(text(res)).toContain("only a and b");
    expect(text(res)).toContain("c");
  });

  it("bounds how many extra key names, and how much of each, it echoes back", () => {
    const long = "x".repeat(500);
    const res = callDivide({ a: 6, b: 3, [long]: 1, k2: 1, k3: 1, k4: 1, k5: 1 });
    expect(res.result?.isError).toBe(true);
    expect(text(res)).not.toContain("x".repeat(41));
    expect(text(res)).toContain("and 2 more");
    expect(text(res).length).toBeLessThan(250);
  });

  it("unknown tool is protocol error -32602", () => {
    expect(call(req("tools/call", { name: "nope", arguments: {} })).error?.code).toBe(-32602);
  });

  it("tools/call without a string name is -32602", () => {
    expect(call(req("tools/call", { name: 5, arguments: {} })).error?.code).toBe(-32602);
  });
});

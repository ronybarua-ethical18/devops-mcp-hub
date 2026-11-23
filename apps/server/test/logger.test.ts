// Tests for logger.ts: every log line carries the right trace_id, even across await and parallel requests.
// Also checks that token, password and authorization fields are hidden.

import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, currentTraceId, runWithTrace } from "../src/logger.js";

function capture(level = "info") {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split("\n").filter(Boolean));
      callback();
    },
  });
  const records = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { logger: createLogger({ level }, stream), lines, records };
}

describe("logger", () => {
  it('puts trace_id "none" on lines logged outside a trace', () => {
    const { logger, records } = capture();
    logger.info("hello");
    expect(records()[0]).toMatchObject({ msg: "hello", trace_id: "none" });
    expect(currentTraceId()).toBe("none");
  });

  it("puts the active trace_id on every line, including after an await", async () => {
    const { logger, records } = capture();
    await runWithTrace("trace-1", async () => {
      logger.info("before");
      await new Promise((resolve) => setTimeout(resolve, 5));
      logger.warn("after");
      expect(currentTraceId()).toBe("trace-1");
    });
    expect(records().map((r) => r["trace_id"])).toEqual(["trace-1", "trace-1"]);
  });

  it("falls back to the child logger's reqId before a trace is active", () => {
    const { logger, records } = capture();
    logger.child({ reqId: "req-9" }).info("incoming request");
    runWithTrace("trace-2", () => logger.child({ reqId: "req-9" }).info("inside"));
    expect(records().map((r) => r["trace_id"])).toEqual(["req-9", "trace-2"]);
  });

  it("keeps concurrent traces apart", async () => {
    const { logger, records } = capture();
    await Promise.all(
      ["a", "b"].map((id) =>
        runWithTrace(id, async () => {
          await new Promise((resolve) => setTimeout(resolve, id === "a" ? 10 : 1));
          logger.info({ id }, "line");
        }),
      ),
    );
    for (const record of records()) expect(record["trace_id"]).toBe(record["id"]);
  });

  it("redacts token, password and authorization fields", () => {
    const { logger, lines } = capture();
    logger.info(
      {
        token: "ghp_SECRETTOKEN",
        password: "hunter2",
        authorization: "Bearer SECRETBEARER",
        headers: { authorization: "Bearer SECRETBEARER2" },
        credentials: { token: "ghp_NESTED" },
      },
      "request",
    );
    const output = lines.join("\n");
    for (const secret of ["SECRETTOKEN", "hunter2", "SECRETBEARER", "SECRETBEARER2", "NESTED"]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("[REDACTED]");
  });

  it("respects the configured level", () => {
    const { logger, lines } = capture("warn");
    logger.info("quiet");
    logger.error("loud");
    expect(lines).toHaveLength(1);
  });
});

// Tests for logger.ts: every log line carries the right trace_id, even across await and parallel requests.
// Also checks that secret fields, cookies and token-shaped values (GitHub, Sentry, Bearer, DB URLs) are hidden.

import { Writable } from "node:stream";
import Fastify from "fastify";
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

  it("redacts cookies, set-cookie, nested authorization and secret env names", () => {
    const { logger, lines } = capture();
    logger.info({
      req: { headers: { authorization: "Bearer AAAAAAAAAAAAAAAAAAAA1", cookie: "sid=COOKIE1" } },
      res: { headers: { "set-cookie": "sid=COOKIE2" } },
      env: { DATABASE_URL: "postgres://u:DBPASS1@h/db", HUB_MASTER_KEY: "MASTERKEY1" },
    });
    const out = lines.join("\n");
    for (const s of ["AAAAAAAAAAAAAAAAAAAA1", "COOKIE1", "COOKIE2", "DBPASS1", "MASTERKEY1"]) {
      expect(out).not.toContain(s);
    }
  });

  it("scrubs token formats from any string, including the message", () => {
    const { logger, lines } = capture();
    const ghp = `ghp_${"a".repeat(36)}`;
    const pat = `github_pat_${"b".repeat(40)}`;
    const sentry = `sntrys_${"c".repeat(40)}`;
    logger.info({ note: `pasted ${pat}`, list: [sentry] }, `using ${ghp}`);
    logger.warn("connect postgresql://user:PGSECRET@host/db failed");
    const out = lines.join("\n");
    for (const s of [ghp, pat, sentry, "PGSECRET"]) expect(out).not.toContain(s);
  });

  it("scrubs a token from an Error message and stack", () => {
    const { logger, lines } = capture();
    const ghp = `ghp_${"d".repeat(36)}`;
    logger.error({ err: new Error(`bad token ${ghp}`) }, "failed");
    expect(lines.join("\n")).not.toContain(ghp);
  });

  it("logs a circular object without throwing", () => {
    const { logger, lines } = capture();
    const ghp = `ghp_${"e".repeat(36)}`;
    const loop: Record<string, unknown> = { note: ghp };
    loop["self"] = loop;
    const err = Object.assign(new Error("cyclic"), { ctx: loop });
    expect(() => logger.info({ loop }, "cycle")).not.toThrow();
    expect(() => logger.error({ err }, "cycle")).not.toThrow();
    expect(lines.join("\n")).not.toContain(ghp);
  });

  it("keeps an Error's class and cause, with the cause scrubbed", () => {
    class ProviderError extends Error {
      override name = "ProviderError";
    }
    const { logger, lines, records } = capture();
    const ghp = `ghp_${"f".repeat(36)}`;
    const err = new ProviderError("call failed", { cause: new TypeError(`root ${ghp}`) });
    logger.error({ err }, "failed");
    const logged = records()[0]?.["err"] as Record<string, unknown>;
    expect(logged["type"]).toBe("ProviderError");
    expect(lines.join("\n")).toContain("root [REDACTED]");
    expect(lines.join("\n")).not.toContain(ghp);
  });

  it("scrubs a token inside a class instance, including prototype getters", () => {
    class ProviderResponse {
      constructor(readonly url: string) {}
      get href(): string {
        return this.url;
      }
    }
    const { logger, lines } = capture();
    const ghp = `ghp_${"g".repeat(36)}`;
    logger.info({ res: new ProviderResponse(`https://api.example.com/?access=${ghp}`) }, "got");
    expect(lines.join("\n")).not.toContain(ghp);
    expect(lines.join("\n")).toContain("[REDACTED]");
  });

  it("scrubs a token in a child-logger binding and in an object key", () => {
    const { logger, lines } = capture();
    const ghp = `ghp_${"h".repeat(36)}`;
    logger.child({ upstream: `https://x.test/?t=${ghp}` }).info({ [ghp]: 1 }, "bound");
    expect(lines.join("\n")).not.toContain(ghp);
  });

  it("scrubs a token in Fastify's req.url", async () => {
    const { logger, lines } = capture();
    const ghp = `ghp_${"i".repeat(36)}`;
    const app = Fastify({ loggerInstance: logger });
    app.get("/ping", async () => ({ ok: true }));
    await app.inject({ method: "GET", url: `/ping?token_in_url=${ghp}` });
    await app.close();
    const out = lines.join("\n");
    expect(out).toContain("/ping");
    expect(out).not.toContain(ghp);
  });

  it("cuts off very deep objects instead of walking them forever", () => {
    const { logger, lines } = capture();
    const ghp = `ghp_${"j".repeat(36)}`;
    let deep: Record<string, unknown> = { leaf: ghp };
    for (let i = 0; i < 50; i++) deep = { next: deep };
    expect(() => logger.info({ deep }, "deep")).not.toThrow();
    expect(lines.join("\n")).not.toContain(ghp);
  });

  it("leaves ordinary values alone", () => {
    const { logger, records } = capture();
    const id = "3f2b6c1e-8a4d-4c2b-9e7f-1a2b3c4d5e6f";
    runWithTrace(id, () => logger.info({ id, word: "ghost_writer" }, "plain message"));
    expect(records()[0]).toMatchObject({
      id,
      word: "ghost_writer",
      msg: "plain message",
      trace_id: id,
    });
  });

  it("respects the configured level", () => {
    const { logger, lines } = capture("warn");
    logger.info("quiet");
    logger.error("loud");
    expect(lines).toHaveLength(1);
  });
});

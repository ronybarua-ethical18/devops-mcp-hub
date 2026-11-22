import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};
const discover = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "server/discover",
  params: { _meta: META },
});

let child: ChildProcessWithoutNullStreams | undefined;

function start(): {
  child: ChildProcessWithoutNullStreams;
  lines: string[];
  next: () => Promise<string>;
} {
  child = spawn(process.execPath, ["--import", "tsx", ENTRY], { stdio: "pipe" });
  const lines: string[] = [];
  const waiters: ((l: string) => void)[] = [];
  createInterface({ input: child.stdout }).on("line", (l) => {
    const w = waiters.shift();
    if (w) w(l);
    else lines.push(l);
  });
  const next = () =>
    new Promise<string>((resolve) => {
      const l = lines.shift();
      if (l !== undefined) resolve(l);
      else waiters.push(resolve);
    });
  return { child, lines, next };
}

const exitCode = (c: ChildProcessWithoutNullStreams, ms: number) =>
  new Promise<number | null>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no exit within ${ms}ms`)), ms);
    c.once("exit", (code) => {
      clearTimeout(t);
      resolve(code);
    });
  });

afterEach(() => {
  if (child && child.exitCode === null) child.kill();
  child = undefined;
});

describe("raw stdio server", () => {
  it("answers server/discover over stdio", async () => {
    const s = start();
    s.child.stdin.write(discover + "\n");
    expect(JSON.parse(await s.next()).result.resultType).toBe("complete");
  });

  it("writes nothing but JSON-RPC to stdout", async () => {
    const s = start();
    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 9, _meta: META },
    });
    s.child.stdin.write(discover + "\n" + "{oops\n" + notification + "\n");
    s.child.stdin.end();
    await exitCode(s.child, 5000);
    const all = [...s.lines];
    expect(all).toHaveLength(2);
    for (const l of all) expect(() => JSON.parse(l)).not.toThrow();
  });

  it("exits 0 within 1s when stdin closes", async () => {
    const s = start();
    // Wait until the server is up (it answers discover) so startup time is not counted.
    s.child.stdin.write(discover + "\n");
    await s.next();
    s.child.stdin.end();
    expect(await exitCode(s.child, 1000)).toBe(0);
  });
});

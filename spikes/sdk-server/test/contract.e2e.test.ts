// One SDK client (pinned to 2026-07-28) against three servers. If the hand-written raw server
// disagrees with the SDK servers, the raw server is out of spec: fix it, not this test.
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const RAW_ENTRY = path("../../raw-jsonrpc/src/index.ts");
const SDK_STDIO = path("../src/stdio.ts");
const SDK_HTTP = path("../src/http.ts");
const TSX = ["--import", "tsx"];

const newClient = () =>
  new Client(
    { name: "contract", version: "0.0.1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: "GET" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`server at ${url} did not start within ${ms}ms`);
}

type Target = { name: string; connect: () => Promise<Client> };

let httpChild: ChildProcess | undefined;
let httpUrl = "";

const stdioTarget = (name: string, entry: string): Target => ({
  name,
  connect: async () => {
    const client = newClient();
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [...TSX, entry] }),
    );
    return client;
  },
});

const targets: Target[] = [
  stdioTarget("raw-stdio", RAW_ENTRY),
  stdioTarget("sdk-stdio", SDK_STDIO),
  {
    name: "sdk-http",
    connect: async () => {
      const client = newClient();
      await client.connect(new StreamableHTTPClientTransport(new URL(httpUrl)));
      return client;
    },
  },
];

beforeAll(async () => {
  const port = await freePort();
  httpUrl = `http://127.0.0.1:${port}/mcp`;
  httpChild = spawn(process.execPath, [...TSX, SDK_HTTP], {
    env: { ...process.env, PORT: String(port) },
    // Pass stderr through so a startup crash is visible in the test output.
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForHttp(httpUrl);
}, 20_000);

afterAll(() => {
  httpChild?.kill();
});

describe.each(targets)("$name", (target) => {
  let client: Client;

  beforeAll(async () => {
    client = await target.connect();
  });

  afterAll(async () => {
    await client?.close();
  });

  it("lists divide as read-only", async () => {
    const { tools } = await client.listTools();
    const divide = tools.find((t) => t.name === "divide");
    expect(divide?.annotations?.readOnlyHint).toBe(true);
  });

  it("returns structuredContent for 6 / 3", async () => {
    const result = await client.callTool({ name: "divide", arguments: { a: 6, b: 3 } });
    expect(result.structuredContent).toEqual({ quotient: 2 });
  });

  it("returns a tool error for divide by zero", async () => {
    const result = await client.callTool({ name: "divide", arguments: { a: 1, b: 0 } });
    expect(result.isError).toBe(true);
    const first = (result.content as { type: string; text?: string }[])[0];
    expect(first?.text).toContain("non-zero b");
  });

  it("returns a tool error when the quotient overflows", async () => {
    const result = await client.callTool({ name: "divide", arguments: { a: 1e308, b: 1e-308 } });
    expect(result.isError).toBe(true);
    const first = (result.content as { type: string; text?: string }[])[0];
    expect(first?.text).toContain("too large");
  });

  it("returns a tool error (not a protocol error) for wrong argument types", async () => {
    // Hint wording differs between implementations; only the behaviour must match.
    const result = await client.callTool({ name: "divide", arguments: { a: 6, b: "2" } });
    expect(result.isError).toBe(true);
    const first = (result.content as { type: string; text?: string }[])[0];
    expect(first?.text).toBeTruthy();
  });

  it("advertises a strict input schema and enforces it", async () => {
    const { tools } = await client.listTools();
    const divide = tools.find((t) => t.name === "divide");
    expect(divide?.inputSchema.additionalProperties).toBe(false);
    const result = await client.callTool({ name: "divide", arguments: { a: 6, b: 3, c: 1 } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it("rejects an unknown tool with -32602", async () => {
    await expect(client.callTool({ name: "nope", arguments: {} })).rejects.toMatchObject({
      code: -32602,
    });
  });
});

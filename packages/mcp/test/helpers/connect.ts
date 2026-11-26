// Test helper: connects a real SDK client (pinned to 2026-07-28) to a server factory in-process.
// Requests go straight to createMcpHandler, with no port, and every raw JSON-RPC response is kept for wire assertions.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, type McpServer } from "@modelcontextprotocol/server";

export interface Connected {
  client: Client;
  /** Every JSON-RPC message the server sent back, in order. */
  wire: unknown[];
}

export async function connect(makeServer: () => McpServer): Promise<Connected> {
  const handler = createMcpHandler(makeServer, { legacy: "reject" });
  const wire: unknown[] = [];

  const fetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const response = await handler.fetch(new Request(url, init));
    const body = await response.clone().text();
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("application/json") && body) {
      wire.push(JSON.parse(body));
    } else if (type.includes("text/event-stream")) {
      for (const line of body.split("\n")) {
        if (line.startsWith("data:") && line.slice(5).trim()) wire.push(JSON.parse(line.slice(5)));
      }
    }
    return response;
  };

  const client = new Client(
    { name: "registry-test", version: "0.0.1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), { fetch }),
  );
  return { client, wire };
}

/** The raw `result` of the last wire message that has one with the given key. */
export function lastResultWith(wire: unknown[], key: string): Record<string, unknown> | undefined {
  for (let i = wire.length - 1; i >= 0; i--) {
    const message = wire[i] as { result?: Record<string, unknown> } | undefined;
    if (message?.result && key in message.result) return message.result;
  }
  return undefined;
}

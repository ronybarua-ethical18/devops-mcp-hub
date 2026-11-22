// Same divide tool as spikes/raw-jsonrpc, on the official SDK v2. The SDK generates
// inputSchema/outputSchema JSON Schema from Zod and handles the envelope, _meta and errors.
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const DIVIDE_BY_ZERO_HINT = "Cannot divide by zero. Call divide again with a non-zero b.";

export function createServer(): McpServer {
  const server = new McpServer({ name: "sdk-spike", version: "0.0.1" });

  server.registerTool(
    "divide",
    {
      title: "Divide two numbers",
      description: "Divides a by b and returns the quotient.",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ quotient: z.number() }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ a, b }) => {
      if (b === 0) {
        return { content: [{ type: "text", text: DIVIDE_BY_ZERO_HINT }], isError: true };
      }
      const structuredContent = { quotient: a / b };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    },
  );

  return server;
}

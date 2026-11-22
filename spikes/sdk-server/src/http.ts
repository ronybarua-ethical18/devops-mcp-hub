// Stateless Streamable HTTP: createMcpHandler builds a fresh server per request, so any replica can
// serve any request. createMcpHonoApp adds JSON body parsing and Host/Origin (DNS rebinding)
// checks for localhost — createMcpHandler alone does not validate them. Phase 3 owns this for real.
import { serve } from "@hono/node-server";
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Context } from "hono";
import { createServer } from "./server.js";

const handler = createMcpHandler(createServer, { legacy: "reject" });

const app = createMcpHonoApp();
app.all("/mcp", (c: Context) => handler.fetch(c.req.raw, { parsedBody: c.get("parsedBody") }));

// `||` so an empty PORT falls back too (Number("") is 0, a random port).
const port = Number(process.env.PORT || 4100);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.error(`sdk-spike ready on http://127.0.0.1:${info.port}/mcp (2026-07-28 only)`);
});

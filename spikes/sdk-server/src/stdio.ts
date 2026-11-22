// serveStdio, not server.connect(new StdioServerTransport()): the latter is legacy-era only.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

const handle = serveStdio(createServer, { legacy: "reject" });
process.on("SIGINT", () => void handle.close());

console.error("sdk-spike ready on stdio (2026-07-28 only)");

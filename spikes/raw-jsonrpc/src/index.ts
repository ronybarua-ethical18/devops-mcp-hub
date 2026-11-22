// stdio transport: newline-delimited JSON-RPC on stdin/stdout. stdout carries MCP messages only;
// every log line goes to stderr.
import { createInterface } from "node:readline";
import { handleLine } from "./dispatch.js";
import { PROTOCOL_VERSION, SERVER_INFO } from "./protocol.js";

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const response = handleLine(line);
  if (response !== null) process.stdout.write(JSON.stringify(response) + "\n");
});

// The client closed stdin: shut down. Let the process end on its own instead of process.exit(),
// so stdout writes still queued (async pipes, e.g. macOS) are flushed first.
rl.on("close", () => {
  process.exitCode = 0;
});

console.error(`${SERVER_INFO.name} ready (${PROTOCOL_VERSION})`);

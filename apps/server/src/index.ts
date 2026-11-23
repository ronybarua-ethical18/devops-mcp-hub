// The server's entry point: checks the environment, sets up logging and starts the Fastify web server.
// Every request gets a trace id here, so all its log lines can be followed end to end.

import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { HUB_NAME } from "@hub/core";
import { EnvError, loadEnv, type Env } from "./env.js";
import { createLogger, runWithTrace } from "./logger.js";

// Fail fast: nothing below runs, and nothing listens, with an invalid environment.
let env: Env;
try {
  env = loadEnv(process.env);
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const app = Fastify({
  loggerInstance: createLogger({ level: env.LOG_LEVEL }),
  genReqId: () => randomUUID(),
});

// Every log line emitted while handling a request carries the request's trace_id.
app.addHook("onRequest", (request, _reply, done) => {
  runWithTrace(request.id, done);
});

app.get("/health", async () => ({ status: "ok", service: HUB_NAME }));

await app.listen({ port: env.PORT, host: "0.0.0.0" });

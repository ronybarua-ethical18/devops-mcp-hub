import { AsyncLocalStorage } from "node:async_hooks";
import { pino, type DestinationStream, type Logger } from "pino";

const traceStorage = new AsyncLocalStorage<string>();

/** Run `fn` with `traceId` attached to every log line emitted inside it, across awaits. */
export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceStorage.run(traceId, fn);
}

export function currentTraceId(): string {
  return traceStorage.getStore() ?? "none";
}

function traceIdFor(self: Logger): string {
  const active = traceStorage.getStore();
  if (active !== undefined) return active;
  const { reqId } = self.bindings();
  return typeof reqId === "string" ? reqId : "none";
}

const REDACT_PATHS = [
  "token",
  "password",
  "authorization",
  "*.token",
  "*.password",
  "*.authorization",
];

/** Pino logger with `trace_id` on every line. `destination` exists for tests. */
export function createLogger(opts: { level: string }, destination?: DestinationStream): Logger {
  return pino(
    {
      level: opts.level,
      // Fastify logs "incoming request" before any hook can start the trace; its child logger
      // already carries the request id, which becomes the trace id.
      mixin: (_merge, _level, self) => ({ trace_id: traceIdFor(self) }),
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    },
    destination,
  );
}

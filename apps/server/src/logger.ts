// Creates the server's logger (Pino) and attaches the current request's trace_id to every log line.
// Also hides secret fields and token-shaped values (see redact.ts), including in the final JSON line.

import { AsyncLocalStorage } from "node:async_hooks";
import { pino, type DestinationStream, type Logger } from "pino";
import { REDACT_PATHS, scrubSecrets, scrubString } from "./redact.js";

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

/**
 * Last line of defence: scrub the finished JSON line just before it is written. This covers what
 * the object walk can't reach: class instances (Fastify `req.url`, provider responses), object
 * keys and child-logger bindings. Token formats contain no JSON-escaped characters, so matching
 * on the serialized text is safe and costs one pass over the line, however deep the object was.
 */
export function scrubbedDestination(inner: DestinationStream): DestinationStream {
  // Pino's default destination (SonicBoom) also has flushSync/end; forward them so the wrapper
  // doesn't hide them and the stream can still be flushed and closed on shutdown.
  const closable = inner as DestinationStream & { flushSync?: () => void; end?: () => void };
  return {
    write: (line: string) => inner.write(scrubString(line)),
    ...(closable.flushSync !== undefined && { flushSync: () => closable.flushSync?.() }),
    ...(closable.end !== undefined && { end: () => closable.end?.() }),
  } as DestinationStream;
}

/** Pino logger with `trace_id` on every line. `destination` exists for tests. */
export function createLogger(opts: { level: string }, destination?: DestinationStream): Logger {
  return pino(
    {
      level: opts.level,
      // Fastify logs "incoming request" before any hook can start the trace; its child logger
      // already carries the request id, which becomes the trace id.
      mixin: (_merge, _level, self) => ({ trace_id: traceIdFor(self) }),
      redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" },
      // Field names catch known secret fields; this catches token-shaped values in the
      // logged object and the message. It runs before Pino serializes `err`.
      hooks: {
        logMethod(args, method) {
          const scrubbed = args.map((a: unknown) => scrubSecrets(a));
          method.apply(this, scrubbed as Parameters<typeof method>);
        },
      },
    },
    scrubbedDestination(destination ?? pino.destination(1)),
  );
}

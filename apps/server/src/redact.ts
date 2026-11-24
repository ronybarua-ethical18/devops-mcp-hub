// The list of secret fields to hide in logs, and scrubbers that blank out token-shaped values.
// Used by logger.ts so a token, cookie or database password never ends up in a log line.

/** Field paths Pino blanks out, whatever their value. `*` matches one level of nesting. */
export const REDACT_PATHS: readonly string[] = [
  "token",
  "password",
  "authorization",
  "*.token",
  "*.password",
  "*.authorization",
  "cookie",
  "*.cookie",
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  "*.headers.authorization",
  "*.headers.cookie",
  '*.headers["set-cookie"]',
  "DATABASE_URL",
  "DIRECT_URL",
  "HUB_MASTER_KEY",
  "*.DATABASE_URL",
  "*.DIRECT_URL",
  "*.HUB_MASTER_KEY",
];

const CENSOR = "[REDACTED]";

// Token formats with a fixed prefix. Vercel tokens have none, so only field names cover them.
const VALUE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, CENSOR],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, CENSOR],
  [/\bsntry[su]_[A-Za-z0-9+/=_-]{20,}/g, CENSOR],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, `Bearer ${CENSOR}`],
  [/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/g, `$1${CENSOR}@`],
];

/** Replace every known token format in `text` with [REDACTED]. */
export function scrubString(text: string): string {
  let out = text;
  for (const [pattern, replacement] of VALUE_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Nesting deeper than this is cut off, so the object walk stays bounded. It only limits plain
 * objects, arrays and Errors: a huge class instance is still serialized by Pino in full, and
 * logger.ts scrubs that line (cost grows with line size, not depth).
 */
const MAX_DEPTH = 10;

/**
 * Deep-scrub strings in plain objects, arrays and Errors. Returns a copy; never mutates.
 * Cycles are copied as cycles (Pino prints them as "[Circular]"); Errors keep their class and cause.
 * Class instances (Fastify's `req`, SDK responses) are returned as they are, because Pino's
 * serializers read their prototype getters; logger.ts scrubs the serialized line to cover them.
 */
export function scrubSecrets(value: unknown): unknown {
  return scrubValue(value, new WeakMap<object, unknown>(), 0);
}

function scrubValue(value: unknown, seen: WeakMap<object, unknown>, depth: number): unknown {
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return seen.get(value);
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(scrubValue(item, seen, depth + 1));
    return copy;
  }
  if (value instanceof Error) {
    // Same prototype, so Pino still logs the real class name (type) and instanceof still works.
    const copy = Object.create(Object.getPrototypeOf(value) as object) as Record<string, unknown>;
    seen.set(value, copy);
    copy["message"] = scrubString(value.message);
    if (value.stack !== undefined) copy["stack"] = scrubString(value.stack);
    if (Object.hasOwn(value, "cause")) copy["cause"] = scrubValue(value.cause, seen, depth + 1);
    for (const [key, inner] of Object.entries(value)) {
      copy[key] = scrubValue(inner, seen, depth + 1);
    }
    return copy;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const [key, inner] of Object.entries(value)) {
      copy[key] = scrubValue(inner, seen, depth + 1);
    }
    return copy;
  }
  return value;
}

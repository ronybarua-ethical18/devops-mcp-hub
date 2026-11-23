// The list of secret fields to hide in logs, and a scrubber that blanks out token-shaped values.
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

/** Deep-scrub strings in plain objects, arrays and Errors. Returns a copy; never mutates. */
export function scrubSecrets(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value instanceof Error) {
    const copy = new Error(scrubString(value.message));
    copy.name = value.name;
    if (value.stack === undefined) delete copy.stack;
    else copy.stack = scrubString(value.stack);
    for (const [key, inner] of Object.entries(value)) {
      (copy as unknown as Record<string, unknown>)[key] = scrubSecrets(inner);
    }
    return copy;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubSecrets(v)]));
  }
  return value;
}

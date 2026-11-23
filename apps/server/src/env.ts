// Reads and checks the server's environment variables (database URL, master key, port) at startup.
// If anything is missing or wrong the server refuses to start, and it never prints the secret values.

import { parseMasterKey, type MasterKey } from "@hub/db";
import { z } from "zod/v4";

export interface Env {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  DATABASE_URL: string;
  HUB_MASTER_KEY: MasterKey;
}

/** Thrown when the environment is invalid. Carries variable names only, never values. */
export class EnvError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(
      `Invalid environment, fix these variables: ${variables.join(", ")} (values are never printed)`,
    );
    this.name = "EnvError";
    this.variables = variables;
  }
}

const port = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: port.optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\//.test(value) && URL.canParse(value)),
  HUB_MASTER_KEY: z.string().transform((value, ctx) => {
    try {
      return parseMasterKey(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid master key" });
      return z.NEVER;
    }
  }),
});

/** Validate the environment at boot. Fails fast with one error naming every bad variable. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = new Set<string>();
    for (const issue of result.error.issues) names.add(String(issue.path[0] ?? "environment"));
    throw new EnvError([...names]);
  }
  const { PORT, ...rest } = result.data;
  return { ...rest, PORT: PORT ?? 4000 };
}

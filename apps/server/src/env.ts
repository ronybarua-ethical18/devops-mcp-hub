// Reads and checks the server's environment variables (database URL, master key, GitHub App, port).
// If anything is missing or wrong the server refuses to start, and it never prints the secret values.

import { parseMasterKey, type MasterKey } from "@hub/db";
import { z } from "zod/v4";

export interface Env {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  DATABASE_URL: string;
  HUB_MASTER_KEY: MasterKey;
  /** GitHub App identity. Unset means GitHub is not configured and its tools stay hidden. */
  GITHUB_APP?: { appId: string; privateKey: string };
  /** Fixed tenant for local development only. Never set in production (Phase 4 adds real auth). */
  DEV_AUTH?: { orgId: string; userId: string };
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

const pemPrivateKey = z
  .string()
  .transform((value) => value.replaceAll("\\n", "\n"))
  .refine((value) =>
    /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----\s*$/.test(value),
  );

const schema = z
  .object({
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
    GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
    GITHUB_APP_PRIVATE_KEY: pemPrivateKey.optional(),
    DEV_AUTH_ORG_ID: z.uuid().optional(),
    DEV_AUTH_USER_ID: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    // Each group is all-or-nothing: name the missing variable, never a value.
    const pairs = [
      ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"],
      ["DEV_AUTH_ORG_ID", "DEV_AUTH_USER_ID"],
    ] as const;
    for (const [a, b] of pairs) {
      if (value[a] !== undefined && value[b] === undefined) {
        ctx.addIssue({ code: "custom", path: [b], message: "required together" });
      }
      if (value[b] !== undefined && value[a] === undefined) {
        ctx.addIssue({ code: "custom", path: [a], message: "required together" });
      }
    }
    if (
      value.NODE_ENV === "production" &&
      (value.DEV_AUTH_ORG_ID !== undefined || value.DEV_AUTH_USER_ID !== undefined)
    ) {
      for (const name of ["DEV_AUTH_ORG_ID", "DEV_AUTH_USER_ID"]) {
        ctx.addIssue({ code: "custom", path: [name], message: "not allowed in production" });
      }
    }
  });

/** Validate the environment at boot. Fails fast with one error naming every bad variable. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = new Set<string>();
    for (const issue of result.error.issues) names.add(String(issue.path[0] ?? "environment"));
    throw new EnvError([...names]);
  }
  const {
    PORT,
    GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY,
    DEV_AUTH_ORG_ID,
    DEV_AUTH_USER_ID,
    ...rest
  } = result.data;
  const env: Env = { ...rest, PORT: PORT ?? 4000 };
  if (GITHUB_APP_ID !== undefined && GITHUB_APP_PRIVATE_KEY !== undefined) {
    env.GITHUB_APP = { appId: GITHUB_APP_ID, privateKey: GITHUB_APP_PRIVATE_KEY };
  }
  if (DEV_AUTH_ORG_ID !== undefined && DEV_AUTH_USER_ID !== undefined) {
    env.DEV_AUTH = { orgId: DEV_AUTH_ORG_ID, userId: DEV_AUTH_USER_ID };
  }
  return env;
}

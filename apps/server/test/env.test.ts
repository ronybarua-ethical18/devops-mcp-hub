// Tests for env.ts: valid settings load, bad or missing ones stop the server.
// Also proves the error message names the broken variables but never shows their values.

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../src/env.js";

const key = randomBytes(32).toString("base64");
const valid = { DATABASE_URL: "postgresql://user:pw@db.example.com/hub", HUB_MASTER_KEY: key };

function failure(source: Record<string, string | undefined>): EnvError {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected loadEnv to throw");
}

describe("loadEnv", () => {
  it("parses a valid source and applies defaults", () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({ NODE_ENV: "development", PORT: 4000, LOG_LEVEL: "info" });
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.HUB_MASTER_KEY.version).toBe(1);
    expect(env.HUB_MASTER_KEY.key.toString("base64")).toBe(key);
  });

  it("accepts explicit values", () => {
    const env = loadEnv({ ...valid, NODE_ENV: "production", PORT: "8080", LOG_LEVEL: "debug" });
    expect(env).toMatchObject({ NODE_ENV: "production", PORT: 8080, LOG_LEVEL: "debug" });
  });

  it("reports every missing variable in one error", () => {
    const error = failure({});
    expect(error.variables).toEqual(expect.arrayContaining(["DATABASE_URL", "HUB_MASTER_KEY"]));
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("HUB_MASTER_KEY");
  });

  it("rejects bad PORT values", () => {
    for (const PORT of ["abc", "0", "70000", "-1", "80.5", ""]) {
      expect(failure({ ...valid, PORT }).variables, PORT).toEqual(["PORT"]);
    }
  });

  it("rejects empty and non-postgres DATABASE_URL", () => {
    for (const DATABASE_URL of ["", "mysql://user:hunter2@host/db", "not a url"]) {
      expect(failure({ ...valid, DATABASE_URL }).variables, DATABASE_URL).toEqual(["DATABASE_URL"]);
    }
  });

  it("rejects a master key that is not base64 or not 32 bytes", () => {
    const bad = [
      "not-base64-SECRETVALUE!!",
      randomBytes(31).toString("base64"),
      randomBytes(33).toString("base64"),
      "",
    ];
    for (const HUB_MASTER_KEY of bad) {
      expect(failure({ ...valid, HUB_MASTER_KEY }).variables, HUB_MASTER_KEY).toEqual([
        "HUB_MASTER_KEY",
      ]);
    }
  });

  it("rejects an unknown NODE_ENV or LOG_LEVEL", () => {
    expect(failure({ ...valid, NODE_ENV: "staging" }).variables).toEqual(["NODE_ENV"]);
    expect(failure({ ...valid, LOG_LEVEL: "loud" }).variables).toEqual(["LOG_LEVEL"]);
  });

  it("never echoes a supplied value in the message or variables", () => {
    const secrets = {
      DATABASE_URL: "mysql://user:hunter2-DBPASSWORD@host/db",
      HUB_MASTER_KEY: "not-base64-SECRETVALUE!!",
      PORT: "abc-PORTVALUE",
    };
    const error = failure(secrets);
    const text = `${error.message} ${error.variables.join(" ")}`;
    for (const value of Object.values(secrets)) expect(text).not.toContain(value);
    for (const fragment of ["hunter2", "DBPASSWORD", "SECRETVALUE", "PORTVALUE"]) {
      expect(text).not.toContain(fragment);
    }
    expect(error.variables.sort()).toEqual(["DATABASE_URL", "HUB_MASTER_KEY", "PORT"]);
  });

  describe("GitHub App settings", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEFAKEBODY\n-----END RSA PRIVATE KEY-----";

    it("leaves GitHub unset when neither variable is given", () => {
      expect(loadEnv(valid).GITHUB_APP).toBeUndefined();
    });

    it("loads the app id and key, turning escaped \\n into real newlines", () => {
      const env = loadEnv({
        ...valid,
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY: pem.replaceAll("\n", "\\n"),
      });
      expect(env.GITHUB_APP).toEqual({ appId: "123456", privateKey: pem });
    });

    it("needs both variables or neither", () => {
      expect(failure({ ...valid, GITHUB_APP_ID: "123456" }).variables).toEqual([
        "GITHUB_APP_PRIVATE_KEY",
      ]);
      expect(failure({ ...valid, GITHUB_APP_PRIVATE_KEY: pem }).variables).toEqual([
        "GITHUB_APP_ID",
      ]);
    });

    it("rejects a non-numeric app id and a key that is not a PEM private key", () => {
      expect(
        failure({ ...valid, GITHUB_APP_ID: "abc", GITHUB_APP_PRIVATE_KEY: pem }).variables,
      ).toEqual(["GITHUB_APP_ID"]);
      expect(
        failure({ ...valid, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "not-a-key-SECRETKEY" })
          .variables,
      ).toEqual(["GITHUB_APP_PRIVATE_KEY"]);
    });

    it("never echoes the private key in an error", () => {
      const error = failure({
        ...valid,
        GITHUB_APP_ID: "1",
        GITHUB_APP_PRIVATE_KEY: "oops-SECRETKEY",
      });
      expect(`${error.message} ${error.variables.join(" ")}`).not.toContain("SECRETKEY");
    });
  });

  describe("dev auth settings", () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const dev = { DEV_AUTH_ORG_ID: orgId, DEV_AUTH_USER_ID: userId };

    it("leaves dev auth unset by default", () => {
      expect(loadEnv(valid).DEV_AUTH).toBeUndefined();
    });

    it("loads an org and user id outside production", () => {
      expect(loadEnv({ ...valid, ...dev }).DEV_AUTH).toEqual({ orgId, userId });
      expect(loadEnv({ ...valid, ...dev, NODE_ENV: "test" }).DEV_AUTH).toEqual({ orgId, userId });
    });

    it("needs both ids or neither, and both must be UUIDs", () => {
      expect(failure({ ...valid, DEV_AUTH_ORG_ID: orgId }).variables).toEqual(["DEV_AUTH_USER_ID"]);
      expect(failure({ ...valid, DEV_AUTH_USER_ID: userId }).variables).toEqual([
        "DEV_AUTH_ORG_ID",
      ]);
      expect(failure({ ...valid, ...dev, DEV_AUTH_ORG_ID: "not-a-uuid" }).variables).toEqual([
        "DEV_AUTH_ORG_ID",
      ]);
    });

    it("refuses to start with dev auth in production", () => {
      const error = failure({ ...valid, ...dev, NODE_ENV: "production" });
      expect(error.variables).toEqual(["DEV_AUTH_ORG_ID", "DEV_AUTH_USER_ID"]);
    });
  });
});

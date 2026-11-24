// Tests for app-auth.ts: the GitHub App JWT, the 1-hour installation token, and its cache.
// GitHub is faked with msw; the fake checks the JWT signature, so a wrong JWT fails here.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";
import { createInstallationTokenProvider } from "../../src/github/app-auth.js";
import { GithubError } from "../../src/github/errors.js";
import { FAKE_INSTALLATION_ID, FAKE_INSTALLATION_TOKEN } from "./fixtures.js";
import { APP_ID, makeKeys, server, tokenEndpoint } from "./msw.js";

const keys = makeKeys();
const MINUTE = 60_000;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function failure(promise: Promise<unknown>): Promise<GithubError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GithubError) return error;
    throw error;
  }
  throw new Error("expected a GithubError");
}

describe("createInstallationTokenProvider", () => {
  it("signs a short-lived RS256 App JWT and returns the installation token", async () => {
    const clock = { now: Date.UTC(2026, 10, 24, 12, 0, 0) };
    // Both key formats: GitHub hands out PKCS#1 ("RSA PRIVATE KEY"), many tools produce PKCS#8.
    for (const pem of [keys.pkcs1Pem, keys.pkcs8Pem]) {
      const endpoint = tokenEndpoint(
        keys,
        () => new Date(clock.now + 60 * MINUTE),
        () => clock.now,
      );
      server.use(endpoint.handler);
      const tokens = createInstallationTokenProvider({
        appId: APP_ID,
        privateKey: pem,
        now: () => clock.now,
      });
      expect(await tokens.getToken(FAKE_INSTALLATION_ID)).toBe(FAKE_INSTALLATION_TOKEN);
      const claims = endpoint.accepted[0];
      expect(claims?.iss).toBe(APP_ID);
      expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBeLessThanOrEqual(10 * 60);
      expect(claims?.exp).toBeGreaterThan(Math.floor(clock.now / 1000));
    }
  });

  it("reuses the cached token, then mints a new one close to expiry", async () => {
    const clock = { now: Date.UTC(2026, 10, 24, 12, 0, 0) };
    const endpoint = tokenEndpoint(
      keys,
      () => new Date(clock.now + 60 * MINUTE),
      () => clock.now,
    );
    server.use(endpoint.handler);
    const tokens = createInstallationTokenProvider({
      appId: APP_ID,
      privateKey: keys.pkcs1Pem,
      now: () => clock.now,
    });
    await tokens.getToken(FAKE_INSTALLATION_ID);
    clock.now += 30 * MINUTE;
    await tokens.getToken(FAKE_INSTALLATION_ID);
    expect(endpoint.requests()).toBe(1);
    clock.now += 28 * MINUTE; // 2 minutes left: inside the 5 minute safety margin
    await tokens.getToken(FAKE_INSTALLATION_ID);
    expect(endpoint.requests()).toBe(2);
  });

  it("makes one request for concurrent callers", async () => {
    const endpoint = tokenEndpoint(keys, () => new Date(Date.now() + 60 * MINUTE));
    server.use(endpoint.handler);
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs1Pem });
    await Promise.all([1, 2, 3].map(() => tokens.getToken(FAKE_INSTALLATION_ID)));
    expect(endpoint.requests()).toBe(1);
  });

  it("mints a new token after invalidate", async () => {
    const endpoint = tokenEndpoint(keys, () => new Date(Date.now() + 60 * MINUTE));
    server.use(endpoint.handler);
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs1Pem });
    await tokens.getToken(FAKE_INSTALLATION_ID);
    tokens.invalidate(FAKE_INSTALLATION_ID);
    await tokens.getToken(FAKE_INSTALLATION_ID);
    expect(endpoint.requests()).toBe(2);
  });

  it("keeps a separate token per installation", async () => {
    const endpoint = tokenEndpoint(keys, () => new Date(Date.now() + 60 * MINUTE));
    server.use(endpoint.handler);
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs1Pem });
    await tokens.getToken("1");
    await tokens.getToken("2");
    expect(endpoint.requests()).toBe(2);
  });

  it("maps GitHub failures to typed errors", async () => {
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs1Pem });
    const cases: Array<[number, string]> = [
      [401, "unauthorized"],
      [404, "not_found"],
      [403, "forbidden"],
      [500, "upstream"],
    ];
    for (const [status, kind] of cases) {
      server.use(
        http.post("https://api.github.com/app/installations/:id/access_tokens", () =>
          HttpResponse.json({ message: "SECRET-BODY-TEXT" }, { status }),
        ),
      );
      const error = await failure(tokens.getToken(FAKE_INSTALLATION_ID));
      expect(error.kind, String(status)).toBe(kind);
      expect(error.message).not.toContain("SECRET-BODY-TEXT");
    }
  });

  it("rejects a bad installation id without calling GitHub", async () => {
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs1Pem });
    for (const id of ["", "abc", "1/../2", "12 34"]) {
      expect((await failure(tokens.getToken(id))).kind, id).toBe("invalid_input");
    }
  });

  it("rejects a malformed GitHub reply and never leaks the key or JWT in errors", async () => {
    server.use(
      http.post("https://api.github.com/app/installations/:id/access_tokens", () =>
        HttpResponse.json({ unexpected: true }, { status: 201 }),
      ),
    );
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: keys.pkcs8Pem });
    const error = await failure(tokens.getToken(FAKE_INSTALLATION_ID));
    expect(error.kind).toBe("upstream");
    const body = keys.pkcs8Pem.split("\n")[1] ?? "";
    expect(`${error.message} ${error.stack}`).not.toContain(body);
  });

  it("fails clearly when the private key is not a usable key", async () => {
    const tokens = createInstallationTokenProvider({ appId: APP_ID, privateKey: "not a key" });
    const error = await failure(tokens.getToken(FAKE_INSTALLATION_ID));
    expect(error.kind).toBe("unauthorized");
    expect(error.message).not.toContain("not a key");
  });
});

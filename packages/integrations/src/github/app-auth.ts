// Turns the GitHub App's private key into 1-hour installation tokens: sign a short App JWT, trade it
// for a token, cache the token in memory. Tokens and keys are never logged or put in error messages.

import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";
import { GithubError } from "./errors.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  GITHUB_HEADERS,
  errorForStatus,
  readJson,
  send,
} from "./http.js";
import { installationTokenSchema } from "./schemas.js";

export interface InstallationTokenProvider {
  /** A valid installation token for `installationId`, minted on demand and cached until near expiry. */
  getToken(installationId: string): Promise<string>;
  /** Forget the cached token, e.g. after GitHub answered 401. */
  invalidate(installationId: string): void;
}

export interface InstallationTokenProviderOptions {
  appId: string;
  /** PEM private key. GitHub issues PKCS#1 ("RSA PRIVATE KEY"); PKCS#8 also works. */
  privateKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Clock in ms since the epoch. Tests replace it. */
  now?: () => number;
  /** Mint a new token when less than this is left. Default 5 minutes. */
  refreshMarginMs?: number;
}

// GitHub allows App JWTs of at most 10 minutes; iat starts 60s in the past for clock drift.
const JWT_BACKDATE_SECONDS = 60;
const JWT_LIFETIME_SECONDS = 9 * 60;

export function createInstallationTokenProvider(
  options: InstallationTokenProviderOptions,
): InstallationTokenProvider {
  const {
    appId,
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = Date.now,
    refreshMarginMs = 5 * 60_000,
  } = options;
  const cache = new Map<string, { token: string; expiresAtMs: number }>();
  const inflight = new Map<string, Promise<string>>();
  let key: KeyObject | undefined;

  function privateKey(): KeyObject {
    if (key !== undefined) return key;
    try {
      key = createPrivateKey(options.privateKey);
      return key;
    } catch {
      throw new GithubError("unauthorized", { detail: "private key is not usable" });
    }
  }

  async function appJwt(): Promise<string> {
    const nowSeconds = Math.floor(now() / 1000);
    try {
      return await new SignJWT({})
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(appId)
        .setIssuedAt(nowSeconds - JWT_BACKDATE_SECONDS)
        .setExpirationTime(nowSeconds + JWT_LIFETIME_SECONDS)
        .sign(privateKey());
    } catch (error) {
      if (error instanceof GithubError) throw error;
      throw new GithubError("unauthorized", { detail: "could not sign the App JWT" });
    }
  }

  async function mint(installationId: string): Promise<string> {
    const jwt = await appJwt();
    const response = await send(
      `${baseUrl}/app/installations/${installationId}/access_tokens`,
      { method: "POST", headers: { ...GITHUB_HEADERS, authorization: `Bearer ${jwt}` } },
      timeoutMs,
    );
    if (!response.ok) throw errorForStatus(response, now());
    const body = await readJson(response, installationTokenSchema);
    const expiresAtMs = Date.parse(body.expires_at);
    if (Number.isNaN(expiresAtMs)) {
      throw new GithubError("upstream", { detail: "bad token expiry" });
    }
    cache.set(installationId, { token: body.token, expiresAtMs });
    return body.token;
  }

  return {
    async getToken(installationId) {
      if (!/^\d+$/.test(installationId)) {
        throw new GithubError("invalid_input", { detail: "installation id must be numeric" });
      }
      const hit = cache.get(installationId);
      if (hit !== undefined && hit.expiresAtMs - refreshMarginMs > now()) return hit.token;
      const pending = inflight.get(installationId);
      if (pending !== undefined) return pending;
      const request = mint(installationId).finally(() => inflight.delete(installationId));
      inflight.set(installationId, request);
      return request;
    },
    invalidate(installationId) {
      cache.delete(installationId);
    },
  };
}

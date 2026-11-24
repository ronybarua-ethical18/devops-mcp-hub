// Shared test helpers: a fake GitHub server (msw), fresh RSA App keys, and a handler for the token endpoint.
// The handler checks the App JWT the adapter sends, so a wrongly signed JWT fails the test.

import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { http, HttpResponse, type HttpHandler } from "msw";
import { setupServer } from "msw/node";
import { jwtVerify } from "jose";
import { installationTokenBody } from "./fixtures.js";

export const server = setupServer();

export const APP_ID = "987654";

export interface TestKeys {
  publicKey: KeyObject;
  pkcs1Pem: string;
  pkcs8Pem: string;
}

/** A throwaway RSA key pair for one test file; no real key ever lives in the repo. */
export function makeKeys(): TestKeys {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKey,
    pkcs1Pem: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    pkcs8Pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export interface TokenEndpoint {
  handler: HttpHandler;
  /** JWT claims of every accepted token request. */
  accepted: Array<{ iss: string | undefined; iat: number | undefined; exp: number | undefined }>;
  requests: () => number;
}

/** POST /app/installations/{id}/access_tokens: 201 for a valid App JWT, 401 otherwise. */
export function tokenEndpoint(
  keys: TestKeys,
  expiresAt: () => Date,
  now: () => number = Date.now,
): TokenEndpoint {
  const accepted: TokenEndpoint["accepted"] = [];
  let count = 0;
  const handler = http.post(
    "https://api.github.com/app/installations/:id/access_tokens",
    async ({ request }) => {
      count += 1;
      const jwt = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      try {
        const { payload } = await jwtVerify(jwt, keys.publicKey, {
          issuer: APP_ID,
          algorithms: ["RS256"],
          currentDate: new Date(now()),
        });
        accepted.push({ iss: payload.iss, iat: payload.iat, exp: payload.exp });
      } catch {
        return HttpResponse.json({ message: "Bad credentials" }, { status: 401 });
      }
      return HttpResponse.json(installationTokenBody(expiresAt()), { status: 201 });
    },
  );
  return { handler, accepted, requests: () => count };
}

// Tests for envelope.ts: tokens decrypt back correctly, and any tampering is caught.
// Also proves error messages never contain the token or the key.

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  openSecret,
  parseMasterKey,
  sealSecret,
  type MasterKey,
  type SealedSecret,
} from "../src/crypto/envelope.js";

const master: MasterKey = { version: 1, key: randomBytes(32) };
const aad = "org-a:cred-1";

function expectFailure(fn: () => unknown, forbidden: string[]): void {
  let message = "";
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    for (const text of forbidden) expect(message).not.toContain(text);
    return;
  }
  throw new Error("expected the call to throw");
}

describe("sealSecret / openSecret", () => {
  it("round-trips short, empty and large unicode secrets", () => {
    for (const plaintext of ["ghp_abc", "", "héllo✓".repeat(2000)]) {
      expect(openSecret(sealSecret(plaintext, aad, master), aad, master)).toBe(plaintext);
    }
  });

  it("uses a fresh data key and IV for every seal", () => {
    const a = sealSecret("same", aad, master);
    const b = sealSecret("same", aad, master);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.wrappedDek.equals(b.wrappedDek)).toBe(false);
    expect(a.keyVersion).toBe(1);
  });

  it("rejects a flipped byte anywhere in ciphertext or wrappedDek", () => {
    const sealed = sealSecret("tok", aad, master);
    for (const field of ["ciphertext", "wrappedDek", "iv"] as const) {
      for (let i = 0; i < sealed[field].length; i++) {
        const copy: SealedSecret = { ...sealed, [field]: Buffer.from(sealed[field]) };
        copy[field][i] = (copy[field][i] ?? 0) ^ 0xff;
        expect(() => openSecret(copy, aad, master)).toThrow("decryption failed");
      }
    }
  });

  it("rejects a wrong master key, a keyVersion mismatch and a different aad", () => {
    const sealed = sealSecret("tok", aad, master);
    expect(() => openSecret(sealed, aad, { version: 1, key: randomBytes(32) })).toThrow(
      "decryption failed",
    );
    expect(() => openSecret(sealed, aad, { ...master, version: 2 })).toThrow("decryption failed");
    expect(() => openSecret(sealed, "org-b:cred-1", master)).toThrow("decryption failed");
  });

  it("never puts plaintext or key material in error messages", () => {
    const plaintext = "super-secret-plaintext-value";
    const sealed = sealSecret(plaintext, aad, master);
    const forbidden = [
      plaintext,
      master.key.toString("base64"),
      master.key.toString("hex"),
      sealed.ciphertext.toString("hex"),
    ];
    const tampered = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;
    expectFailure(() => openSecret(tampered, aad, master), forbidden);
    expectFailure(() => openSecret(sealed, aad, { version: 1, key: randomBytes(32) }), forbidden);
  });

  it("rejects a master key that is not 32 bytes", () => {
    expect(() => sealSecret("x", aad, { version: 1, key: randomBytes(16) })).toThrow();
  });
});

describe("parseMasterKey", () => {
  it("parses 32 base64 bytes and defaults the version to 1", () => {
    const key = randomBytes(32);
    const parsed = parseMasterKey(key.toString("base64"));
    expect(parsed.version).toBe(1);
    expect(parsed.key.equals(key)).toBe(true);
    expect(parseMasterKey(key.toString("base64"), 3).version).toBe(3);
  });

  it("throws on non-base64, 31 and 33 bytes without echoing the input", () => {
    const inputs = [
      "not base64 !!! secret-looking-value",
      randomBytes(31).toString("base64"),
      randomBytes(33).toString("base64"),
      "",
    ];
    for (const input of inputs) {
      expectFailure(() => parseMasterKey(input), input === "" ? [] : [input]);
    }
  });
});

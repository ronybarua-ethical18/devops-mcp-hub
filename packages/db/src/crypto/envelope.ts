// Encrypts and decrypts provider tokens with two layers of keys (envelope encryption).
// Each token gets its own key, which is itself locked with the master key from HUB_MASTER_KEY.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface MasterKey {
  readonly version: number;
  /** Exactly 32 bytes. */
  readonly key: Buffer;
}

export interface SealedSecret {
  /** Secret encrypted with the data key: ciphertext || 16-byte tag. */
  ciphertext: Buffer;
  /** 12-byte IV used for the data-key encryption. */
  iv: Buffer;
  /** Data key encrypted with the master key: wrapIv(12) || wrapped key(32) || tag(16). */
  wrappedDek: Buffer;
  keyVersion: number;
}

const DECRYPT_FAILED = "decryption failed";

function encrypt(key: Buffer, iv: Buffer, aad: string, data: Buffer): Buffer {
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  return Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
}

function decrypt(key: Buffer, iv: Buffer, aad: string, sealed: Buffer): Buffer {
  if (sealed.length < TAG_BYTES || iv.length !== IV_BYTES) throw new Error(DECRYPT_FAILED);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(0, sealed.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    // Fixed message: never include input or key bytes.
    throw new Error(DECRYPT_FAILED);
  }
}

function assertMasterKey(master: MasterKey): void {
  if (master.key.length !== KEY_BYTES) throw new Error("invalid master key");
}

/** Parse a base64 master key. Throws without echoing the input. */
export function parseMasterKey(base64: string, version = 1): MasterKey {
  const key = Buffer.from(base64, "base64");
  const canonical = key.toString("base64").replace(/=+$/, "");
  if (key.length !== KEY_BYTES || canonical !== base64.replace(/=+$/, "")) {
    throw new Error("master key must be 32 bytes, base64 encoded");
  }
  return { version, key };
}

/** Envelope-encrypt `plaintext`. `aad` binds the blob to its owner (`${orgId}:${credentialId}`). */
export function sealSecret(plaintext: string, aad: string, master: MasterKey): SealedSecret {
  assertMasterKey(master);
  const dek = randomBytes(KEY_BYTES);
  const iv = randomBytes(IV_BYTES);
  const wrapIv = randomBytes(IV_BYTES);
  const ciphertext = encrypt(dek, iv, aad, Buffer.from(plaintext, "utf8"));
  const wrappedDek = Buffer.concat([wrapIv, encrypt(master.key, wrapIv, aad, dek)]);
  return { ciphertext, iv, wrappedDek, keyVersion: master.version };
}

export function openSecret(sealed: SealedSecret, aad: string, master: MasterKey): string {
  assertMasterKey(master);
  if (sealed.keyVersion !== master.version) throw new Error(DECRYPT_FAILED);
  if (sealed.wrappedDek.length < IV_BYTES) throw new Error(DECRYPT_FAILED);
  const wrapIv = sealed.wrappedDek.subarray(0, IV_BYTES);
  const wrapped = sealed.wrappedDek.subarray(IV_BYTES);
  const dek = decrypt(master.key, wrapIv, aad, wrapped);
  return decrypt(dek, sealed.iv, aad, sealed.ciphertext).toString("utf8");
}

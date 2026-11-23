// Saves provider tokens encrypted, and decrypts them again when they are needed.
// Every lookup is limited to one org, so one org can never read another org's tokens.

import { randomUUID } from "node:crypto";
import { openSecret, sealSecret, type MasterKey } from "../crypto/envelope.js";
import type { TenantClient } from "../tenant/client.js";

export interface CredentialsRepo {
  /** Seal and store a provider token. Returns the new credential's id. */
  store(input: {
    integrationId: string;
    plaintext: string;
    expiresAt?: Date;
  }): Promise<{ id: string }>;
  /** Decrypt a credential. Null when the id is unknown or belongs to another org. */
  reveal(id: string): Promise<string | null>;
}

export function createCredentialsRepo(
  db: TenantClient,
  orgId: string,
  master: MasterKey,
): CredentialsRepo {
  const aadFor = (id: string): string => `${orgId}:${id}`;

  return {
    async store({ integrationId, plaintext, expiresAt }) {
      // The tenant client only returns this org's integrations: a foreign id is "not found",
      // which also stops a cascade delete in another org from removing this credential.
      const integration = await db.integration.findFirst({
        where: { id: integrationId },
        select: { id: true },
      });
      if (!integration) throw new Error("integration not found");
      // The id is generated first because it is part of the AAD that binds the blob to its row.
      const id = randomUUID();
      const sealed = sealSecret(plaintext, aadFor(id), master);
      await db.credential.create({
        data: {
          id,
          orgId,
          integrationId,
          ciphertext: new Uint8Array(sealed.ciphertext),
          iv: new Uint8Array(sealed.iv),
          wrappedDek: new Uint8Array(sealed.wrappedDek),
          keyVersion: sealed.keyVersion,
          ...(expiresAt ? { expiresAt } : {}),
        },
      });
      return { id };
    },

    async reveal(id) {
      const row = await db.credential.findFirst({ where: { id } });
      if (!row) return null;
      return openSecret(
        {
          ciphertext: Buffer.from(row.ciphertext),
          iv: Buffer.from(row.iv),
          wrappedDek: Buffer.from(row.wrappedDek),
          keyVersion: row.keyVersion,
        },
        aadFor(row.id),
        master,
      );
    },
  };
}

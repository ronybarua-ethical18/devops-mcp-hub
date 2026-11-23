<!-- Decision record: how provider tokens are encrypted before they are saved (envelope encryption, AES-256-GCM).
     Explains why each token gets its own key, and what happens if the master key leaks or is rotated. -->

# ADR 0002: Envelope-encrypt provider credentials with AES-256-GCM

- **Status:** Accepted
- **Date:** 2026-11-22
- **Issue:** #2 (Phase 2: Foundation)

## Context

The hub stores provider tokens (GitHub, Vercel, Sentry) and a read-only Postgres connection string for each org. These are the most valuable data in the system, and the hub's central promise is that they never reach the MCP client or the model.

The blueprint calls for envelope encryption with a per-credential key and a master key from an environment secret. A cloud KMS is a recorded upgrade path, not an MVP need.

## Decision

- Each credential is encrypted with its own random 32-byte data key (DEK) using AES-256-GCM (12-byte random IV, 16-byte tag).
- The DEK is encrypted ("wrapped") with the master key, also AES-256-GCM, and stored beside the ciphertext.
- The master key is 32 bytes, base64-encoded, in the `HUB_MASTER_KEY` environment variable. It is validated at boot and never logged.
- The `credentials` row stores `ciphertext`, `iv`, `wrapped_dek` and `key_version`.
- **AAD:** both encryptions bind `orgId:credentialId` as additional authenticated data. A blob copied to another credential or org fails to decrypt.
- Decryption failures throw a fixed `decryption failed` error, so no input or key bytes leak into logs.
- The crypto module lives in `packages/db`, next to the repository that uses it. `packages/core` will depend on `packages/db` later, so placing it in `core` would create a cycle.

## Consequences

- Rotation is cheap: re-wrap each DEK under the new master key and bump `key_version`; no secret is re-encrypted. Only one master key version is supported until a rotation is built.
- A leaked master key exposes every credential, so it stays out of the repository, the logs and the database.
- The audit trail records that a credential was used, never its value.
- Moving to a cloud KMS means replacing only the wrap and unwrap step; the `credentials` columns stay the same.

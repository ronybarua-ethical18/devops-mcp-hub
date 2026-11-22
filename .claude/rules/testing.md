---
paths:
  - "**/test/**"
  - "**/*.test.ts"
  - "tests/**"
---

# Testing

- Vitest (`vitest run`), tests in each package's `test/` folder; cross-cutting suites go in root `tests/` (protocol, authorization, security, e2e).
- Unit tests: `*.test.ts`. Tests that spawn a real server process over stdio/HTTP: `*.e2e.test.ts`.
- Assert on JSON-RPC wire shapes (ids, `error.code`, `result`), not only on return values. See `spikes/raw-jsonrpc/test/` for the pattern.
- Never hit real provider APIs in tests; use fixtures.
- Before claiming a change works: `pnpm typecheck && pnpm test` and paste the result.

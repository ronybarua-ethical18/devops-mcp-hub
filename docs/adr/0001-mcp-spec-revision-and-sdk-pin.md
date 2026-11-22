# ADR 0001: Target MCP spec 2026-07-28 and pin SDK v2.4.0

- **Status:** Accepted
- **Date:** 2026-11-22
- **Issue:** #1 (Phase 1: Protocol spike)

## Context

MCP spec revision 2026-07-28 made the protocol stateless:

- There is no `initialize` handshake and no `Mcp-Session-Id`.
- Every request carries its protocol version and client capabilities in `params._meta`.
- Clients discover a server with `server/discover`.

Most tutorials and many clients still describe the 2025 stateful flow.

The official TypeScript SDK v2 (`@modelcontextprotocol/server` and `@modelcontextprotocol/client`) went stable on 2026-07-27 and implements this revision. The Phase 1 spike proved the protocol by hand first (`spikes/raw-jsonrpc`), then on the SDK (`spikes/sdk-server`). A single SDK-client contract test runs against both.

While building the spike, three findings changed the plan:

- MCP Inspector 2.16.0 requires Node `^22.23.4`. The blueprint assumed 22.19.
- Inspector (`protocolEra`) and the SDK client (`versionNegotiation`) both **default to the legacy era**. Neither sends `server/discover` unless asked.
- In SDK v2, `server.connect(new StdioServerTransport())` serves legacy clients only. `serveStdio(factory)` is the entry point for 2026-07-28. `createMcpHandler` (HTTP) doesn't validate `Host` or `Origin`.

## Decision

- Target spec revision **2026-07-28 only**. Servers are built with `legacy: "reject"` (`serveStdio`, `createMcpHandler`), and legacy `initialize` gets a clear error naming the supported version.
- Pin `@modelcontextprotocol/server` and `@modelcontextprotocol/client` at exactly **2.4.0**, and `@modelcontextprotocol/hono` at **2.0.2**. Upgrades are deliberate and reviewed against the changelog.
- Zod **≥ 4.2**, imported as `zod/v4`. The SDK can't convert Zod 3 schemas, and 4.0–4.1 lose `.describe()` text.
- Node floor is **22.23.4** (`.nvmrc`, `engines`).
- Every client used in tests or verification pins the era: `--protocol-era modern` for Inspector, and `versionNegotiation: { mode: { pin: "2026-07-28" } }` for the SDK client.
- HTTP is served through `createMcpHonoApp` (Host/Origin checks), not a bare `createMcpHandler`.

## Consequences

- Older clients that only speak the 2025 flow can't connect. That's acceptable for a portfolio project built on the current spec, and it keeps the code free of dual-era branches.
- Pinned versions mean upgrades are manual. The contract test makes each upgrade safe to check.
- Stateless serving means any replica can serve any request. That's the basis for the two-replica demo in Phase 12.
- Revisit this ADR when a new spec revision ships or SDK 3.x appears.

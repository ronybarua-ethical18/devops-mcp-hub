# DevOps MCP Hub

An MCP gateway that lets AI agents investigate bad deployments across GitHub, Vercel, Sentry and PostgreSQL, with tenant isolation, human approval and a full audit trail.

> Status: skeleton only. Built milestone by milestone against the v2 blueprint (13 weeks, 4 gates).

## Why a hub, not four direct MCP servers

1. **Cross-provider workflows:** one evidence bundle joins a Vercel deployment, its build log, the Sentry errors first seen in that release, and the GitHub commit and PR behind it.
2. **One policy and approval layer:** per-project tool allowlists, risk tiers and approval gates across every provider.
3. **One audit trail:** a single trace ID links the human request, the MCP call, the approval and the provider action.
4. **Credential brokering:** provider tokens never reach the AI client or the model.

## Layout

```
apps/web/                  Next.js dashboard; the assistant is an MCP client
apps/server/               Fastify: REST API, /mcp endpoint, worker entry point
packages/core/             services, policy, proposals, audit, shared types
packages/integrations/     github/, vercel/, sentry/, postgres/ adapters
packages/mcp/              thin tool, resource and prompt handlers
packages/db/               Prisma schema, migrations, tenant-scoped repositories
spikes/raw-jsonrpc/        week 1: hand-written stdio server, no SDK
evals/                     scenario fixtures and runner
docs/adr/                  architecture decision records
docs/threat-model.md       MCP-specific threat table
tests/                     protocol, authorization, security, e2e
```

## Branching

Each roadmap phase ships on its own branch, named `<issue-number>-<issue-title-slug>` and created with `gh issue develop <n> --checkout`, so the branch is linked to its issue. Each PR closes its issue (`Closes #<n>`).

## Roadmap gates

- **A (week 1):** MCP Inspector lists and calls a tool on a hand-written, SDK-free server.
- **B (week 5):** Claude connects through OAuth and lists pull requests through the hub.
- **C (week 10):** one investigation ends in an approved GitHub issue, with a single trace in the audit log.
- **D (week 13):** public demo live, with README, video and the first two write-ups.

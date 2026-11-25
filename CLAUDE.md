# CLAUDE.md — DevOps MCP Hub

Project-wide instructions for Claude Code in this repository.

<!-- Keep only project-wide rules here. Use path-scoped rules (.claude/rules/), Skills, and Hooks for everything else. -->

## 1. General

1. Use pnpm (workspaces + Turborepo) on Node 22. Run one package with `pnpm --filter @hub/<pkg> <script>`.
2. Run `pnpm typecheck && pnpm test` before marking a task done.
3. Do not edit generated files (`dist/`, `.next/`, `.turbo/`, `next-env.d.ts`, `pnpm-lock.yaml` by hand).
4. Build milestone by milestone. Do only what the current issue asks; don't scaffold ahead. Why: the blueprint gates (A–D in `README.md`) decide scope.
5. One branch per roadmap issue: `<issue#>-<title-slug>` via `gh issue develop <n> --checkout`. PRs use `Closes #<n>`.
6. Do not commit or push. Leave changes uncommitted and suggest a commit message.

## 2. Code Style

7. TypeScript only, strict, ESM (`NodeNext`). Details in `.claude/rules/code-style.md`.
8. Before touching `apps/web`, read `apps/web/AGENTS.md`. Why: this Next.js version differs from training data.
9. Keep `packages/mcp` handlers thin; logic lives in `packages/core`; provider calls only in `packages/integrations`.

## 3. Database

10. All schema changes go through Prisma migrations in `packages/db`.
11. Every query goes through the tenant-scoped repositories in `packages/db`. Why: tenant isolation is a core guarantee of the hub.

## 4. Testing

12. Add Vitest tests for new logic. Details in `.claude/rules/testing.md`.
13. Mock or use fixtures for GitHub, Vercel, Sentry and Postgres in unit tests; never call real provider APIs.

## 5. Security

14. Never commit secrets (`.env*`, `*.pem`, `*.key`). Read or use `.env*` values only after asking the user each time, and never print a secret value.
15. Provider tokens never reach the MCP client or the model. Why: credential brokering is the hub's point; a leaked token defeats it.
16. Every write action needs a policy check, an approval gate, and an audit entry under one trace ID.

## 6. Misc

17. Write the phase plan in `docs/superpowers/` before implementing a phase.
18. Record architectural decisions as ADRs in `docs/adr/`; keep `docs/threat-model.md` current when adding a tool.

<!-- If a rule needs explanation, record the reason ("Why:") and the expected outcome. -->

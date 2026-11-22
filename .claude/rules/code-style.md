---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Code style

- Prettier decides formatting (`.prettierrc.json`: double quotes, semicolons, trailing commas, width 100). Run `pnpm format:check`, don't hand-format.
- TypeScript is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Handle `undefined` explicitly; no `any`, no non-null `!` to silence errors.
- ESM only: relative imports need the `.js` extension (`NodeNext`). Use `import type` for type-only imports (`verbatimModuleSyntax`).
- Cross-package imports go through the workspace name (`@hub/core`), never relative paths into another package.
- Layering: `packages/mcp` handlers stay thin and call `packages/core` services; provider calls live only in `packages/integrations`.

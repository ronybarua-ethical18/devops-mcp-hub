# DevOps MCP Hub: dashboard UI

React code for the 7 MVP screens of DevOps MCP Hub, matching the design mockups.
Built with Next.js (App Router), TypeScript and Tailwind CSS.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use Node 22.19 or newer; the MCP Inspector v2 you will use later needs it.

## Screens

| Route | File | What it shows |
| --- | --- | --- |
| `/` | `app/page.tsx` | Public landing page with the live trace, video slot and security points |
| `/overview` | `app/(app)/overview/page.tsx` | Latest deploy, new Sentry errors, connections, recent investigations |
| `/connections` | `app/(app)/connections/page.tsx` | Provider connections, the MCP link, AI clients with access |
| `/assistant` | `app/(app)/assistant/page.tsx` | Built-in chat: tool steps, answer, proposed issue, evidence |
| `/activity` | `app/(app)/activity/page.tsx` | Filterable tool-call log and the trace timeline |
| `/approvals` | `app/(app)/approvals/page.tsx` | Pending approvals with risk tiers, and history |
| `/tool-settings` | `app/(app)/tool-settings/page.tsx` | Per-tool on/off, approval rules and limits |

## Structure

```
app/
  layout.tsx            fonts (IBM Plex Sans and Mono) and global CSS
  globals.css           design tokens
  page.tsx              landing page
  (app)/layout.tsx      sidebar shell for the 6 app screens
  (app)/*/page.tsx      one folder per screen
components/             sidebar, badge, panel, buttons, trace timeline,
                        approval card, activity table, copy button, tool toggle
lib/
  types.ts              data shapes: the contract for your future API
  mock-data.ts          one demo story used on every screen
```

## Design rules

- Tokens live in `app/globals.css`, so `bg-accent`, `text-muted`, `bg-wait-bg` and so on match the mockups.
- Color means attention. Amber means waiting for a person; red means blocked or high risk. Normal states stay neutral.
- IBM Plex Mono is only for machine data: tool names, IDs, commits, logs and URLs.
- Provider text (logs, error messages, commit content) always shows an "Untrusted text" chip.

## What is real and what is mock

All data comes from `lib/mock-data.ts`. These parts already work in the browser:
approval buttons (local state only), tool toggles, activity filters and the copy-link button.

Next steps when the backend exists:

1. Replace `lib/mock-data.ts` with calls to your REST API, keeping the shapes in `lib/types.ts`.
2. Make the assistant a real MCP client of your own `/mcp` endpoint with `@modelcontextprotocol/client`.
3. Send approval decisions to the API. The server must re-check the payload hash before acting.
4. Keep Activity live by polling or with a server-sent events stream.
5. Add sign-in and protect the `(app)` routes.

## Versions

Dependencies are pinned to exact versions that were at least two weeks old when the project was created.
This lowers the risk of pulling a freshly published, compromised release. Update them on purpose, not automatically.

# Phase 1: Protocol Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove MCP on the wire: a hand-written, SDK-free stdio MCP server that MCP Inspector can list and call, then the same server rebuilt on the official TypeScript SDK v2 (stdio and `createMcpHandler` over HTTP).

**Architecture:** Two throwaway spike packages. `spikes/raw-jsonrpc` keeps all protocol logic in a pure `handleLine(line) → response | null` function, wrapped by a thin stdin/stdout loop. `spikes/sdk-server` exposes one `createServer()` factory served by `serveStdio` and by `createMcpHandler`. Both expose the same `divide` tool, so a single SDK-client contract test runs against both.

**Tech Stack:** TypeScript (ESM), Node ≥ 22.23.4, tsx, Vitest, `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/client@2.4.0` (test-only in the raw spike), `zod@^4.2`, `@hono/node-server`, `@modelcontextprotocol/inspector@2.16.0`.

**Spec:** Issue [#1](https://github.com/ronybarua-ethical18/devops-mcp-hub/issues/1). Blueprint `docs/reference/blueprint-v2.pdf` sections _MCP learning map_ and _Roadmap → Gate A_. MCP spec revision 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28 (changelog, basic, basic/transports/stdio, server/discover, server/tools).

**Branch:** `1-phase-1-protocol-spike-raw-json-rpc-stdio-server-then-sdk` (created with `gh issue develop 1`). Open the PR with `Closes #1`.

## Global Constraints

- Spec revision `2026-07-28` only. No `initialize`, no `ping`, no `notifications/initialized`, no `logging/setLevel`, no session IDs.
- Every request's `params._meta` MUST carry `io.modelcontextprotocol/protocolVersion` (string) and `io.modelcontextprotocol/clientCapabilities` (object). `io.modelcontextprotocol/clientInfo` is optional.
- Every result MUST include `"resultType": "complete"`. Results SHOULD include `_meta["io.modelcontextprotocol/serverInfo"] = { name, version }`.
- `server/discover` and `tools/list` results carry `ttlMs` (number) and `cacheScope`. Use `cacheScope: "private"` (blueprint rule for list results).
- Error codes: `-32700` parse error · `-32600` invalid request · `-32601` method not found · `-32602` invalid params (including unknown tool and a missing `_meta` field) · `-32603` internal error · `-32022` unsupported protocol version, with `data: { supported: string[], requested: string }`. Don't use anything in `-32000..-32019`.
- stdio: one JSON message per line, newline-delimited, with no embedded newlines. stdout carries MCP messages only, and all logs go to stderr. Exit when stdin reaches EOF. The server never sends requests.
- Tool names are snake_case. The raw server uses no SDK at runtime: the SDK client is a devDependency for tests only.
- SDK versions are pinned exactly: `2.4.0`, with no caret. Zod is imported as `zod/v4`, version `^4.2.0`.
- Inspector and SDK clients default to the legacy era. Always pass `--protocol-era modern` (Inspector) or `versionNegotiation: { mode: { pin: "2026-07-28" } }` (SDK client).

## Review Focus

1. **JSON-RPC batch (a JSON array on one line):** batching was removed from MCP, so expect a single `-32600` error with `id: null` and no crash. Tested in Task 2.
2. **Blank lines and `\r\n` line endings on stdin:** expect blank lines to be ignored silently and the `\r` trimmed, so Windows-style clients work. Tested in Task 2.
3. **`params` missing or not an object on a request that has an `id`:** expect `-32602`, not a thrown TypeError. Tested in Task 2.
4. **`tools/call` with wrong argument types (`b: "2"`) or missing arguments:** expect `isError: true` with a fix-it hint the model can act on, not a protocol error and not a crash. Tested in Task 3.
5. **The client closes stdin while the server is idle:** expect the process to exit with code 0 within 1 s, with no zombie left after an Inspector run. Tested in Task 4.

---

## File Structure

```
spikes/
├── raw-jsonrpc/
│   ├── package.json            @hub/spike-raw-jsonrpc (private, type: module)
│   ├── tsconfig.json
│   ├── src/protocol.ts         constants, error codes, JSON-RPC types, error/result builders
│   ├── src/tools.ts            divide tool: definition (inputSchema/outputSchema/annotations) + execute
│   ├── src/dispatch.ts         handleLine(): parse → validate envelope → route
│   ├── src/index.ts            stdio loop (readline on stdin, stdout writes, stderr logs, exit on EOF)
│   └── test/
│       ├── dispatch.test.ts    unit tests against handleLine
│       └── stdio.e2e.test.ts   spawns src/index.ts, raw line I/O + EOF exit
├── sdk-server/
│   ├── package.json            @hub/spike-sdk-server
│   ├── tsconfig.json
│   ├── src/server.ts           createServer(): McpServer with the same divide tool
│   ├── src/stdio.ts            serveStdio(createServer, { legacy: "reject" })
│   ├── src/http.ts             createMcpHandler(createServer, { legacy: "reject" }) on @hono/node-server
│   └── test/contract.test.ts   SDK client (pinned 2026-07-28) vs raw stdio, SDK stdio, SDK HTTP
docs/adr/0001-mcp-spec-revision-and-sdk-pin.md
docs/writeups/01-mcp-on-the-wire.md
```

---

### Task 0: Toolchain — Node floor and spike workspace

**Files:**

- Modify: `.nvmrc`, `package.json` (`engines.node`), `pnpm-workspace.yaml`, `README.md` (add a Branching section)
- Create: `spikes/raw-jsonrpc/package.json`, `spikes/raw-jsonrpc/tsconfig.json`

**Interfaces:**

- Produces: workspace package `@hub/spike-raw-jsonrpc` with scripts `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `start` (`tsx src/index.ts`).

- [ ] **Step 1:** Install Node 22.23.4 or newer locally (`nvm install 22.23.4` or equivalent). Run `node -v` and expect `v22.23.4` or higher.
- [ ] **Step 2:** Set `.nvmrc` to `22.23.4` and `engines.node` to `">=22.23.4"`. Reason, which goes in the commit body: Inspector 2.16.0 requires `^22.23.4`, and that supersedes the blueprint's 22.19.
- [ ] **Step 3:** Add `- spikes/*` to `pnpm-workspace.yaml` `packages`.
- [ ] **Step 4:** Create the `@hub/spike-raw-jsonrpc` package (`private`, `"type": "module"`). It has devDependencies only: `typescript`, `tsx`, `vitest`, `@types/node`, and `@modelcontextprotocol/client@2.4.0` for tests. Its `tsconfig.json` extends `../../tsconfig.base.json` with `types: ["node"]` and `include: ["src", "test"]`.
- [ ] **Step 5:** Add a short **Branching** section to `README.md`. Each phase ships on its own branch, named `<issue-number>-<issue-title-slug>` and created with `gh issue develop <n> --checkout`. Each PR closes its issue.
- [ ] **Step 6:** Run `pnpm install && pnpm typecheck`. Expect all tasks to succeed.
- [ ] **Step 7: Commit:** `chore(spike): add raw-jsonrpc spike package and bump Node floor to 22.23.4`

---

### Task 1: Protocol primitives

**Files:**

- Create: `spikes/raw-jsonrpc/src/protocol.ts`
- Test: `spikes/raw-jsonrpc/test/dispatch.test.ts` (the builders are exercised through `handleLine` in Task 2, so there's no separate test file)

**Interfaces:**

- Produces:
  - `PROTOCOL_VERSION = "2026-07-28"`
  - `SUPPORTED_VERSIONS: readonly string[] = ["2026-07-28"]`
  - `SERVER_INFO = { name: "raw-jsonrpc-spike", version: "0.0.1" }`
  - `META = { protocolVersion: "io.modelcontextprotocol/protocolVersion", clientCapabilities: "io.modelcontextprotocol/clientCapabilities", clientInfo: "io.modelcontextprotocol/clientInfo", serverInfo: "io.modelcontextprotocol/serverInfo" } as const`
  - `ErrorCode = { ParseError: -32700, InvalidRequest: -32600, MethodNotFound: -32601, InvalidParams: -32602, InternalError: -32603, UnsupportedProtocolVersion: -32022 } as const`
  - Types: `JsonRpcId = string | number`, `JsonRpcRequest { jsonrpc: "2.0"; id: JsonRpcId; method: string; params?: Record<string, unknown> }`, `JsonRpcNotification` (the same without `id`), `JsonRpcResponse` (success `{ jsonrpc, id, result }` or error `{ jsonrpc, id: JsonRpcId | null, error: { code, message, data? } }`)
  - `errorResponse(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse`
  - `resultResponse(id: JsonRpcId, result: Record<string, unknown>): JsonRpcResponse`. It always adds `resultType: "complete"` and `_meta[META.serverInfo] = SERVER_INFO`, merged with any `_meta` already in `result`.

- [ ] **Step 1:** Implement `protocol.ts` exactly as specified in the Interfaces block above.
- [ ] **Step 2:** Run `pnpm --filter @hub/spike-raw-jsonrpc typecheck` and expect it to pass.
- [ ] **Step 3: Commit:** `feat(spike): add MCP 2026-07-28 protocol constants and response builders`

---

### Task 2: Dispatcher — envelope validation, discovery and routing

**Files:**

- Create: `spikes/raw-jsonrpc/src/dispatch.ts`
- Test: `spikes/raw-jsonrpc/test/dispatch.test.ts`

**Interfaces:**

- Consumes: everything from Task 1. From Task 3 it uses `listTools(): ToolDefinition[]` and `callTool(name, args): ToolCallResult | undefined`. Until Task 3 exists, stub them in `tools.ts` as `[]` and `undefined`.
- Produces: `handleLine(line: string): JsonRpcResponse | null`. It returns `null` for notifications and blank lines.

Test helper, used by every test: `req(method, params = {}, id = 1)` builds a request string with valid `_meta` (protocolVersion `2026-07-28` and clientCapabilities `{}`), merged under `params._meta`.

- [ ] **Step 1: Write the failing tests** (Vitest, `describe("handleLine")`):
  - `"returns -32700 with id null for malformed JSON"`: `handleLine("{oops")` → `error.code === -32700` and `id === null`
  - `"returns -32600 for a batch array"`: `handleLine("[" + req("tools/list") + "]")` → `-32600` and `id === null`
  - `"returns -32600 when jsonrpc is not '2.0'"`
  - `"ignores blank lines"`: `handleLine("")` and `handleLine("   ")` → `null`
  - `"trims trailing \\r"`: `handleLine(req("server/discover") + "\r")` → has `result`
  - `"returns null for notifications"`: `{"jsonrpc":"2.0","method":"notifications/cancelled","params":{...}}` → `null`
  - `"returns -32602 when params is missing on a request"`
  - `"returns -32602 when _meta protocolVersion is missing"`, and the same for clientCapabilities
  - `"returns -32022 for an unsupported version"`: version `"1900-01-01"` → `error.data` deep-equals `{ supported: ["2026-07-28"], requested: "1900-01-01" }`
  - `"rejects initialize with -32601 naming supported versions"`: `error.message` contains `"2026-07-28"`
  - `"rejects ping with -32601"`
  - `"returns -32601 for unknown methods"`
  - `"server/discover returns capabilities and cache hints"`: `result` matches `{ resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: {} }, cacheScope: "private" }`, `typeof result.ttlMs === "number"`, and `result._meta["io.modelcontextprotocol/serverInfo"].name === "raw-jsonrpc-spike"`
  - `"echoes string and number ids unchanged"`
- [ ] **Step 2:** Run `pnpm --filter @hub/spike-raw-jsonrpc test` and expect it to fail because `handleLine` isn't defined.
- [ ] **Step 3:** Implement `handleLine`. The order of checks matters:
  1. Trim. If the line is empty, return `null`.
  2. Parse. On failure return `-32700`.
  3. If it's an array, or not an object, or `jsonrpc !== "2.0"`, or `method` isn't a string, return `-32600`.
  4. If there's no `id`, it's a notification: return `null`.
  5. If `params` isn't an object, return `-32602`.
  6. If `method === "initialize"` or `method === "ping"`, return `-32601`. This check runs before the `_meta` check so that legacy clients get a clear message.
  7. If `_meta` fields are missing or the wrong type, return `-32602`.
  8. If the version isn't supported, return `-32022`.
  9. Route `server/discover`, `tools/list` and `tools/call`. Anything else gets `-32601`.

  Use `ttlMs: 3_600_000` for discover. Wrap routing in try/catch and map any throw to `-32603`, logging the error to stderr.

- [ ] **Step 4:** Run the tests and expect them all to pass.
- [ ] **Step 5: Commit:** `feat(spike): hand-written JSON-RPC dispatcher with server/discover`

---

### Task 3: The `divide` tool — tool errors vs protocol errors

**Files:**

- Create: `spikes/raw-jsonrpc/src/tools.ts`, replacing the Task 2 stub
- Modify: `spikes/raw-jsonrpc/src/dispatch.ts` (wire up `tools/list` and `tools/call`)
- Test: `spikes/raw-jsonrpc/test/dispatch.test.ts` (new `describe("tools")` block)

**Interfaces:**

- Produces:
  - `ToolDefinition { name; title?; description; inputSchema; outputSchema?; annotations? }`
  - `ToolCallResult { content: { type: "text"; text: string }[]; structuredContent?: unknown; isError: boolean }`
  - `listTools(): ToolDefinition[]`
  - `callTool(name: string, args: unknown): ToolCallResult | undefined`. It returns `undefined` when the tool is unknown.
- The tool definition, fixed because the contract test in Task 6 depends on it:
  - `name: "divide"`, `title: "Divide two numbers"`
  - `inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false }`
  - `outputSchema: { type: "object", properties: { quotient: { type: "number" } }, required: ["quotient"] }`
  - `annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }`
- Fixed hint copy:
  - b = 0: `"Cannot divide by zero. Call divide again with a non-zero b."`
  - Bad arguments: `"Invalid arguments: a and b must both be numbers, e.g. {\"a\": 6, \"b\": 3}."`

- [ ] **Step 1: Write the failing tests:**
  - `"tools/list returns divide with cache hints"`: `result.tools[0].name === "divide"`, `result.cacheScope === "private"`, `typeof result.ttlMs === "number"`, and `resultType === "complete"`
  - `"divide returns structuredContent and a JSON text block"`: `{a:6,b:3}` → `structuredContent` deep-equals `{ quotient: 2 }`, `JSON.parse(content[0].text)` deep-equals `{ quotient: 2 }`, and `isError === false`
  - `"divide by zero is a tool error, not a protocol error"`: the response has `result` (no `error`), `result.isError === true`, and `content[0].text` contains `"non-zero b"`
  - `"wrong argument types are a tool error with a hint"`: `{a:6,b:"2"}` and `{a:6}` → `isError === true` and the text contains `"must both be numbers"`
  - `"unknown tool is protocol error -32602"`: `name: "nope"` → `error.code === -32602`
  - `"tools/call without a string name is -32602"`
- [ ] **Step 2:** Run the tests and expect the new ones to fail.
- [ ] **Step 3:** Implement `tools.ts` and wire it into `dispatch.ts`. Use `ttlMs: 300_000` for `tools/list`. Validate arguments by hand, with a `typeof` check and `Number.isFinite`. The raw spike has no Zod.
- [ ] **Step 4:** Run the tests and expect them all to pass.
- [ ] **Step 5: Commit:** `feat(spike): divide tool showing isError vs JSON-RPC errors`

---

### Task 4: stdio loop and Gate A verification with Inspector

**Files:**

- Create: `spikes/raw-jsonrpc/src/index.ts`, `spikes/raw-jsonrpc/test/stdio.e2e.test.ts`
- Modify: `spikes/raw-jsonrpc/package.json` (add an `inspect` script)

**Interfaces:**

- Consumes: `handleLine` from Task 2.
- Produces: a runnable server, `tsx spikes/raw-jsonrpc/src/index.ts`.

- [ ] **Step 1: Write the failing e2e tests.** Spawn `node --import tsx src/index.ts` with `child_process.spawn` and use stdio pipes.
  - `"answers server/discover over stdio"`: write one request line, read one stdout line, and check `JSON.parse(line).result.resultType === "complete"`.
  - `"writes nothing but JSON-RPC to stdout"`: send discover, then malformed JSON, then a notification. Expect exactly 2 stdout lines, each of which parses as JSON.
  - `"exits 0 within 1s when stdin closes"`: call `child.stdin.end()`, then await `exit` with code `0` and a 1000 ms timeout.
- [ ] **Step 2:** Run the tests and expect them to fail because `index.ts` is missing.
- [ ] **Step 3:** Implement `index.ts`:
  - Use `readline.createInterface({ input: process.stdin })`.
  - For each line, write `JSON.stringify(response) + "\n"` to stdout when the response isn't null.
  - On `close`, call `process.exit(0)`.
  - Write one stderr line at startup: `raw-jsonrpc-spike ready (2026-07-28)`.
- [ ] **Step 4:** Run the tests and expect them all to pass.
- [ ] **Step 5:** Add a script to `package.json`: `"inspect": "npx --yes @modelcontextprotocol/inspector@2.16.0 --cli node --import tsx src/index.ts --protocol-era modern --method tools/list --format json"`. If the v2 CLI `--` and flag ordering rejects this, follow the `docs/v1-to-v2-migration.md` ordering in the Inspector repo, and write down the working form in the write-up.
- [ ] **Step 6: Verify Gate A part 1.** Run `pnpm --filter @hub/spike-raw-jsonrpc inspect` and expect JSON listing `divide`.
- [ ] **Step 7: Verify Gate A part 2.** Run the same CLI with `--method tools/call --tool-name divide --tool-arg a=6 --tool-arg b=3` and expect `quotient: 2` in the output.
- [ ] **Step 8: Verify by eye in the Inspector UI** with `--protocol-era modern`. Take a screenshot of the tool list and a call, save it to `docs/writeups/assets/gate-a-inspector.png`, and check that no stray process is left afterwards.
- [ ] **Step 9: Commit:** `feat(spike): stdio transport for raw server; passes Gate A in Inspector`

---

### Task 5: SDK v2 rebuild — stdio and `createMcpHandler`

**Files:**

- Create: `spikes/sdk-server/{package.json,tsconfig.json}`, `src/server.ts`, `src/stdio.ts`, `src/http.ts`

**Interfaces:**

- Produces:
  - `createServer(): McpServer`, with `name: "sdk-spike"` and `version: "0.0.1"`.
  - Scripts: `start:stdio` (`tsx src/stdio.ts`), `start:http` (`tsx src/http.ts`, serving `POST /mcp` on `PORT`, default `4100`), `test` and `typecheck`.
- Dependencies, pinned exactly: `@modelcontextprotocol/server@2.4.0` and `zod@^4.2.0`. Also `@hono/node-server`.
- devDependencies: `@modelcontextprotocol/client@2.4.0`, `vitest`, `tsx`, `typescript` and `@types/node`.

- [ ] **Step 1:** Implement `createServer()`.
  - Call `server.registerTool("divide", { title, description, inputSchema: z.object({ a: z.number(), b: z.number() }), outputSchema: z.object({ quotient: z.number() }), annotations }, handler)`.
  - Use the same title, annotations and hint copy as Task 3.
  - Divide-by-zero returns `isError: true` with the hint, and doesn't throw.
- [ ] **Step 2:** In `stdio.ts`, call `void serveStdio(createServer, { legacy: "reject" })`. Import it from `@modelcontextprotocol/server/stdio`. Don't use `server.connect(new StdioServerTransport())`, because that entry point is legacy-era only.
- [ ] **Step 3:** In `http.ts`, create `const handler = createMcpHandler(createServer, { legacy: "reject" })` and serve `handler.fetch` with `@hono/node-server` `serve({ fetch, port })`. Route only `/mcp`; any other path returns 404. Add a comment that `createMcpHandler` doesn't validate Host or Origin, and that the Phase 3 middleware will.
- [ ] **Step 4:** Run `pnpm --filter @hub/spike-sdk-server typecheck` and expect it to pass.
- [ ] **Step 5:** Run the Inspector CLI `tools/list` (with `--protocol-era modern`) against `tsx src/stdio.ts`. Expect `divide` with an `outputSchema` that the SDK generated from Zod.
- [ ] **Step 6: Commit:** `feat(spike): rebuild divide server on MCP SDK v2 (stdio + createMcpHandler)`

---

### Task 6: Contract test — one client, three servers

**Files:**

- Create: `spikes/sdk-server/test/contract.test.ts`

**Interfaces:**

- Consumes: the raw server (`spikes/raw-jsonrpc/src/index.ts`) and the SDK stdio and HTTP entry points.

- [ ] **Step 1: Write the test.** Use `describe.each` over three targets: `raw-stdio`, `sdk-stdio` and `sdk-http`.
  - HTTP target: start `src/http.ts` on an ephemeral port in `beforeAll` and kill it in `afterAll`.
  - Client: `new Client({ name: "contract", version: "0.0.1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } })` with the matching stdio or Streamable HTTP client transport. Take the exact transport import paths from the SDK v2 client docs.
  - Assertions for every target:
    - `listTools()` includes `divide` with `annotations.readOnlyHint === true`
    - `callTool({ name: "divide", arguments: { a: 6, b: 3 } })` → `structuredContent` deep-equals `{ quotient: 2 }`
    - `{ a: 1, b: 0 }` → `isError === true` and the text contains `"non-zero b"`
    - an unknown tool rejects with an error whose `code === -32602`
- [ ] **Step 2:** Run `pnpm --filter @hub/spike-sdk-server test` and expect every target to pass. If `raw-stdio` fails where the SDK passes, the raw server is out of spec: fix the raw server, not the test.
- [ ] **Step 3: Commit:** `test(spike): SDK-client contract test across raw and SDK servers`

---

### Task 7: ADR and write-up #1

**Files:**

- Create: `docs/adr/0001-mcp-spec-revision-and-sdk-pin.md`, `docs/writeups/01-mcp-on-the-wire.md`

- [ ] **Step 1: Write the ADR** with Context / Decision / Consequences sections. It covers:
  - Target spec 2026-07-28, stateless.
  - Pin `@modelcontextprotocol/server` and `client` at exactly `2.4.0`, and Zod at 4.2 or newer.
  - Serve with `legacy: "reject"`, modern only.
  - Raise the Node floor to 22.23.4 because of Inspector.
  - Clients must pin the era explicitly, because Inspector and the SDK client default to legacy.
- [ ] **Step 2: Draft the write-up for Rony to rewrite in their own voice.** Sections:
  - one request's life on stdio, with real request and response lines captured from the spike
  - `server/discover` vs the old `initialize`
  - `_meta` on every request, and why that makes any replica able to serve any request
  - tool errors vs protocol errors, using the `divide` examples
  - gotchas: Inspector's legacy default, the `serveStdio` vs `StdioServerTransport` split, `resultType`, `ttlMs` and `cacheScope`
  - the Gate A screenshot
- [ ] **Step 3:** Run `pnpm format:check && pnpm typecheck && pnpm test`. Expect everything to pass, and add a root `test` script (`turbo run test`) if one is missing.
- [ ] **Step 4: Commit:** `docs: ADR 0001 spec revision and SDK pin; write-up #1 draft`
- [ ] **Step 5:** Push the branch and open a PR titled `Phase 1: Protocol spike` with `Closes #1` in the body. Then tick the matching checklist items on issue #1.

---

## Done when (Gate A)

- [ ] The Inspector CLI and UI, both in `--protocol-era modern`, list and call `divide` on the hand-written, SDK-free server.
- [ ] The contract test passes against the raw server, the SDK stdio server and the SDK HTTP server.
- [ ] The ADR and the write-up draft are committed, and the PR closes #1.

# MCP on the wire, without an SDK

> **Draft for Rony to rewrite in their own words.** Every message below was captured from `spikes/raw-jsonrpc`.

Before I let a library hide the Model Context Protocol from me, I wrote a server by hand: about 290 lines of TypeScript and no SDK. Then I rebuilt it on the official SDK and pointed one test client at both. Here's what I learned about MCP spec revision **2026-07-28**.

## One request's life on stdio

A host such as Claude, Cursor or MCP Inspector starts the server as a child process. Messages are **one JSON-RPC object per line**: the host writes to the server's stdin, and the server answers on stdout. Logs go to stderr, because one stray `console.log` would corrupt the channel.

The host's first call is discovery:

```json
→ {"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
← {"jsonrpc":"2.0","id":1,"result":{"supportedVersions":["2026-07-28"],"capabilities":{"tools":{}},"instructions":"…","ttlMs":3600000,"cacheScope":"private","resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"raw-jsonrpc-spike","version":"0.0.1"}}}}
```

## `server/discover` vs the old `initialize`

In 2025, a connection started with an `initialize` handshake. The server remembered what the client said for the rest of the session. In 2026-07-28 that handshake is gone. My server rejects it and points to the replacement:

```json
← {"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method 'initialize' was removed. This server supports protocol versions: 2026-07-28 (use server/discover).","data":{"supported":["2026-07-28"]}}}
```

`server/discover` is a plain request. It says which versions and capabilities the server supports, and how long the client may cache that answer (`ttlMs`, `cacheScope`).

## `_meta` on every request: why any replica can serve any request

Every request carries the protocol version and client capabilities in `params._meta`. The server checks them each time:

- A field is missing: `-32602`.
- The version is unsupported: `-32022`, with the supported list.

The server keeps **no memory between requests**, so two requests from the same client can land on two different machines. For the hub, that means no sticky sessions and no session store. That's why the deployment plan can run two replicas behind a plain round-robin load balancer.

## Tool errors vs protocol errors

The spike's one tool is `divide`. Its three outcomes show the most useful distinction in MCP:

```json
← {"id":2,"result":{"content":[{"type":"text","text":"{\"quotient\":2}"}],"structuredContent":{"quotient":2},"isError":false, …}}
← {"id":3,"result":{"content":[{"type":"text","text":"Cannot divide by zero. Call divide again with a non-zero b."}],"isError":true, …}}
← {"id":4,"error":{"code":-32602,"message":"Unknown tool: nope"}}
```

- **Success:** returns `structuredContent` that matches the tool's `outputSchema`, plus the same data as text for hosts that ignore structure.
- **A tool error** (`isError: true`) is still a _result_. The model reads it, and the hint tells it how to fix the call. Divide-by-zero, overflow, wrong argument types and extra argument keys go here.
- **A protocol error** (`error`) means the request itself was wrong, such as an unknown tool, a bad envelope or an unsupported version. The client gets an exception, not something the model can recover from.

## Gotchas that 2025 tutorials won't warn you about

- **Inspector defaults to the old protocol.** Inspector 2.16.0 sends `initialize` unless you pass `--protocol-era modern`. It also needs Node 22.23.4 or newer.
- **The SDK client defaults to the old protocol too.** Pin it: `versionNegotiation: { mode: { pin: "2026-07-28" } }`.
- **There are two stdio entry points in SDK v2.** `serveStdio(factory)` speaks 2026-07-28. The familiar `server.connect(new StdioServerTransport())` speaks only the legacy protocol.
- **Every result needs `resultType: "complete"`.** Removing it from my hand-written server broke 6 of the 7 contract tests against it (only the unknown-tool error still passed), while the SDK servers kept passing.
- **List results carry cache hints** (`ttlMs`, `cacheScope`). `ping` is gone.

## Proof

- MCP Inspector (`--protocol-era modern`) lists and calls `divide` on the hand-written server. _(Screenshot: `assets/gate-a-inspector.png`, still to be added.)_
- One SDK client, pinned to 2026-07-28, passes the same 7 contract checks against the hand-written server, the SDK stdio server and the SDK HTTP server.

Code: `spikes/raw-jsonrpc` (by hand) and `spikes/sdk-server` (SDK v2).

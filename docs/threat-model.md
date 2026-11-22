# Threat model

Placeholder. The MCP-specific threat table (blueprint v2, "MCP-specific threat model") is written here in week 2; one test per row is added by week 12.

## Tools

| Tool     | Where                                                          | Reads / writes                         | Secrets touched | Notes                                                                                                                        |
| -------- | -------------------------------------------------------------- | -------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `divide` | `spikes/raw-jsonrpc`, `spikes/sdk-server` (Phase 1 spike only) | Read-only, no side effects, no network | None            | Throwaway protocol spike; not shipped in the hub. Invalid input, divide-by-zero and overflow return tool errors (`isError`). |

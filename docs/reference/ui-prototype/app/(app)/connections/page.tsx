import { Button } from "@/components/buttons";
import { CopyButton } from "@/components/copy-button";
import { CheckIcon } from "@/components/icons";
import { PageHeader, Panel } from "@/components/panel";
import { connectedClients, connections, mcpLink, project } from "@/lib/mock-data";

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Connections"
        description="Connect your tools once. The hub keeps the keys, and the AI never sees them."
      />

      <section className="rounded-[10px] border border-line bg-surface px-5 pt-2 pb-1">
        <h2 className="mt-3 mb-2 text-[17px] font-semibold">Your tools</h2>
        <ul>
          {connections.map((c) => (
            <li key={c.provider} className="flex flex-wrap items-start gap-4 border-t border-line-soft py-[18px]">
              <div className="flex flex-[1_1_160px] flex-col gap-1">
                <span className="text-base font-semibold">{c.provider}</span>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
                  <CheckIcon />
                  {c.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="flex min-w-0 flex-[3_1_320px] flex-col gap-1 text-sm">
                <span>{c.summary}</span>
                <span className="text-muted">
                  {c.detail}
                  {c.scopes && <span className="ml-1 font-mono text-[13px]">{c.scopes}</span>}
                </span>
                <span className="text-muted">{c.lastTest}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button>Test connection</Button>
                <Button>Manage</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Panel>
        <div>
          <h2 className="text-[17px] font-semibold">Connect your AI client</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Paste this link into any MCP client. You sign in once, and the client can only reach {project.name}.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mcp-link" className="text-sm font-medium">
            Your MCP link
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="mcp-link"
              type="text"
              readOnly
              value={mcpLink}
              className="min-h-11 min-w-0 flex-[1_1_280px] rounded-lg border border-control bg-rail px-3 font-mono text-sm"
            />
            <CopyButton text={mcpLink} />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <div className="flex flex-col gap-1.5 rounded-lg border border-line-soft p-4">
            <h3 className="text-[15px] font-semibold">Claude Desktop</h3>
            <p className="text-sm text-ink-soft">
              Open Settings, then Connectors, then Add custom connector. Paste the link and sign in.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line-soft p-4">
            <h3 className="text-[15px] font-semibold">Claude Code</h3>
            <p className="text-sm text-ink-soft">Run this in your terminal:</p>
            <pre className="rounded-md bg-code px-3 py-2.5 font-mono text-[12.5px] break-all whitespace-pre-wrap text-code-text">
              claude mcp add --transport http devops-hub {mcpLink}
            </pre>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-line-soft p-4">
            <h3 className="text-[15px] font-semibold">Cursor and other clients</h3>
            <p className="text-sm text-ink-soft">Add the link as a remote MCP server, then sign in when the client asks.</p>
          </div>
        </div>
      </Panel>

      <Panel title="AI clients with access">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="border-b border-line px-3 py-2.5 text-left font-medium text-muted">Client</th>
                <th scope="col" className="border-b border-line px-3 py-2.5 text-left font-medium text-muted">Last used</th>
                <th scope="col" className="border-b border-line px-3 py-2.5 text-left font-medium text-muted">Can reach</th>
                <th scope="col" className="border-b border-line px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {connectedClients.map((c) => (
                <tr key={c.name} className="border-b border-line-soft last:border-b-0">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-muted">{c.lastUsed}</td>
                  <td className="px-3 py-2">{c.scope}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghostDanger">Revoke</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

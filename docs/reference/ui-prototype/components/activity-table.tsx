"use client";

import { useMemo, useState } from "react";
import type { ToolCall } from "@/lib/types";
import { Badge } from "./badge";

const selectClass =
  "min-h-11 rounded-lg border border-control bg-surface px-2.5 text-sm text-ink";

export function ActivityTable({ calls, selectedTraceId }: { calls: ToolCall[]; selectedTraceId: string }) {
  const [client, setClient] = useState("all");
  const [provider, setProvider] = useState("all");
  const [result, setResult] = useState("all");
  const [query, setQuery] = useState("");

  const clients = useMemo(() => [...new Set(calls.map((c) => c.client))], [calls]);
  const providers = useMemo(() => [...new Set(calls.map((c) => c.provider))], [calls]);

  const visible = calls.filter((c) => {
    if (client !== "all" && c.client !== client) return false;
    if (provider !== "all" && c.provider !== provider) return false;
    if (result !== "all" && c.tone !== result) return false;
    const q = query.trim().toLowerCase();
    if (q && ![c.traceId, c.tool, c.target].some((v) => v.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-client" className="text-[13px] text-ink-soft">Client</label>
          <select id="f-client" value={client} onChange={(e) => setClient(e.target.value)} className={selectClass}>
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-provider" className="text-[13px] text-ink-soft">Provider</label>
          <select id="f-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={selectClass}>
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-result" className="text-[13px] text-ink-soft">Result</label>
          <select id="f-result" value={result} onChange={(e) => setResult(e.target.value)} className={selectClass}>
            <option value="all">All results</option>
            <option value="neutral">Done</option>
            <option value="waiting">Waiting for approval</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor="f-search" className="text-[13px] text-ink-soft">Search</label>
          <input
            id="f-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Trace ID, tool or target"
            className={`${selectClass} px-3`}
          />
        </div>
      </div>

      <section aria-label="Tool calls" className="rounded-[10px] border border-line bg-surface px-2 pt-2 pb-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr>
                {["Time", "Client", "Tool", "Target", "Result", "Trace"].map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-3 py-2.5 text-left font-medium text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr
                  key={`${c.time}-${c.tool}`}
                  className={`border-b border-line-soft last:border-b-0 ${c.traceId === selectedTraceId ? "bg-accent-tint" : ""}`}
                >
                  <td className="px-3 py-3 whitespace-nowrap text-muted">{c.time}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{c.client}</td>
                  <td className="px-3 py-3 font-mono text-[13px]">{c.tool}</td>
                  <td className="px-3 py-3">{c.target}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {c.tone === "neutral" ? c.result : <Badge tone={c.tone}>{c.result}</Badge>}
                  </td>
                  <td className="px-3 py-3 font-mono text-[13px]">{c.traceId}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">
                    No tool calls match these filters. Clear a filter to see more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

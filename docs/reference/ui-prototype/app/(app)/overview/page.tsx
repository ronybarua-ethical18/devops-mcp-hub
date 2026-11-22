import Link from "next/link";
import { Badge } from "@/components/badge";
import { ButtonLink } from "@/components/buttons";
import { PageHeader, Panel } from "@/components/panel";
import {
  connections,
  investigations,
  latestDeploy,
  pendingApprovals,
  project,
  sentrySummary,
} from "@/lib/mock-data";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description={`${project.name}, ${project.environment.toLowerCase()}`}
        action={<ButtonLink href="/assistant">Ask the assistant</ButtonLink>}
      />

      {pendingApprovals.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-wait-border bg-wait-bg px-[18px] py-3.5"
        >
          <p className="text-wait-ink">
            <strong>{pendingApprovals.length} actions are waiting for your approval.</strong> One is a GitHub issue
            about the new production errors.
          </p>
          <Link
            href="/approvals"
            className="inline-flex min-h-11 items-center rounded-lg border border-wait bg-surface px-4 font-medium text-wait no-underline hover:text-wait"
          >
            Review approvals
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold">Latest deploy</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-medium">{latestDeploy.id}</span>
            <Badge>{latestDeploy.status}</Badge>
          </div>
          <p className="text-sm text-ink-soft">
            Commit <span className="font-mono">{latestDeploy.commitSha}</span>, &quot;{latestDeploy.commitMessage}&quot;.
            Went live {latestDeploy.liveSince}.
          </p>
          <Link href="/assistant" className="mt-auto self-start py-2.5 text-sm font-medium">
            Investigate this deploy
          </Link>
        </section>

        <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold">Errors since this deploy</h2>
          <p className="flex items-baseline gap-2">
            <span className="text-[34px] leading-none font-semibold text-block">{sentrySummary.newIssues}</span>
            <span>new issues in Sentry</span>
          </p>
          <p className="text-sm text-ink-soft">
            {sentrySummary.events} events, all first seen in release {sentrySummary.release}. Top issue:{" "}
            {sentrySummary.topIssue}.
          </p>
          {/* TODO: link to the real Sentry issue list for this release */}
          <a href="#" className="mt-auto self-start py-2.5 text-sm font-medium">
            Open in Sentry
          </a>
        </section>

        <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold">Connections</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {connections.map((c) => (
              <li key={c.provider} className="flex justify-between gap-2">
                <span>{c.provider}</span>
                <span className={c.connected ? "text-muted" : "font-medium text-block"}>
                  {c.connected ? "Connected" : "Needs attention"}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/connections" className="mt-auto self-start py-2.5 text-sm font-medium">
            Manage connections
          </Link>
        </section>
      </div>

      <Panel
        title="Recent investigations"
        action={
          <Link href="/activity" className="py-2.5 text-sm font-medium">
            View all activity
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                {["Question", "Asked from", "Status", "When"].map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-3 py-2.5 text-left font-medium text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {investigations.map((inv) => (
                <tr key={inv.traceId} className="border-b border-line-soft last:border-b-0">
                  <td className="px-3 py-3.5">
                    <Link href="/activity" className="font-medium text-ink hover:text-accent">
                      {inv.question}
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">{inv.client}</td>
                  <td className="px-3 py-3.5">
                    {inv.status === "waiting" ? (
                      <Badge tone="waiting">Waiting for approval</Badge>
                    ) : (
                      <Badge>Done</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-muted">{inv.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

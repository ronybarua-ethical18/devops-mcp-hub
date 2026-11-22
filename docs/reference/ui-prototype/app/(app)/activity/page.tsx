import { ActivityTable } from "@/components/activity-table";
import { ButtonLink } from "@/components/buttons";
import { PageHeader } from "@/components/panel";
import { TraceTimeline } from "@/components/trace-timeline";
import { selectedTrace, toolCalls } from "@/lib/mock-data";

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every tool call from every AI client, as it happens."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            Live
          </span>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[3_1_720px]">
          <ActivityTable calls={toolCalls} selectedTraceId={selectedTrace.id} />
        </div>

        <aside
          aria-label="Trace detail"
          className="flex min-w-0 flex-[2_1_340px] flex-col gap-4 rounded-[10px] border border-line bg-surface p-5"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[17px] font-semibold">
              Trace <span className="font-mono font-medium">{selectedTrace.id}</span>
            </h2>
            <p className="text-[15px]">&quot;{selectedTrace.question}&quot;</p>
            <p className="text-[13px] text-muted">
              Asked by {selectedTrace.askedBy} from {selectedTrace.client} at {selectedTrace.askedAt}
            </p>
          </div>
          <TraceTimeline steps={selectedTrace.steps} />
          <ButtonLink href="/approvals" className="self-start">
            Review this approval
          </ButtonLink>
        </aside>
      </div>
    </>
  );
}

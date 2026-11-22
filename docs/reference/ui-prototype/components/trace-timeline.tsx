import type { TraceStep } from "@/lib/types";

/**
 * The signature element: one investigation drawn as a line of steps.
 * "story" = landing page (big question text), "log" = Activity screen (compact).
 */
export function TraceTimeline({
  steps,
  variant = "log",
}: {
  steps: TraceStep[];
  variant?: "story" | "log";
}) {
  const story = variant === "story";

  return (
    <ol className={`flex flex-col ${story ? "gap-[18px]" : "gap-4"}`}>
      {steps.map((step, i) => (
        <li key={`${step.label}-${step.detail}`} className="relative flex items-start gap-3.5">
          {/* Connector from this dot down to the next one (gap + the next dot's top margin) */}
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute top-[18px] left-[6px] w-0.5 bg-accent ${story ? "-bottom-[22px]" : "-bottom-5"}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`mt-1 size-3.5 flex-none rounded-full border-2 ${
              step.waiting ? "border-wait bg-wait-bg" : "border-accent bg-surface"
            }`}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            {step.waiting ? (
              <span className="mb-1 self-start rounded-full bg-wait-bg px-2.5 py-0.5 text-[13px] font-medium text-wait">
                {step.label}
              </span>
            ) : step.isTool ? (
              <span className={`font-mono font-medium ${story ? "text-sm" : "text-[13px]"}`}>
                {step.label}
              </span>
            ) : (
              <span className={story ? "text-[13px] text-muted" : "text-sm font-medium"}>
                {step.label}
              </span>
            )}
            <span
              className={
                story
                  ? `text-[15px] ${step.isTool ? "text-ink-soft" : "text-ink"}`
                  : "text-[13px] text-muted"
              }
            >
              {step.detail}
            </span>
            {step.flag && (
              <span className="mt-1.5 rounded-md bg-wait-bg px-2.5 py-2 text-[13px] text-wait-ink">
                {step.flag}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

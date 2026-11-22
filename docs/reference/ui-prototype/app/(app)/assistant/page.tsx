import Link from "next/link";
import { Badge, UntrustedChip } from "@/components/badge";
import { Button } from "@/components/buttons";
import { assistant, project } from "@/lib/mock-data";

/** Renders code; lines starting with "-" or "+" get diff colors (plus the sign, so color is not the only cue). */
function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-code p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-code-text">
      {code.split("\n").map((line, i) => (
        <span
          key={i}
          className={`block ${line.startsWith("-") ? "text-diff-del" : line.startsWith("+") ? "text-diff-add" : ""}`}
        >
          {line}
        </span>
      ))}
    </pre>
  );
}

export default function AssistantPage() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label="Conversation" className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Assistant</h1>
          <p className="mt-1 text-muted">
            Ask about {project.name}. The assistant uses the same tools as Claude, through the hub.
          </p>
        </div>

        <p className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-ink px-4 py-3 text-white">
          {assistant.question}
        </p>

        <details open className="rounded-[10px] border border-line bg-surface px-4 py-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
            Checked {assistant.toolSteps.length} sources through the hub
          </summary>
          <ol className="mb-3 flex flex-col text-sm">
            {assistant.toolSteps.map((step) => (
              <li key={step.tool} className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line-soft py-2">
                <span className="flex-[0_0_210px] font-mono text-[13px] font-medium">{step.tool}</span>
                <span className="flex-[1_1_200px] text-ink-soft">{step.result}</span>
                <span className="text-[13px] text-muted">{step.duration}</span>
              </li>
            ))}
          </ol>
        </details>

        <div className="flex max-w-[62ch] flex-col gap-3">
          {assistant.answer.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{assistant.proposal.title}</h2>
            <Badge>{assistant.proposal.riskLabel}</Badge>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-line-soft px-3.5 py-3">
            <span className="font-semibold">{assistant.proposal.issueTitle}</span>
            <span className="text-sm text-ink-soft">{assistant.proposal.issueSummary}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Approve and create issue</Button>
            <Button>Edit text</Button>
            <Button variant="danger">Reject</Button>
          </div>
          <p className="text-[13px] text-muted">Your approval covers this exact text and expires in 15 minutes.</p>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-line pt-2">
          <div className="flex flex-wrap gap-2 pt-2">
            {assistant.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="min-h-11 rounded-full border border-control bg-surface px-3.5 text-sm hover:bg-rail"
              >
                {s}
              </button>
            ))}
          </div>
          <label htmlFor="ask" className="text-sm font-medium">
            Ask about {project.name}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="ask"
              rows={2}
              placeholder="For example: which commit added the most new errors this week?"
              className="min-w-0 flex-1 resize-y rounded-lg border border-control bg-surface p-3 text-[15px]"
            />
            <button
              type="button"
              className="min-h-12 rounded-lg bg-accent px-5 text-[15px] font-medium text-white hover:bg-accent-hover"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      <aside
        aria-label="Evidence"
        className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px] rounded-[10px] border border-line bg-surface p-5"
      >
        <div>
          <h2 className="text-[17px] font-semibold">Evidence</h2>
          <p className="mt-1 text-[13px] text-muted">
            What the answer is based on. Text that comes from a provider is marked untrusted.
          </p>
        </div>

        {assistant.evidence.map((item) => (
          <div key={item.title} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              {item.untrusted && <UntrustedChip />}
            </div>
            {item.code && <CodeBlock code={item.code} />}
            {item.note && <p className={item.code ? "text-[13px] text-muted" : "text-sm text-ink-soft"}>{item.note}</p>}
          </div>
        ))}

        <Link href="/activity" className="self-start py-2.5 text-sm font-medium">
          Open the full trace tr_5c19e2
        </Link>
      </aside>
    </div>
  );
}

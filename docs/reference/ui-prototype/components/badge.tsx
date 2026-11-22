import type { ReactNode } from "react";
import type { Tone } from "@/lib/types";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-fog text-ink-soft",
  waiting: "bg-wait-bg text-wait",
  blocked: "bg-block-bg text-block",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

/** Outline chip for provider text the AI must not trust. */
export function UntrustedChip() {
  return (
    <span className="rounded-full border border-control px-2 py-px text-xs text-ink-soft">
      Untrusted text
    </span>
  );
}

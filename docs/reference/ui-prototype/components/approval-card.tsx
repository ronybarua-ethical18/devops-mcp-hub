"use client";

import Link from "next/link";
import { useState } from "react";
import type { PendingApproval } from "@/lib/types";
import { Badge } from "./badge";
import { Button } from "./buttons";
import { CheckIcon } from "./icons";

type Decision = "pending" | "approved" | "rejected" | "signin";

export function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const [decision, setDecision] = useState<Decision>("pending");
  const high = approval.risk === "high";

  return (
    <article className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">{approval.action}</h3>
          <p className="text-sm text-muted">
            Requested by {approval.requestedBy} for {approval.requestedFor} at {approval.requestedAt}.
            Expires at {approval.expiresAt}.{" "}
            <Link href="/activity">See trace {approval.traceId}</Link>
          </p>
        </div>
        <Badge tone={high ? "blocked" : "neutral"}>{approval.riskLabel}</Badge>
      </div>

      {approval.warning && (
        <p className="rounded-lg bg-block-bg px-3.5 py-3 text-sm text-block-ink">{approval.warning}</p>
      )}

      <div className="flex flex-col gap-2">
        {!high && (
          <span className="text-[13px] font-medium text-ink-soft">Exact text that will be sent to GitHub</span>
        )}
        <div className="overflow-hidden rounded-lg border border-line-soft">
          <div className="border-b border-line-soft bg-rail px-3.5 py-3 font-semibold">{approval.issueTitle}</div>
          <pre className="p-3.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{approval.issueBody}</pre>
        </div>
      </div>

      {approval.checks && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {approval.checks.map((check) => (
            <li key={check} className="flex items-center gap-1.5">
              <CheckIcon size={16} />
              {check}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3.5">
        <p className="max-w-[52ch] text-[13px] text-muted">
          {high ? (
            "High-risk actions need a fresh sign-in and can only be approved here, not inside an AI client."
          ) : (
            <>
              Fingerprint <span className="font-mono">{approval.fingerprint}</span>. If the text changes,
              this approval is cancelled.
            </>
          )}
        </p>

        {decision === "pending" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setDecision("rejected")}>
              Reject
            </Button>
            <Button variant="primary" onClick={() => setDecision(high ? "signin" : "approved")}>
              {high ? "Sign in again to approve" : "Approve and create issue"}
            </Button>
          </div>
        ) : (
          <p role="status" className="text-sm font-medium">
            {decision === "approved" && "Approved. The hub is creating the issue."}
            {decision === "rejected" && "Rejected. Nothing was sent to GitHub."}
            {decision === "signin" && "Opening sign-in. You approve right after you sign in."}
          </p>
        )}
      </div>
    </article>
  );
}

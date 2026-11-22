import { ApprovalCard } from "@/components/approval-card";
import { PageHeader, Panel } from "@/components/panel";
import { approvalHistory, pendingApprovals } from "@/lib/mock-data";

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="The AI can only prepare a change. A person approves it here before it happens."
      />

      <h2 className="text-[17px] font-semibold">Waiting for you ({pendingApprovals.length})</h2>
      {pendingApprovals.length === 0 ? (
        <p className="text-muted">Nothing is waiting. New requests from your AI clients will appear here.</p>
      ) : (
        pendingApprovals.map((a) => <ApprovalCard key={a.id} approval={a} />)
      )}

      <Panel title="History">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr>
                {["Action", "Requested by", "Decision", "Where", "When"].map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-3 py-2.5 text-left font-medium text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approvalHistory.map((r) => (
                <tr key={r.action} className="border-b border-line-soft last:border-b-0">
                  <td className="px-3 py-3">{r.action}</td>
                  <td className="px-3 py-3">{r.requestedBy}</td>
                  <td className={`px-3 py-3 ${r.decisionTone === "blocked" ? "font-medium text-block" : ""}`}>
                    {r.decision}
                  </td>
                  <td className="px-3 py-3">{r.where}</td>
                  <td className="px-3 py-3 text-muted">{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

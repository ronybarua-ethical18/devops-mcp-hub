import { Button } from "@/components/buttons";
import { PageHeader, Panel } from "@/components/panel";
import { ToolToggle } from "@/components/tool-toggle";
import { limits, project, toolGroups } from "@/lib/mock-data";

export default function ToolSettingsPage() {
  return (
    <>
      <PageHeader
        title="Tool settings"
        description={`Choose what the AI may do in ${project.name}. Changes apply to every connected AI client right away.`}
      />

      <section className="rounded-[10px] border border-line bg-surface px-2 pt-2 pb-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="border-b border-line p-3 text-left font-medium text-muted">Tool</th>
                <th scope="col" className="border-b border-line p-3 text-left font-medium text-muted">What it does</th>
                <th scope="col" className="border-b border-line p-3 text-left font-medium text-muted">Approval</th>
                <th scope="col" className="border-b border-line p-3 text-center font-medium text-muted">On</th>
              </tr>
            </thead>
            {toolGroups.map((group) => (
              <tbody key={group.provider}>
                <tr>
                  <th scope="rowgroup" colSpan={4} className="px-3 pt-4 pb-1.5 text-left text-sm font-semibold">
                    {group.provider}
                  </th>
                </tr>
                {group.tools.map((tool) => (
                  <tr key={tool.name} className="border-b border-line-soft">
                    <td className="px-3 py-1.5 font-mono text-[13px]">{tool.name}</td>
                    <td className="px-3 py-1.5">{tool.description}</td>
                    <td className={`px-3 py-1.5 ${tool.approvalRequired ? "" : "text-muted"}`}>
                      {tool.approvalRequired && <span className="font-medium text-wait">Always. </span>}
                      {tool.approval}
                    </td>
                    <td className="px-3 text-center">
                      <ToolToggle name={tool.name} defaultEnabled={tool.enabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <Panel title="Limits">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {limits.map((limit) => (
            <div key={limit.id} className="flex flex-col gap-1.5">
              <label htmlFor={`limit-${limit.id}`} className="text-sm font-medium">
                {limit.label}
              </label>
              <input
                id={`limit-${limit.id}`}
                type={limit.type}
                defaultValue={limit.value}
                className="min-h-11 rounded-lg border border-control bg-surface px-3 text-[15px]"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="primary">Save changes</Button>
        </div>
      </Panel>

      <section className="flex flex-col gap-1.5 rounded-[10px] border border-dashed border-control px-5 py-[18px]">
        <h2 className="text-base font-semibold">Never available</h2>
        <p className="max-w-[70ch] text-sm text-ink-soft">
          Some actions have no tool at all, so no AI client can ask for them: deleting anything, writing to the
          database, and deploying to production.
        </p>
      </section>
    </>
  );
}

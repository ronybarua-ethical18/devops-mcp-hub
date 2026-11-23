-- DropForeignKey
ALTER TABLE "project_connections" DROP CONSTRAINT "project_connections_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_connections" DROP CONSTRAINT "project_connections_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "tool_policies" DROP CONSTRAINT "tool_policies_project_id_fkey";

-- DropForeignKey
ALTER TABLE "approvals" DROP CONSTRAINT "approvals_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_steps" DROP CONSTRAINT "workflow_steps_run_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_id_key" ON "projects"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_org_id_id_key" ON "integrations"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_org_id_id_key" ON "proposals"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_runs_org_id_id_key" ON "workflow_runs"("org_id", "id");

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_org_id_project_id_fkey" FOREIGN KEY ("org_id", "project_id") REFERENCES "projects"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_org_id_integration_id_fkey" FOREIGN KEY ("org_id", "integration_id") REFERENCES "integrations"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_org_id_integration_id_fkey" FOREIGN KEY ("org_id", "integration_id") REFERENCES "integrations"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_policies" ADD CONSTRAINT "tool_policies_org_id_project_id_fkey" FOREIGN KEY ("org_id", "project_id") REFERENCES "projects"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_proposal_id_fkey" FOREIGN KEY ("org_id", "proposal_id") REFERENCES "proposals"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_org_id_run_id_fkey" FOREIGN KEY ("org_id", "run_id") REFERENCES "workflow_runs"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

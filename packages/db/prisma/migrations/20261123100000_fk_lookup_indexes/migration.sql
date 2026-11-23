-- Adds indexes so looking up or deleting by these link columns doesn't scan a whole org.
-- Indexes only: no data or constraint changes.

-- CreateIndex
CREATE INDEX "project_connections_org_id_integration_id_idx" ON "project_connections"("org_id", "integration_id");

-- CreateIndex
CREATE INDEX "credentials_org_id_integration_id_idx" ON "credentials"("org_id", "integration_id");

-- CreateIndex
CREATE INDEX "tool_calls_user_id_idx" ON "tool_calls"("user_id");

-- CreateIndex
CREATE INDEX "tool_calls_mcp_client_id_idx" ON "tool_calls"("mcp_client_id");

-- CreateIndex
CREATE INDEX "approvals_org_id_proposal_id_idx" ON "approvals"("org_id", "proposal_id");


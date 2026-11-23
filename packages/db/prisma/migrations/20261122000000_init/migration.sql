-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('github', 'vercel', 'sentry', 'postgres');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'revoked', 'error');

-- CreateEnum
CREATE TYPE "PolicyEffect" AS ENUM ('allow', 'deny', 'require_approval');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('read', 'low_write', 'high_write');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('ok', 'error', 'denied');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'committed');

-- CreateEnum
CREATE TYPE "ApprovalChannel" AS ENUM ('dashboard', 'elicitation');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approve', 'reject');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_clients" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'active',
    "external_account_id" TEXT,
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_connections" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "wrapped_dek" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3),
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_policies" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "effect" "PolicyEffect" NOT NULL,
    "risk_tier" "RiskTier" NOT NULL,
    "constraints" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_calls" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID,
    "mcp_client_id" UUID,
    "tool_name" TEXT NOT NULL,
    "args_hash" TEXT NOT NULL,
    "status" "ToolCallStatus" NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "result_bytes" INTEGER NOT NULL,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',
    "requested_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "approver_id" TEXT NOT NULL,
    "channel" "ApprovalChannel" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'pending',
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_clients_client_id_key" ON "mcp_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_key" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_org_id_idx" ON "memberships"("org_id");

-- CreateIndex
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_slug_key" ON "projects"("org_id", "slug");

-- CreateIndex
CREATE INDEX "integrations_org_id_idx" ON "integrations"("org_id");

-- CreateIndex
CREATE INDEX "project_connections_org_id_idx" ON "project_connections"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_connections_project_id_integration_id_external_ref_key" ON "project_connections"("project_id", "integration_id", "external_ref");

-- CreateIndex
CREATE INDEX "credentials_org_id_idx" ON "credentials"("org_id");

-- CreateIndex
CREATE INDEX "tool_policies_org_id_idx" ON "tool_policies"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "tool_policies_project_id_tool_name_key" ON "tool_policies"("project_id", "tool_name");

-- CreateIndex
CREATE INDEX "tool_calls_org_id_created_at_idx" ON "tool_calls"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_calls_trace_id_idx" ON "tool_calls"("trace_id");

-- CreateIndex
CREATE INDEX "proposals_org_id_idx" ON "proposals"("org_id");

-- CreateIndex
CREATE INDEX "approvals_org_id_idx" ON "approvals"("org_id");

-- CreateIndex
CREATE INDEX "workflow_runs_org_id_idx" ON "workflow_runs"("org_id");

-- CreateIndex
CREATE INDEX "workflow_steps_org_id_idx" ON "workflow_steps"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_run_id_idempotency_key_key" ON "workflow_steps"("run_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_events_org_id_created_at_idx" ON "audit_events"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_trace_id_idx" ON "audit_events"("trace_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_policies" ADD CONSTRAINT "tool_policies_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_policies" ADD CONSTRAINT "tool_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_mcp_client_id_fkey" FOREIGN KEY ("mcp_client_id") REFERENCES "mcp_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


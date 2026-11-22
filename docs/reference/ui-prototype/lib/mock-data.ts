/**
 * Mock data for the demo story used on every screen:
 * deploy dpl_7Hq2 (commit a1b2c3d) went live, then /api/orders started failing
 * because the commit renamed DATABASE_URL to POSTGRES_URL.
 *
 * Replace these exports with API calls (REST for the dashboard, MCP for the assistant)
 * when the backend exists. Keep the shapes in lib/types.ts as the contract.
 */
import type {
  ApprovalRecord,
  AssistantToolStep,
  ConnectedClient,
  Connection,
  EvidenceItem,
  Investigation,
  Limit,
  PendingApproval,
  ToolCall,
  ToolGroup,
  TraceStep,
} from "./types";

export const project = { name: "my-shop", environment: "Production" };
export const currentUser = { name: "Rony", initials: "R" };
export const mcpLink = "https://hub.example.dev/mcp";

export const latestDeploy = {
  id: "dpl_7Hq2",
  status: "Live",
  commitSha: "a1b2c3d",
  commitMessage: "Update config",
  liveSince: "12 minutes ago",
};

export const sentrySummary = {
  newIssues: 3,
  events: 40,
  release: "a1b2c3d",
  topIssue: "PrismaClientInitializationError in /api/orders",
};

export const connections: Connection[] = [
  {
    provider: "GitHub",
    connected: true,
    summary: "GitHub App on acme, with access to 3 repositories: my-shop, my-shop-api, docs",
    detail: "Code and pull requests: read. Issues: read and write.",
    lastTest: "Last test 2 minutes ago: working",
  },
  {
    provider: "Vercel",
    connected: true,
    summary: "Team acme, project my-shop",
    detail: "Access token, stored encrypted, added 3 days ago",
    lastTest: "Last test 2 minutes ago: working",
  },
  {
    provider: "Sentry",
    connected: true,
    summary: "Organization acme, project my-shop-web, US region",
    detail: "Read-only scopes:",
    scopes: "org:read, project:read, event:read, project:releases",
    lastTest: "Last test 2 minutes ago: working",
  },
  {
    provider: "PostgreSQL",
    connected: true,
    summary: "Neon database my_shop, signed in as the read-only role hub_reader",
    detail: "Schemas public and analytics. Up to 500 rows, 5-second timeout.",
    lastTest: "Last test 2 minutes ago: working",
  },
];

export const connectedClients: ConnectedClient[] = [
  { name: "Claude Desktop", lastUsed: "2 minutes ago", scope: "my-shop" },
  { name: "Claude Code", lastUsed: "Yesterday", scope: "my-shop" },
  { name: "Cursor", lastUsed: "3 days ago", scope: "my-shop" },
  { name: "MCP Inspector", lastUsed: "3 days ago", scope: "my-shop" },
];

export const investigations: Investigation[] = [
  {
    question: "Why is production throwing errors since the last deploy?",
    client: "Claude Desktop",
    status: "waiting",
    when: "12 min ago",
    traceId: "tr_5c19e2",
  },
  {
    question: "Did release 9e4f2a1 add any new errors?",
    client: "Dashboard assistant",
    status: "done",
    when: "Yesterday",
    traceId: "tr_2b7c41",
  },
  {
    question: "Which pull requests were merged this week?",
    client: "Claude Code",
    status: "done",
    when: "2 days ago",
    traceId: "tr_9d0e13",
  },
  {
    question: "What columns does the orders table have?",
    client: "Cursor",
    status: "done",
    when: "3 days ago",
    traceId: "tr_48aa70",
  },
  {
    question: "Why did the build for 4c7d9e0 fail?",
    client: "Claude Desktop",
    status: "done",
    when: "Last week",
    traceId: "tr_c3f2d9",
  },
];

export const toolCalls: ToolCall[] = [
  { time: "10:42:12", client: "Claude Desktop", tool: "github_prepare_issue", provider: "GitHub", target: "acme/my-shop", result: "Waiting for approval", tone: "waiting", traceId: "tr_5c19e2" },
  { time: "10:42:08", client: "Claude Desktop", tool: "github_get_commit", provider: "GitHub", target: "acme/my-shop at a1b2c3d", result: "Done, 488 ms", tone: "neutral", traceId: "tr_5c19e2" },
  { time: "10:42:07", client: "Claude Desktop", tool: "sentry_get_issue", provider: "Sentry", target: "MY-SHOP-WEB-3F", result: "Done, 540 ms, 1 flag", tone: "neutral", traceId: "tr_5c19e2" },
  { time: "10:42:06", client: "Claude Desktop", tool: "sentry_list_issues", provider: "Sentry", target: "my-shop-web", result: "Done, 610 ms", tone: "neutral", traceId: "tr_5c19e2" },
  { time: "10:42:05", client: "Claude Desktop", tool: "vercel_list_deployments", provider: "Vercel", target: "my-shop", result: "Done, 412 ms", tone: "neutral", traceId: "tr_5c19e2" },
  { time: "10:31:40", client: "Claude Code", tool: "postgres_read_query", provider: "PostgreSQL", target: "my_shop", result: "Blocked: pg_sleep not allowed", tone: "blocked", traceId: "tr_91ab04" },
  { time: "10:12:03", client: "MCP Inspector", tool: "hub_whoami", provider: "Hub", target: "my-shop", result: "Done, 35 ms", tone: "neutral", traceId: "tr_77d310" },
  { time: "09:58:11", client: "Dashboard assistant", tool: "github_list_pull_requests", provider: "GitHub", target: "acme/my-shop", result: "Done, 702 ms", tone: "neutral", traceId: "tr_3e0b88" },
];

export const selectedTrace = {
  id: "tr_5c19e2",
  question: "Why is production throwing errors since the last deploy?",
  askedBy: "Rony",
  client: "Claude Desktop" as const,
  askedAt: "10:42",
  steps: [
    { label: "Request checked", isTool: false, detail: "10:42:04. Valid token, project my-shop, read tools allowed." },
    { label: "vercel_list_deployments", isTool: true, detail: "10:42:05. Found dpl_7Hq2, live from a1b2c3d." },
    { label: "sentry_list_issues", isTool: true, detail: "10:42:06. 3 new issues in release a1b2c3d." },
    {
      label: "sentry_get_issue",
      isTool: true,
      detail: "10:42:07. Emails and IP addresses removed.",
      flag: "Flagged: one event message contained text written like an instruction to the AI. It was marked untrusted and could not trigger any action.",
    },
    { label: "github_get_commit", isTool: true, detail: "10:42:08. Changed prisma/schema.prisma." },
    { label: "github_prepare_issue", isTool: true, detail: "10:42:12. Draft saved for approval. Secret scan found nothing." },
    { label: "Waiting for approval", isTool: false, detail: "Expires at 10:57 if nobody approves it.", waiting: true },
  ] satisfies TraceStep[],
};

export const landingTrace: TraceStep[] = [
  { label: "Claude Desktop asked", isTool: false, detail: "Why is production throwing errors since the last deploy?" },
  { label: "Policy check passed", isTool: false, detail: "Project my-shop, read tools allowed" },
  { label: "vercel_list_deployments", isTool: true, detail: "Deploy dpl_7Hq2 went live 12 minutes ago from commit a1b2c3d" },
  { label: "sentry_list_issues", isTool: true, detail: "3 new issues and 40 events since release a1b2c3d" },
  { label: "github_get_commit", isTool: true, detail: "Commit a1b2c3d renamed DATABASE_URL to POSTGRES_URL" },
  { label: "Waiting for your approval", isTool: false, detail: "Create a GitHub issue in acme/my-shop", waiting: true },
];

const issueBody = `Since deploy dpl_7Hq2 went live at 10:30, /api/orders fails with
PrismaClientInitializationError (3 new Sentry issues, 40 events).

Cause: commit a1b2c3d renamed DATABASE_URL to POSTGRES_URL in
prisma/schema.prisma. Production does not define POSTGRES_URL.

Fix: add POSTGRES_URL to the Production environment in Vercel,
or revert the rename.

Opened by DevOps MCP Hub, trace tr_5c19e2.`;

export const pendingApprovals: PendingApproval[] = [
  {
    id: "p_2041",
    action: "Create a GitHub issue in acme/my-shop",
    risk: "low",
    riskLabel: "Low risk: private repository",
    requestedBy: "Claude Desktop",
    requestedFor: "Rony",
    requestedAt: "10:42",
    expiresAt: "10:57",
    traceId: "tr_5c19e2",
    issueTitle: "Production errors: POSTGRES_URL not set after a1b2c3d",
    issueBody,
    checks: ["Secret scan found nothing", "No database results in the text", "Repository is private"],
    fingerprint: "sha256:3f9a…c21e",
  },
  {
    id: "p_2040",
    action: "Create a GitHub issue in acme/docs",
    risk: "high",
    riskLabel: "High risk: public repository",
    requestedBy: "Claude Code",
    requestedFor: "Rony",
    requestedAt: "10:38",
    expiresAt: "10:53",
    traceId: "tr_a4d2f7",
    issueTitle: "Docs: add a troubleshooting entry for POSTGRES_URL",
    issueBody: `The setup guide still mentions DATABASE_URL. Add a short note that
the app now reads POSTGRES_URL, and how to set it in Vercel.`,
    warning: "acme/docs is public, so anyone can read this issue. Check it for private data before you approve.",
  },
];

export const approvalHistory: ApprovalRecord[] = [
  { action: 'Issue in acme/my-shop: "Flaky checkout test"', requestedBy: "Claude Code", decision: "Approved by Rony", decisionTone: "neutral", where: "Dashboard", when: "Yesterday" },
  { action: 'Issue in acme/my-shop: "Slow orders query"', requestedBy: "Dashboard assistant", decision: "Approved by Rony", decisionTone: "neutral", where: "Inside Claude Desktop", when: "2 days ago" },
  { action: 'Issue in acme/docs: "Update the API key in README"', requestedBy: "Cursor", decision: "Rejected by Rony: the text contained a secret", decisionTone: "blocked", where: "Dashboard", when: "3 days ago" },
  { action: 'Issue in acme/my-shop: "Missing env variable"', requestedBy: "Claude Desktop", decision: "Expired, nobody approved it", decisionTone: "neutral", where: "None", when: "Last week" },
];

export const toolGroups: ToolGroup[] = [
  {
    provider: "GitHub",
    tools: [
      { name: "github_list_repos", description: "List the repositories the app can see", approval: "Not needed", enabled: true },
      { name: "github_list_pull_requests", description: "List pull requests", approval: "Not needed", enabled: true },
      { name: "github_get_commit", description: "Read a commit and the files it changed", approval: "Not needed", enabled: true },
      { name: "github_prepare_issue", description: "Draft an issue and save it for approval", approval: "Not needed, it only saves a draft", enabled: true },
      { name: "github_commit_issue", description: "Create an issue after you approve it", approval: "Private repos: in the AI client or here. Public repos: here only.", approvalRequired: true, enabled: true },
    ],
  },
  {
    provider: "Vercel",
    tools: [
      { name: "vercel_list_deployments", description: "List deployments and their status", approval: "Not needed", enabled: true },
      { name: "vercel_get_build_log", description: "Read a build log, with secrets removed", approval: "Not needed", enabled: true },
    ],
  },
  {
    provider: "Sentry",
    tools: [
      { name: "sentry_list_issues", description: "List issues by release and environment", approval: "Not needed", enabled: true },
      { name: "sentry_get_issue", description: "Read an issue's latest error, with personal data removed", approval: "Not needed", enabled: true },
    ],
  },
  {
    provider: "PostgreSQL",
    tools: [
      { name: "postgres_list_tables", description: "List tables in the allowed schemas", approval: "Not needed", enabled: true },
      { name: "postgres_describe_table", description: "Show a table's columns and types", approval: "Not needed", enabled: true },
      { name: "postgres_read_query", description: "Run a read-only query, within the limits below", approval: "Not needed", enabled: false },
    ],
  },
  {
    provider: "Hub",
    tools: [
      { name: "gather_deployment_evidence", description: "Collect a deploy, its errors and its commit in one step", approval: "Not needed", enabled: true },
      { name: "hub_whoami", description: "Show the AI client what it can reach", approval: "Not needed", enabled: true },
    ],
  },
];

export const limits: Limit[] = [
  { id: "rows", label: "Most rows a query can return", value: "500", type: "number" },
  { id: "timeout", label: "Query timeout, in seconds", value: "5", type: "number" },
  { id: "lines", label: "Build log lines returned", value: "200", type: "number" },
  { id: "expiry", label: "Approval expires after, in minutes", value: "15", type: "number" },
  { id: "schemas", label: "Database schemas the AI can see", value: "public, analytics", type: "text" },
];

export const assistant = {
  question: "Why is production throwing errors since the last deploy?",
  toolSteps: [
    { tool: "vercel_list_deployments", result: "dpl_7Hq2 live since 10:30, from commit a1b2c3d", duration: "0.4 s" },
    { tool: "sentry_list_issues", result: "3 new issues in release a1b2c3d", duration: "0.6 s" },
    { tool: "sentry_get_issue", result: "PrismaClientInitializationError, 40 events, personal data removed", duration: "0.5 s" },
    { tool: "github_get_commit", result: "a1b2c3d changed prisma/schema.prisma", duration: "0.5 s" },
  ] satisfies AssistantToolStep[],
  answer: [
    "Since deploy dpl_7Hq2 went live 12 minutes ago, every request to /api/orders fails.",
    'Sentry shows 3 new issues with one cause: Prisma can\'t find the environment variable POSTGRES_URL. Commit a1b2c3d, "Update config", changed prisma/schema.prisma to read POSTGRES_URL instead of DATABASE_URL. Production doesn\'t define POSTGRES_URL, so the first database call fails. The build still passed because Prisma reads this variable only at runtime.',
    "To fix it, add POSTGRES_URL to the production environment in Vercel, or revert the rename in schema.prisma.",
  ],
  proposal: {
    title: "Proposed: create a GitHub issue in acme/my-shop",
    riskLabel: "Low risk: private repository",
    issueTitle: "Production errors: POSTGRES_URL not set after a1b2c3d",
    issueSummary:
      "Since deploy dpl_7Hq2 went live, /api/orders fails with PrismaClientInitializationError. Commit a1b2c3d renamed DATABASE_URL to POSTGRES_URL in prisma/schema.prisma, but production does not define it. Fix: add POSTGRES_URL in Vercel, or revert the rename.",
  },
  suggestions: ["Investigate the latest deploy", "New errors since the last release", "Pull requests merged this week"],
  evidence: [
    {
      title: "Sentry issue MY-SHOP-WEB-3F",
      untrusted: true,
      code: `PrismaClientInitializationError:
error: Environment variable not found: POSTGRES_URL.
  --> schema.prisma:7
   |  url = env("POSTGRES_URL")
at GET /api/orders (app/api/orders/route.ts:14)`,
      note: "40 events, first seen in release a1b2c3d. User emails and IP addresses removed by the hub.",
    },
    {
      title: 'Commit a1b2c3d, "Update config"',
      untrusted: true,
      code: `prisma/schema.prisma
-  url = env("DATABASE_URL")
+  url = env("POSTGRES_URL")`,
      note: "",
    },
    {
      title: "Deploy dpl_7Hq2",
      untrusted: false,
      note: "Build passed with no errors. Live in production since 10:30.",
    },
  ] satisfies EvidenceItem[],
};

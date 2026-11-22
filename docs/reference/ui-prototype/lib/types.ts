export type Tone = "neutral" | "waiting" | "blocked";

export type Provider = "GitHub" | "Vercel" | "Sentry" | "PostgreSQL" | "Hub";

export type AiClient =
  | "Claude Desktop"
  | "Claude Code"
  | "Cursor"
  | "MCP Inspector"
  | "Dashboard assistant";

export interface Connection {
  provider: Exclude<Provider, "Hub">;
  connected: boolean;
  summary: string;
  detail: string;
  /** Shown in monospace after the detail, e.g. Sentry scopes */
  scopes?: string;
  lastTest: string;
}

export interface Investigation {
  question: string;
  client: AiClient;
  status: "waiting" | "done";
  when: string;
  traceId: string;
}

export interface ToolCall {
  time: string;
  client: AiClient;
  tool: string;
  provider: Exclude<Provider, "Hub"> | "Hub";
  target: string;
  result: string;
  tone: Tone;
  traceId: string;
}

export interface TraceStep {
  /** Tool name (shown in monospace) or a plain label */
  label: string;
  isTool: boolean;
  detail: string;
  waiting?: boolean;
  flag?: string;
}

export interface PendingApproval {
  id: string;
  action: string;
  risk: "low" | "high";
  riskLabel: string;
  requestedBy: AiClient;
  requestedFor: string;
  requestedAt: string;
  expiresAt: string;
  traceId: string;
  issueTitle: string;
  issueBody: string;
  checks?: string[];
  fingerprint?: string;
  warning?: string;
}

export interface ApprovalRecord {
  action: string;
  requestedBy: AiClient;
  decision: string;
  decisionTone: Tone;
  where: string;
  when: string;
}

export interface ToolPolicy {
  name: string;
  description: string;
  approval: string;
  /** Highlight approval text that always needs a person */
  approvalRequired?: boolean;
  enabled: boolean;
}

export interface ToolGroup {
  provider: Provider;
  tools: ToolPolicy[];
}

export interface Limit {
  id: string;
  label: string;
  value: string;
  type: "number" | "text";
}

export interface ConnectedClient {
  name: AiClient;
  lastUsed: string;
  scope: string;
}

export interface AssistantToolStep {
  tool: string;
  result: string;
  duration: string;
}

export interface EvidenceItem {
  title: string;
  untrusted: boolean;
  /** Code block content; lines starting with "-" or "+" render as a diff */
  code?: string;
  note: string;
}

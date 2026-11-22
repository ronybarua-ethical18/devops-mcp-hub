/** Prisma model names of the tables that carry `orgId`. */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  "Membership",
  "Project",
  "ProjectConnection",
  "Integration",
  "Credential",
  "ToolPolicy",
  "ToolCall",
  "Proposal",
  "Approval",
  "WorkflowRun",
  "WorkflowStep",
  "AuditEvent",
]);

/**
 * Relation field names on tenant models. The extension only sees top-level args, so any
 * traversal into another model is rejected. Json columns (constraints, payload, metadata) are
 * deliberately not in this set. A schema test keeps it equal to the relations in schema.prisma.
 */
export const RELATION_FIELDS: ReadonlySet<string> = new Set([
  "organization",
  "user",
  "connections",
  "toolPolicies",
  "project",
  "integration",
  "credentials",
  "mcpClient",
  "approvals",
  "proposal",
  "steps",
  "run",
]);

/**
 * Relation field names on the non-tenant models (users, organizations, mcp_clients). They
 * point into tenant tables, so traversing them would bypass the filter: rejected too.
 */
export const NON_TENANT_RELATION_FIELDS: ReadonlySet<string> = new Set([
  "memberships",
  "projects",
  "connectionRows",
  "integrationRows",
  "credentialRows",
  "policyRows",
  "toolCallRows",
  "proposalRows",
  "approvalRows",
  "runRows",
  "stepRows",
  "auditRows",
  "toolCalls",
]);

function isRelationField(key: string): boolean {
  return RELATION_FIELDS.has(key) || NON_TENANT_RELATION_FIELDS.has(key);
}

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);
const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function violation(message: string): never {
  throw new TenantViolationError(message);
}

/** Reject an `orgId` that is not the scope's, and relation traversal, anywhere in a filter. */
function checkWhere(where: unknown, orgId: string): void {
  if (where === undefined) return;
  if (!isObj(where)) violation("where must be an object");
  for (const [key, value] of Object.entries(where)) {
    if (key === "orgId") {
      if (value !== orgId) violation("orgId in where does not match the tenant scope");
    } else if (key === "AND" || key === "OR" || key === "NOT") {
      for (const part of Array.isArray(value) ? value : [value]) checkWhere(part, orgId);
    } else if (isRelationField(key)) {
      violation(`relation filter "${key}" is not allowed on the tenant client`);
    }
  }
}

function checkData(data: unknown, orgId: string): void {
  if (!isObj(data)) violation("data must be an object");
  for (const [key, value] of Object.entries(data)) {
    if (key === "orgId" && value !== orgId) {
      violation("orgId in data does not match the tenant scope");
    }
    if (isRelationField(key)) {
      violation(`nested relation write "${key}" is not allowed on the tenant client`);
    }
  }
}

function checkShape(args: Obj): void {
  if (args["include"] !== undefined) violation("include is not allowed on the tenant client");
  const select = args["select"];
  if (select !== undefined) {
    if (!isObj(select)) violation("select must be an object");
    for (const [key, value] of Object.entries(select)) {
      if ((key === "_count" || isRelationField(key)) && value) {
        violation(`selecting "${key}" is not allowed on the tenant client`);
      }
    }
  }
  const orderBy = args["orderBy"];
  if (orderBy !== undefined) {
    for (const part of Array.isArray(orderBy) ? orderBy : [orderBy]) {
      if (!isObj(part)) violation("orderBy must be an object");
      for (const key of Object.keys(part)) {
        if (key === "_count" || isRelationField(key)) {
          violation(`ordering by "${key}" is not allowed on the tenant client`);
        }
      }
    }
  }
}

function withOrg(data: unknown, orgId: string): Obj {
  checkData(data, orgId);
  return { ...(data as Obj), orgId };
}

/**
 * Return args for a Prisma operation with the tenant filter injected. Never mutates `args`.
 * Fails closed: unknown operations and relation traversal on tenant models throw.
 */
export function scopeArgs(model: string, operation: string, args: unknown, orgId: string): unknown {
  if (args !== undefined && !isObj(args)) violation("args must be an object");
  const input: Obj = args ?? {};
  checkShape(input);

  if (!TENANT_MODELS.has(model)) {
    // Non-tenant models have no org filter, but their relations lead into tenant tables.
    checkWhere(input["where"], orgId);
    for (const key of ["data", "create", "update"]) {
      const value = input[key];
      if (value === undefined) continue;
      for (const row of Array.isArray(value) ? value : [value]) checkData(row, orgId);
    }
    return args;
  }

  if (WHERE_OPERATIONS.has(operation)) {
    checkWhere(input["where"], orgId);
    if (input["data"] !== undefined) checkData(input["data"], orgId);
    const where = isObj(input["where"]) ? input["where"] : {};
    return { ...input, where: { ...where, orgId } };
  }

  if (CREATE_OPERATIONS.has(operation)) {
    const data = input["data"];
    return {
      ...input,
      data: Array.isArray(data) ? data.map((row) => withOrg(row, orgId)) : withOrg(data, orgId),
    };
  }

  if (operation === "upsert") {
    checkWhere(input["where"], orgId);
    checkData(input["update"], orgId);
    const where = isObj(input["where"]) ? input["where"] : {};
    return {
      ...input,
      where: { ...where, orgId },
      create: withOrg(input["create"], orgId),
    };
  }

  return violation(`operation "${operation}" is not allowed on the tenant client`);
}

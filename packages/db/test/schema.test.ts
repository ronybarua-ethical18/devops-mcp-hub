import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NON_TENANT_RELATION_FIELDS, RELATION_FIELDS, TENANT_MODELS } from "../src/tenant/scope.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");

interface Model {
  name: string;
  lines: string[];
  fields: Array<{ name: string; type: string; line: string }>;
}

const models: Model[] = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)].map((m) => {
  const lines = (m[2] ?? "").split("\n").map((l) => l.trim());
  const fields = lines
    .filter((l) => /^[a-z]\w*\s+\w/.test(l))
    .map((l) => {
      const [name = "", type = ""] = l.split(/\s+/);
      return { name, type: type.replace(/[?[\]]/g, ""), line: l };
    });
  return { name: m[1] ?? "", lines, fields };
});
const modelNames = new Set(models.map((m) => m.name));
const byName = (name: string): Model => {
  const model = models.find((m) => m.name === name);
  if (!model) throw new Error(`model ${name} missing`);
  return model;
};
const tenantModels = models.filter((m) => m.fields.some((f) => f.name === "orgId"));

describe("schema.prisma", () => {
  it("defines the fifteen models", () => {
    expect([...modelNames].sort()).toEqual(
      [
        "Approval",
        "AuditEvent",
        "Credential",
        "Integration",
        "McpClient",
        "Membership",
        "Organization",
        "Project",
        "ProjectConnection",
        "Proposal",
        "ToolCall",
        "ToolPolicy",
        "User",
        "WorkflowRun",
        "WorkflowStep",
      ].sort(),
    );
  });

  it("gives every orgId model an index whose first column is orgId", () => {
    for (const model of tenantModels) {
      expect(
        model.lines.some((l) => /^@@index\(\[orgId[,\]]/.test(l)),
        model.name,
      ).toBe(true);
    }
  });

  it("has orgId on exactly the TENANT_MODELS", () => {
    expect(tenantModels.map((m) => m.name).sort()).toEqual([...TENANT_MODELS].sort());
  });

  it("keeps users, organizations and mcp_clients free of orgId", () => {
    for (const name of ["User", "Organization", "McpClient"]) {
      expect(
        byName(name).fields.some((f) => f.name === "orgId"),
        name,
      ).toBe(false);
    }
  });

  it("keeps RELATION_FIELDS equal to the relation fields of tenant models", () => {
    const relations = new Set(
      tenantModels.flatMap((m) =>
        m.fields.filter((f) => modelNames.has(f.type)).map((f) => f.name),
      ),
    );
    expect([...relations].sort()).toEqual([...RELATION_FIELDS].sort());
  });

  it("keeps NON_TENANT_RELATION_FIELDS equal to the relation fields of non-tenant models", () => {
    const relations = new Set(
      models
        .filter((m) => !tenantModels.includes(m))
        .flatMap((m) => m.fields.filter((f) => modelNames.has(f.type)).map((f) => f.name)),
    );
    expect([...relations].sort()).toEqual([...NON_TENANT_RELATION_FIELDS].sort());
  });

  it("limits memberships to one owner row per user", () => {
    const membership = byName("Membership");
    expect(membership.fields.find((f) => f.name === "userId")?.line).toContain("@unique");
    expect(schema).toMatch(/enum MembershipRole \{\s*owner\s*\}/);
  });

  it("stores credentials as sealed envelope columns", () => {
    const names = byName("Credential").fields.map((f) => f.name);
    for (const name of ["ciphertext", "iv", "wrappedDek", "keyVersion", "expiresAt", "rotatedAt"]) {
      expect(names).toContain(name);
    }
  });

  it("makes audit_events append-only in shape and in the database", () => {
    expect(byName("AuditEvent").fields.some((f) => f.name === "updatedAt")).toBe(false);
    const migrations = join(root, "prisma", "migrations");
    const sql = readdirSync(migrations, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => readFileSync(join(migrations, d.name, "migration.sql"), "utf8"))
      .join("\n");
    expect(sql).toContain("audit_events_append_only");
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON "audit_events"/);
  });

  it("uses risk tiers read, low_write and high_write", () => {
    expect(schema).toMatch(/enum RiskTier \{\s*read\s+low_write\s+high_write\s*\}/);
  });

  it("maps every model and camelCase column to snake_case", () => {
    for (const model of models) {
      expect(
        model.lines.some((l) => l.startsWith("@@map(")),
        `${model.name} @@map`,
      ).toBe(true);
      for (const field of model.fields) {
        if (modelNames.has(field.type) || !/[A-Z]/.test(field.name)) continue;
        expect(field.line, `${model.name}.${field.name}`).toMatch(/@map\("[a-z0-9_]+"\)/);
      }
    }
  });

  it("notes the retention rules", () => {
    expect(schema).toContain("30 days");
    expect(schema).toContain("1 year");
    expect(schema).toContain("7 days");
  });
});

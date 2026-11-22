// The spike's single tool. Execution failures are tool errors (isError), so the model can retry;
// only an unknown tool is a protocol error (handled in dispatch).

export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface ToolCallResult {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
  isError: boolean;
}

export const DIVIDE_BY_ZERO_HINT = "Cannot divide by zero. Call divide again with a non-zero b.";
export const OVERFLOW_HINT =
  "The quotient is too large to represent as a number. Call divide with smaller a or larger b.";
const ALLOWED_ARGS = new Set(["a", "b"]);
// Extra key names are echoed back to the model; bound how many and how long.
const MAX_ECHOED_KEYS = 3;
const MAX_KEY_LENGTH = 40;

/** One hint covering every argument problem, so a single retry can fix them all. */
function badArgsHint(badTypes: boolean, extra: string[]): string {
  const problems: string[] = [];
  if (badTypes) problems.push("a and b must both be numbers");
  if (extra.length > 0) {
    const shown = extra
      .slice(0, MAX_ECHOED_KEYS)
      .map((k) => JSON.stringify(k.slice(0, MAX_KEY_LENGTH)));
    const more =
      extra.length > MAX_ECHOED_KEYS ? ` and ${extra.length - MAX_ECHOED_KEYS} more` : "";
    problems.push(`pass only a and b (remove ${shown.join(", ")}${more})`);
  }
  return `Invalid arguments: ${problems.join("; ")}, e.g. {"a": 6, "b": 3}.`;
}

const divide: ToolDefinition = {
  name: "divide",
  title: "Divide two numbers",
  description:
    "Divides a by b and returns the quotient. Use it for one division of two numbers. Don't use it for other arithmetic or whole expressions: this server has no tool for those, so work them out without a tool.",
  inputSchema: {
    type: "object",
    properties: { a: { type: "number" }, b: { type: "number" } },
    required: ["a", "b"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { quotient: { type: "number" } },
    required: ["quotient"],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const toolError = (text: string): ToolCallResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function listTools(): ToolDefinition[] {
  return [divide];
}

export function callTool(name: string, args: unknown): ToolCallResult | undefined {
  if (name !== divide.name) return undefined;

  const input = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const { a, b } = input;
  // inputSchema says additionalProperties: false, so enforce it rather than silently ignoring keys.
  const extra = Object.keys(input).filter((k) => !ALLOWED_ARGS.has(k));
  if (!isFiniteNumber(a) || !isFiniteNumber(b) || extra.length > 0) {
    return toolError(badArgsHint(!isFiniteNumber(a) || !isFiniteNumber(b), extra));
  }
  if (b === 0) return toolError(DIVIDE_BY_ZERO_HINT);

  const quotient = a / b;
  // Finite inputs can still overflow (1e308 / 1e-308); Infinity would serialize as null.
  if (!Number.isFinite(quotient)) return toolError(OVERFLOW_HINT);

  const structuredContent = { quotient };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: false,
  };
}

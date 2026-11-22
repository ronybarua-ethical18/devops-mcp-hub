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
export const BAD_ARGS_HINT =
  'Invalid arguments: a and b must both be numbers, e.g. {"a": 6, "b": 3}.';
export const EXTRA_ARGS_HINT =
  'Invalid arguments: pass only a and b, e.g. {"a": 6, "b": 3}. Remove any other keys.';
const ALLOWED_ARGS = new Set(["a", "b"]);

const divide: ToolDefinition = {
  name: "divide",
  title: "Divide two numbers",
  description: "Divides a by b and returns the quotient.",
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
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return toolError(BAD_ARGS_HINT);
  // inputSchema says additionalProperties: false, so enforce it rather than silently ignoring keys.
  if (Object.keys(input).some((k) => !ALLOWED_ARGS.has(k))) return toolError(EXTRA_ARGS_HINT);
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

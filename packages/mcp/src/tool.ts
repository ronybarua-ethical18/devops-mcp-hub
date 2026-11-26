// The shape of a hub tool: strict input, a declared output, annotations, a one-line summary and a run function.
// Tools are plain data here; the registry (registry.ts) turns them into SDK registrations.

import type { ToolAnnotations } from "@modelcontextprotocol/server";
import type * as z from "zod/v4";

/** Any zod object schema, strict or not. */
export type AnyObjectSchema = z.ZodObject<z.core.$ZodLooseShape, z.core.$ZodObjectConfig>;

/** Every hub tool states whether it only reads and whether it reaches outside the hub. */
export type HubToolAnnotations = ToolAnnotations & {
  readOnlyHint: boolean;
  openWorldHint: boolean;
};

export interface HubToolDefinition<Ctx, In extends AnyObjectSchema, Out extends AnyObjectSchema> {
  name: string;
  title: string;
  description: string;
  /** Must be z.strictObject: the registry refuses anything else. */
  inputSchema: In;
  outputSchema: Out;
  annotations: HubToolAnnotations;
  /** Line 1 of the text summary. Gets the output without untrusted_content, so it cannot quote provider text. */
  summarize(output: Omit<z.infer<Out>, "untrusted_content">): string;
  run(input: z.infer<In>, ctx: Ctx): Promise<z.infer<Out>>;
}

/** The schema-erased form the registry stores, so tools with different schemas fit in one array. */
export interface HubTool<Ctx> {
  name: string;
  title: string;
  description: string;
  inputSchema: AnyObjectSchema;
  outputSchema: AnyObjectSchema;
  annotations: HubToolAnnotations;
  summarize(output: Record<string, unknown>): string;
  run(input: Record<string, unknown>, ctx: Ctx): Promise<unknown>;
}

export function defineTool<Ctx, In extends AnyObjectSchema, Out extends AnyObjectSchema>(
  def: HubToolDefinition<Ctx, In, Out>,
): HubTool<Ctx> {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    annotations: def.annotations,
    // The registry only calls these with values its own schemas parsed: input by the SDK against
    // inputSchema, output by outputSchema with untrusted_content removed. That makes the casts sound.
    summarize: (output) => def.summarize(output as Omit<z.infer<Out>, "untrusted_content">),
    run: (input, ctx) => def.run(input as z.infer<In>, ctx),
  };
}

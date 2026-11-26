// The shape of a hub resource template: a URI template, a declared output and a read function.
// Like tools, resources are plain data here; the registry (registry.ts) checks them and wraps every read.

import type { AnyObjectSchema } from "./tool.js";

export interface HubResourceTemplate<Ctx> {
  /** Same naming rule as tools: snake_case with a provider prefix, unique across tools and resources. */
  name: string;
  title: string;
  description: string;
  /** RFC 6570 template, e.g. github://{owner}/{repo}/commits/{sha}. */
  uriTemplate: string;
  /** The read result is re-parsed with this, so undeclared fields are dropped. */
  outputSchema: AnyObjectSchema;
  read(variables: Record<string, string>, ctx: Ctx): Promise<unknown>;
}

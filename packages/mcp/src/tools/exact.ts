// Type-level checks that a tool's output schema matches its core result type field for field.
// A field the schema forgot would be stripped at runtime without a word, so tsc must catch it instead.

/** true only when A and B are assignable both ways. */
export type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Fails to compile unless T is true. */
export type Assert<T extends true> = T;

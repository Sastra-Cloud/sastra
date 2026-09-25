import type { StoredToolCall } from "./types";

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
};

export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolArgumentError";
  }
}

// Tags reasoning models sometimes wrap their private chain-of-thought in when
// they emit it inline in the answer instead of a separate channel.
const REASONING_TAGS = "think|thinking|reasoning|analysis";

/**
 * Remove any inline reasoning a model leaked into its user-facing text so a
 * model's private chain-of-thought never reaches the chat bubble. The API layer
 * already asks OpenRouter to exclude reasoning (`aiToolTurn`/`aiChat`); this is
 * the defensive backstop for a model/route that ignores that and wraps its
 * reasoning in `<think>…</think>`-style tags inside `content`. Deliberately
 * conservative: it only strips well-known delimited blocks, so ordinary answers
 * (including stray `<` characters) pass through untouched.
 */
export function stripReasoning(content: string | null | undefined): string {
  return (content ?? "")
    // Closed blocks anywhere in the text.
    .replace(new RegExp(`<(${REASONING_TAGS})>[\\s\\S]*?<\\/\\1>`, "gi"), "")
    // An unclosed trailing block (model cut off mid-reasoning).
    .replace(new RegExp(`<(${REASONING_TAGS})>[\\s\\S]*$`, "i"), "")
    .trim();
}

/**
 * Split a turn's tool calls into auto-run (read/memory) vs. writes that need
 * user approval. Pure so it's unit-testable.
 */
export function partitionToolCalls(
  calls: StoredToolCall[],
  isWrite: (name: string) => boolean
): { auto: StoredToolCall[]; writes: StoredToolCall[] } {
  const auto: StoredToolCall[] = [];
  const writes: StoredToolCall[] = [];
  for (const c of calls) {
    if (isWrite(c.function.name)) writes.push(c);
    else auto.push(c);
  }
  return { auto, writes };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function schemaAcceptsNull(schema: JsonSchema): boolean {
  if (Array.isArray(schema.type) && schema.type.includes("null")) return true;
  return schema.type === "null" || !!schema.anyOf?.some(schemaAcceptsNull);
}

function validateValue(value: unknown, schema: JsonSchema, path: string): void {
  if (schema.anyOf) {
    const valid = schema.anyOf.some((candidate) => {
      try {
        validateValue(value, candidate, path);
        return true;
      } catch {
        return false;
      }
    });
    if (!valid) throw new ToolArgumentError(`${path} does not match the tool schema.`);
    return;
  }

  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw new ToolArgumentError(`${path} must be one of: ${schema.enum.join(", ")}.`);
  }

  const allowedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (value === null) {
    if (!allowedTypes.includes("null")) {
      throw new ToolArgumentError(`${path} cannot be null.`);
    }
    return;
  }

  const actual = Array.isArray(value)
    ? "array"
    : Number.isInteger(value)
      ? "integer"
      : typeof value;
  if (
    allowedTypes.length > 0 &&
    !allowedTypes.includes(actual) &&
    !(actual === "integer" && allowedTypes.includes("number"))
  ) {
    throw new ToolArgumentError(`${path} must be ${allowedTypes.join(" or ")}.`);
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      throw new ToolArgumentError(`${path} is too short.`);
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      throw new ToolArgumentError(`${path} is too long.`);
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ToolArgumentError(`${path} must be finite.`);
    if (schema.minimum != null && value < schema.minimum) {
      throw new ToolArgumentError(`${path} is below the minimum.`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      throw new ToolArgumentError(`${path} is above the maximum.`);
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateValue(item, schema.items!, `${path}[${index}]`));
  }
  if (isObject(value) && schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const key of required) {
      if (!(key in value)) throw new ToolArgumentError(`${path}.${key} is required.`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          throw new ToolArgumentError(`${path}.${key} is not an allowed field.`);
        }
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key in value) validateValue(value[key], child, `${path}.${key}`);
    }
  }
}

/**
 * OpenAI strict function schemas require every property to be listed in
 * `required`; optional fields are represented as nullable. Keep the authored
 * schema ergonomic, then produce the strict wire schema here.
 */
export function strictToolParameters(
  input: Record<string, unknown>
): Record<string, unknown> {
  const schema = input as JsonSchema;
  const visit = (node: JsonSchema): JsonSchema => {
    if (node.anyOf) return { ...node, anyOf: node.anyOf.map(visit) };
    if (node.type === "array") {
      return { ...node, ...(node.items ? { items: visit(node.items) } : {}) };
    }
    if (node.type !== "object" || !node.properties) return { ...node };

    const authoredRequired = new Set(node.required ?? []);
    const properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, child]) => {
        const strictChild = visit(child);
        return [
          key,
          authoredRequired.has(key) || schemaAcceptsNull(strictChild)
            ? strictChild
            : { anyOf: [strictChild, { type: "null" }] },
        ];
      })
    );
    return {
      ...node,
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  };
  return visit(schema) as Record<string, unknown>;
}

/** Remove nulls that strict-mode uses to represent authored optional fields. */
function stripOptionalNulls(
  value: Record<string, unknown>,
  schema: JsonSchema
): Record<string, unknown> {
  const required = new Set(schema.required ?? []);
  const out: Record<string, unknown> = { ...value };
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    if (!(key in out)) continue;
    if (out[key] === null && !required.has(key)) {
      delete out[key];
    } else if (isObject(out[key]) && child.type === "object") {
      out[key] = stripOptionalNulls(out[key] as Record<string, unknown>, child);
    } else if (Array.isArray(out[key]) && child.type === "array" && child.items) {
      out[key] = out[key].map((item) =>
        isObject(item) && child.items?.type === "object"
          ? stripOptionalNulls(item, child.items)
          : item
      );
    }
  }
  return out;
}

/** Parse and validate model-authored arguments before previewing or executing. */
export function parseToolArgs(
  raw: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw new ToolArgumentError("Tool arguments are not valid JSON.");
  }
  if (!isObject(parsed)) throw new ToolArgumentError("Tool arguments must be an object.");
  const schema = parameters as JsonSchema;
  const clean = stripOptionalNulls(parsed, schema);
  validateValue(clean, { ...schema, additionalProperties: false }, "arguments");
  return clean;
}

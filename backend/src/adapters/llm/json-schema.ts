import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

/**
 * Convert a Zod schema into the JSON-Schema dialect OpenAI-compatible strict
 * mode actually accepts.
 *
 * Every rule below was found by calling the live API, not by reading a spec —
 * which is precisely what tier-2 contract tests exist for. The default
 * zod-to-json-schema output is rejected in three separate ways:
 *
 *   1. `$ref` + `definitions` — refs are inlined instead.
 *
 *   2. Missing `additionalProperties: false`, and only on NESTED objects. The
 *      root gets one for free, so the failure only appears once a schema has
 *      an array of objects — which is exactly our shape.
 *
 *   3. `anyOf: [{enum}, {type:"null"}]` for a nullable enum. This is the
 *      subtle one: the API accepts the schema, the model generates perfectly
 *      valid output, and then the API's OWN validator rejects its own
 *      generation with "Failed to validate JSON". Null has to be folded into
 *      the type array AND the enum list instead.
 *
 * Strict mode also requires every property to appear in `required`;
 * optionality is expressed by allowing null, which suits us — stage 5 wants
 * "absent" stated explicitly rather than omitted.
 */
export function toStrictJsonSchema<T>(schema: z.ZodType<T>): unknown {
  // No `name`: naming the schema reintroduces the $ref/definitions wrapper.
  return harden(zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }));
}

function harden(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(harden);
  if (node === null || typeof node !== "object") return node;

  let o = { ...(node as Record<string, unknown>) };
  delete o.$schema;

  o = foldNullableUnion(o);

  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    const props = o.properties as Record<string, unknown>;
    o.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, harden(v)]),
    );
    o.additionalProperties = false;
    o.required = Object.keys(props);
    return o;
  }

  for (const [k, v] of Object.entries(o)) o[k] = harden(v);
  return o;
}

/** `anyOf: [X, {type:"null"}]` becomes X with null in its type and enum. */
function foldNullableUnion(o: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(o.anyOf)) return o;

  const branches = o.anyOf as Array<Record<string, unknown>>;
  const hasNull = branches.some((b) => b.type === "null");
  const others = branches.filter((b) => b.type !== "null");
  if (!hasNull || others.length !== 1) return o;

  const only = { ...(others[0] as Record<string, unknown>) };
  only.type = Array.isArray(only.type) ? [...only.type, "null"] : [only.type, "null"];
  if (Array.isArray(only.enum)) only.enum = [...only.enum, null];

  const { anyOf: _dropped, ...rest } = o;
  return { ...rest, ...only };
}

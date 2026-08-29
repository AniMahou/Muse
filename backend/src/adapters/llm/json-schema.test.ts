import { describe, it, expect } from "vitest";
import { toStrictJsonSchema } from "./json-schema";
import { buildAssemblySchema } from "@/pipeline/stages/05-assemble/schema";

/**
 * The shape stage 5 actually sends.
 *
 * Every assertion here corresponds to a way the live API rejected us. They
 * are cheap to check offline and expensive to discover at 3000 tokens a go,
 * and `mentionIndex` added one more nullable enum to a payload where exactly
 * that construct has failed before.
 */
/** Just enough of the dialect to assert against without reaching for `any`. */
interface JsonSchemaNode {
  type?: string | string[];
  enum?: Array<string | null>;
  anyOf?: unknown;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
  additionalProperties?: boolean;
}

const schema = toStrictJsonSchema(
  buildAssemblySchema({
    outletIds: ["OUT-1"],
    skuIds: ["SKU-1"],
    competitorBrands: ["COMP-W"],
    mentionIndices: ["0", "1"],
  }),
) as JsonSchemaNode;

const item = schema.properties!.observations!.items!;
const prop = (name: string) => item.properties![name]!;

describe("the strict JSON schema stage 5 sends", () => {
  it("carries no $ref or definitions", () => {
    const text = JSON.stringify(schema);
    expect(text).not.toContain("$ref");
    expect(text).not.toContain("definitions");
  });

  it("closes every nested object", () => {
    expect(item.additionalProperties).toBe(false);
  });

  it("requires every property, including mentionIndex", () => {
    expect(item.required).toContain("mentionIndex");
    expect(item.required).toContain("skuId");
  });

  it("folds a nullable enum into type+enum rather than anyOf", () => {
    // The failure this prevents is the subtle one: the API ACCEPTS an
    // anyOf-wrapped nullable enum, the model generates valid output, and then
    // the API's own validator rejects its own generation.
    expect(prop("mentionIndex").anyOf).toBeUndefined();
    expect(prop("mentionIndex").type).toEqual(["string", "null"]);
    expect(prop("mentionIndex").enum).toEqual(["0", "1", null]);
  });

  it("keeps the mention indices closed to what the resolver produced", () => {
    expect(prop("mentionIndex").enum).not.toContain("2");
  });

  it("collapses mentionIndex to null-only when nothing resolved", () => {
    const empty = toStrictJsonSchema(
      buildAssemblySchema({
        outletIds: [],
        skuIds: [],
        competitorBrands: [],
        mentionIndices: [],
      }),
    ) as JsonSchemaNode;
    expect(empty.properties!.observations!.items!.properties!.mentionIndex!.type).toBe("null");
  });
});

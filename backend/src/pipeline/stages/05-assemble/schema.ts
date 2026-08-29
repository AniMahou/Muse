import { z } from "zod";
import { ObservationTypeSchema, SeveritySchema } from "@shared/observation.schema";
import type { Annotations } from "@shared/stage-io";

/**
 * The response contract, rebuilt for EVERY clip.
 *
 * This is the mechanism the whole design rests on. Identity fields are not
 * free strings the model fills in — they are enums whose members are exactly
 * the candidates stages 3 and 4 produced for THIS recording. A product that
 * was never resolved cannot be named, because there is no token in the
 * grammar that would express it.
 *
 * That makes a hallucinated SKU structurally impossible rather than merely
 * discouraged by prompt wording. A static schema with `skuId: string` and an
 * instruction to "only use products from the list" would be a request; this
 * is a constraint.
 *
 * The same object produces both the runtime validator and the provider's
 * JSON-schema payload (see the ILlmProvider port), so the two cannot drift.
 */
export interface AssemblyVocabulary {
  outletIds: string[];
  skuIds: string[];
  competitorBrands: string[];
  /**
   * One entry per distinct product mention stage 3 found, as a string index.
   *
   * Strings rather than numbers because the strict JSON-schema dialect the
   * providers accept expresses a closed set as a string `enum`; a union of
   * numeric literals survives zod-to-json-schema but not the API's own
   * validator.
   */
  mentionIndices: string[];
}

export function vocabularyFrom(annotations: Annotations): AssemblyVocabulary {
  const skuIds = new Set<string>();
  const competitorBrands = new Set<string>();

  for (const ann of annotations.skus) {
    for (const c of ann.candidates) {
      if (c.isCompetitor) competitorBrands.add(c.skuId);
      else skuIds.add(c.skuId);
    }
  }

  return {
    outletIds: annotations.outlet.candidates.map((c) => c.outletId),
    skuIds: [...skuIds],
    competitorBrands: [...competitorBrands],
    mentionIndices: annotations.skus.map((_, i) => String(i)),
  };
}

/** z.enum needs a non-empty tuple; an empty vocabulary collapses to null. */
function enumOrNull(values: string[]) {
  if (values.length === 0) return z.null();
  return z.enum(values as [string, ...string[]]).nullable();
}

export function buildAssemblySchema(vocab: AssemblyVocabulary) {
  const Observation = z.object({
    type: ObservationTypeSchema,
    outletId: enumOrNull(vocab.outletIds),
    skuId: enumOrNull(vocab.skuIds),
    competitorBrand: enumOrNull(vocab.competitorBrands),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    priceDelta: z.number().nullable(),
    severity: SeveritySchema,
    verbatimBn: z.string(),
    /**
     * Which numbered product mention this observation came from.
     *
     * Not part of ObservationCore — it is stripped before the observation
     * leaves this stage. It exists to make under-segmentation OBSERVABLE.
     *
     * The measured failure is that a clip naming three products comes back as
     * one merged observation: on the 105-clip dev set, 27 of 38 multi-mention
     * clips under-reported, losing 32 of 149 observations. Counting entries
     * cannot distinguish "the rep really said one thing" from "the model
     * merged three", so the model is made to say which mention each entry
     * answers. A mention nobody claimed is then a fact, not an inference.
     *
     * Null is legitimate: a complaint or a closed shop belongs to no product.
     */
    mentionIndex: enumOrNull(vocab.mentionIndices),
  });

  return z.object({ observations: z.array(Observation) });
}

export type AssemblyResponse = z.infer<ReturnType<typeof buildAssemblySchema>>;

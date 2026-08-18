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
  });

  return z.object({ observations: z.array(Observation) });
}

export type AssemblyResponse = z.infer<ReturnType<typeof buildAssemblySchema>>;

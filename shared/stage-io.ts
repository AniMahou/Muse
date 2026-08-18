import { z } from "zod";
import { ObservationCoreSchema, ObservationStatusSchema } from "./observation.schema";

/**
 * Contracts between pipeline stages.
 *
 * TWO INVARIANTS hold across every stage in this file:
 *
 *   1. Stages ANNOTATE; they never rewrite the transcript. The original text
 *      flows through untouched and each stage appends annotations carrying
 *      character spans back into it. A stage that rewrote "দের ডজন" to "18"
 *      and got it wrong would leave nothing downstream able to recover, and
 *      would destroy the evidence stage 6 needs to score confidence.
 *
 *   2. Stages 2, 3 and 4 are INDEPENDENT. All three read the same transcript
 *      and emit disjoint annotation sets. Quantities do not depend on
 *      products; products do not depend on outlets. They run in parallel.
 */

/** [startChar, endChar) into `Transcript.text`. */
export const SpanSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
export type Span = z.infer<typeof SpanSchema>;

// ---------------------------------------------------------------------------
// Stage 1 — transcribe
// ---------------------------------------------------------------------------

export const WordSchema = z.object({
  w: z.string(),
  /** Seconds from clip start. */
  start: z.number(),
  end: z.number(),
  /**
   * 0..1. Not every provider reports per-word confidence; adapters that only
   * expose a segment-level average log-probability derive it. See
   * `adapters/asr/confidence.ts` for the mapping — it is documented there
   * rather than silently applied, because stage 6 treats this as evidence.
   */
  conf: z.number().min(0).max(1),
  /** Character offset of this word within `Transcript.text`. */
  span: SpanSchema,
});
export type Word = z.infer<typeof WordSchema>;

export const TranscriptSchema = z.object({
  text: z.string(),
  words: z.array(WordSchema),
  language: z.string().default("bn"),
  durationSec: z.number().nullable(),
  provider: z.string(),
  model: z.string(),
  /** True when the provider gave no per-word confidence and it was derived. */
  confidenceDerived: z.boolean().default(false),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

// ---------------------------------------------------------------------------
// Stage 2 — quantity grammar
// ---------------------------------------------------------------------------

export const QuantityAnnotationSchema = z.object({
  span: SpanSchema,
  /** Exactly as it appeared in the transcript, including ASR misspellings. */
  raw: z.string(),
  value: z.number(),
  /** Normalised unit token, e.g. "piece", "carton", "BDT", "kg". Null if unstated. */
  unit: z.string().nullable(),
  /** Human-readable derivation, e.g. "1.5 × 12". Shown in traces and the review UI. */
  basis: z.string(),
  confidence: z.number().min(0).max(1),
});
export type QuantityAnnotation = z.infer<typeof QuantityAnnotationSchema>;

// ---------------------------------------------------------------------------
// Stage 3 — SKU / competitor resolver
// ---------------------------------------------------------------------------

export const SkuCandidateSchema = z.object({
  skuId: z.string(),
  name: z.string(),
  brand: z.string(),
  isCompetitor: z.boolean(),
  score: z.number().min(0).max(1),
  /** Set when the match came via an approved alias rather than the SKU name. */
  viaAlias: z.string().nullable().default(null),
});
export type SkuCandidate = z.infer<typeof SkuCandidateSchema>;

export const SkuAnnotationSchema = z.object({
  span: SpanSchema,
  raw: z.string(),
  /** Descending by score. */
  candidates: z.array(SkuCandidateSchema),
  /**
   * score(top1) - score(top2).
   *
   * The single most useful signal in the whole pipeline. A high top-1 score
   * with a *low* margin means ambiguous, not confident — two products sound
   * alike and the system genuinely cannot tell them apart. Stage 6 weights
   * this heavily, and a naive "just use the top score" design would silently
   * confirm the wrong SKU in exactly these cases.
   */
  margin: z.number().min(0).max(1),
});
export type SkuAnnotation = z.infer<typeof SkuAnnotationSchema>;

// ---------------------------------------------------------------------------
// Stage 4 — outlet resolver
// ---------------------------------------------------------------------------

export const OutletCandidateSchema = z.object({
  outletId: z.string(),
  name: z.string(),
  distanceM: z.number(),
  /** Similarity of the spoken name to this outlet's name, 0 when nothing was said. */
  nameScore: z.number().min(0).max(1),
  /** Combined geo + name score. */
  score: z.number().min(0).max(1),
});
export type OutletCandidate = z.infer<typeof OutletCandidateSchema>;

export const OutletResolutionSchema = z.object({
  /** Null when the rep gave no name and we are relying on GPS alone. */
  span: SpanSchema.nullable(),
  raw: z.string().nullable(),
  candidates: z.array(OutletCandidateSchema),
  margin: z.number().min(0).max(1),
  /** How many outlets fell inside the GPS radius before name matching. */
  gpsCandidateCount: z.number().int(),
  /** True when the rep confirmed the outlet in the app; overrides matching. */
  declared: z.boolean().default(false),
});
export type OutletResolution = z.infer<typeof OutletResolutionSchema>;

// ---------------------------------------------------------------------------
// Annotation bundle — the input to stage 5
// ---------------------------------------------------------------------------

export const AnnotationsSchema = z.object({
  quantities: z.array(QuantityAnnotationSchema),
  skus: z.array(SkuAnnotationSchema),
  outlet: OutletResolutionSchema,
});
export type Annotations = z.infer<typeof AnnotationsSchema>;

// ---------------------------------------------------------------------------
// Stage 5 — assembly
// ---------------------------------------------------------------------------

export const AssembledSchema = z.object({
  observations: z.array(ObservationCoreSchema),
});
export type Assembled = z.infer<typeof AssembledSchema>;

// ---------------------------------------------------------------------------
// Stage 6 — confidence
// ---------------------------------------------------------------------------

export const ScoredObservationSchema = ObservationCoreSchema.extend({
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
  flaggedFields: z.array(z.string()),
  status: ObservationStatusSchema,
});
export type ScoredObservation = z.infer<typeof ScoredObservationSchema>;

// ---------------------------------------------------------------------------
// Pipeline envelope
// ---------------------------------------------------------------------------

/**
 * Envelope handed to the orchestrator.
 *
 * A plain interface rather than a Zod type: `audio` is binary and not part of
 * any serialisable contract, and deriving it from `z.instanceof(Uint8Array)`
 * pins the buffer's type parameter in a way that fights every other
 * Uint8Array in the codebase. Zod validates what crosses a wire; this crosses
 * a function call.
 */
export interface PipelineInput {
  clipId: string;
  companyId: string;
  repId: string;
  /** Present when the caller already holds the bytes; otherwise fetched from storage. */
  audio?: Uint8Array;
  storageKey: string;
  mimeType: string;
  geo: { lat: number; lng: number } | null;
  declaredOutletId: string | null;
  recordedAt: string;
}

export const PipelineResultSchema = z.object({
  clipId: z.string(),
  transcript: TranscriptSchema,
  annotations: AnnotationsSchema,
  observations: z.array(ScoredObservationSchema),
  timings: z.record(z.string(), z.number()),
  cacheHits: z.array(z.string()),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;

import { z } from "zod";

/**
 * The unit of value Muse produces.
 *
 * One recording yields 0..N observations — a rep frequently reports several
 * unrelated things in a single breath.
 */

export const ObservationTypeSchema = z.enum([
  "demand_signal",
  "competitor_promo",
  "stock_out",
  "price_change",
  "retailer_complaint",
  "posm_issue",
]);
export type ObservationType = z.infer<typeof ObservationTypeSchema>;

export const SeveritySchema = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const ObservationStatusSchema = z.enum([
  /** Every critical field cleared its confidence threshold. */
  "confirmed",
  /** At least one critical field is uncertain; a prompt is queued for the rep. */
  "needs_clarification",
  /** A human at HQ reviewed and corrected this record. */
  "corrected",
  /** Discarded during review. Retained rather than deleted, for audit. */
  "discarded",
]);
export type ObservationStatus = z.infer<typeof ObservationStatusSchema>;

/**
 * Fields the model is allowed to fill.
 *
 * Every identity field is nullable on purpose. Extraction systems fail most
 * often by inventing a value for something the speaker never mentioned, so the
 * schema must make "absent" as easy to express as "present".
 */
export const ObservationCoreSchema = z.object({
  type: ObservationTypeSchema,
  outletId: z.string().nullable(),
  skuId: z.string().nullable(),
  competitorBrand: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  priceDelta: z.number().nullable(),
  severity: SeveritySchema,
  /** The rep's own words for this observation, in Bangla. Never translated. */
  verbatimBn: z.string(),
});
export type ObservationCore = z.infer<typeof ObservationCoreSchema>;

/** Per-field confidence, keyed by field name of ObservationCore. */
export const FieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

export const ObservationSchema = ObservationCoreSchema.extend({
  observationId: z.string().min(1),
  clipId: z.string().min(1),
  companyId: z.string().min(1),
  repId: z.string().min(1),

  status: ObservationStatusSchema,
  fieldConfidence: FieldConfidenceSchema,
  /** Names of fields that fell below threshold and drove the status. */
  flaggedFields: z.array(z.string()).default([]),

  recordedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Observation = z.infer<typeof ObservationSchema>;

/**
 * A clip is one recording. It owns the audio and the transcript; observations
 * are its children.
 */
export const ClipStatusSchema = z.enum([
  "queued",
  "processing",
  "processed",
  "failed",
]);
export type ClipStatus = z.infer<typeof ClipStatusSchema>;

export const ClipSchema = z.object({
  clipId: z.string().min(1),
  companyId: z.string().min(1),
  repId: z.string().min(1),
  /** Client-generated UUID. The idempotency key for at-least-once delivery. */
  clientUuid: z.string().min(1),

  storageKey: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  durationSec: z.number().nullable(),

  /** Captured in the PWA at record time. Unrecoverable afterwards — the rep moves. */
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  /** Outlet the rep confirmed at record time, when they did. */
  declaredOutletId: z.string().nullable(),

  status: ClipStatusSchema,
  error: z.string().nullable().default(null),

  transcriptText: z.string().nullable().default(null),
  observationCount: z.number().int().default(0),

  recordedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Clip = z.infer<typeof ClipSchema>;

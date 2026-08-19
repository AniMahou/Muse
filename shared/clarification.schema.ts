import { z } from "zod";

/**
 * A single question put to a field representative.
 *
 * The design rule that governs this whole module: ONE TAP, never a
 * re-recording. By the time a prompt reaches the rep he is on a motorbike
 * between outlets. Asking him to record again means he never answers, and an
 * unanswered prompt is a permanently uncertain record.
 */
export const ClarificationKindSchema = z.enum([
  "outlet", // which shop was this?
  "sku", // which product?
  "quantity", // how many?
  "competitor_brand", // which competitor?
]);
export type ClarificationKind = z.infer<typeof ClarificationKindSchema>;

export const ClarificationStatusSchema = z.enum([
  "pending",
  "answered",
  /** Timed out; the best guess was kept and the record stays flagged. */
  "auto_resolved",
  /** The parent observation was corrected or discarded before an answer came. */
  "cancelled",
]);
export type ClarificationStatus = z.infer<typeof ClarificationStatusSchema>;

export const ClarificationOptionSchema = z.object({
  /** Value written back to the observation field when chosen. */
  value: z.union([z.string(), z.number()]),
  /** What the rep reads. Bangla where the value is an identifier. */
  label: z.string(),
  /** Confidence that produced this ordering, for the review UI. */
  score: z.number().min(0).max(1).optional(),
});
export type ClarificationOption = z.infer<typeof ClarificationOptionSchema>;

export const ClarificationSchema = z.object({
  clarificationId: z.string().min(1),
  companyId: z.string().min(1),
  repId: z.string().min(1),
  observationId: z.string().min(1),
  clipId: z.string().min(1),

  kind: ClarificationKindSchema,
  field: z.string().min(1),
  /** Short Bangla question, e.g. "বিজয় স্টোর?" or "১২ না ১৮ কার্টন?" */
  question: z.string().min(1),
  options: z.array(ClarificationOptionSchema).min(1),

  /** What the pipeline chose. Kept if the prompt times out. */
  currentValue: z.union([z.string(), z.number()]).nullable(),
  confidence: z.number().min(0).max(1),

  status: ClarificationStatusSchema,
  answeredValue: z.union([z.string(), z.number()]).nullable().default(null),
  answeredAt: z.string().datetime().nullable().default(null),
  /**
   * True when an answer arrived AFTER the timeout already resolved it.
   *
   * The edge case that would otherwise be lost: the record was confirmed with
   * a best guess and pushed to the dashboard, and the late answer must still
   * patch it and re-emit rather than being dropped as stale.
   */
  answeredLate: z.boolean().default(false),

  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type Clarification = z.infer<typeof ClarificationSchema>;

/**
 * A surface form the resolver could not confidently match.
 *
 * These are the raw material of the learning loop. Every uncertain match is
 * recorded here with its count, an admin approves the good ones once, and the
 * resolver stops asking. Approval is what turns the review queue from a
 * cleanup chore into the mechanism that improves the system.
 */
export const AliasCandidateSchema = z.object({
  candidateId: z.string().min(1),
  companyId: z.string().min(1),
  /** As heard, e.g. "হইল". */
  surface: z.string().min(1),
  /** Best guess from the resolver, if it had one. */
  suggestedSkuId: z.string().nullable(),
  suggestedName: z.string().nullable(),
  bestScore: z.number().min(0).max(1),
  bestMargin: z.number().min(0).max(1),
  /** How many times this form has been heard. Ranks the approval queue. */
  occurrences: z.number().int().min(1),
  /** Clips it appeared in, capped, so a reviewer can listen before deciding. */
  sampleClipIds: z.array(z.string()).default([]),

  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  resolvedSkuId: z.string().nullable().default(null),
  reviewedBy: z.string().nullable().default(null),
  reviewedAt: z.string().datetime().nullable().default(null),

  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type AliasCandidate = z.infer<typeof AliasCandidateSchema>;

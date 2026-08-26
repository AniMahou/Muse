import { z } from "zod";
import { SeveritySchema } from "./observation.schema";

/**
 * A corroborated signal.
 *
 * The distinction this type exists to draw: an observation is one rep saying
 * one thing, and an alert is several independent outlets saying the same
 * thing. One rep reporting a competitor promo is an anecdote — he may have
 * misheard, or the shopkeeper may have exaggerated. Seven outlets reporting it
 * inside a day is a campaign, and it is the difference between data a brand
 * manager scrolls past and data they act on.
 *
 * Everything before this schema captures and structures. This is the first
 * thing in the system that asks anyone to DO something.
 */

/**
 * Not every observation type can corroborate.
 *
 * A demand signal is specific to one shop — two shops ordering juice is not a
 * pattern, it is Tuesday. A complaint is a single retailer's opinion. What
 * corroborates is a market condition several outlets can independently
 * witness: a rival's promotion, a product missing from shelves, a price move.
 */
export const AlertKindSchema = z.enum(["competitor_promo", "stock_out", "price_change"]);
export type AlertKind = z.infer<typeof AlertKindSchema>;

export const AlertStatusSchema = z.enum([
  /** Raised, nobody has picked it up. The clock is running. */
  "open",
  /** A human at HQ has seen it and taken ownership. Stops the clock. */
  "acknowledged",
  /** Seen and judged not worth acting on. Also stops the clock — deliberately. */
  "dismissed",
]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const AlertSchema = z.object({
  alertId: z.string().min(1),
  companyId: z.string().min(1),

  kind: AlertKindSchema,
  /**
   * What the outlets agree about — a competitor id for a promo, a SKU id for
   * a stock-out or price move. Together with `kind` this identifies the
   * market event, and it is what deduplicates: one open alert per pair, with
   * later outlets joining the existing alert instead of raising another.
   */
  key: z.string().min(1),

  /**
   * The distinct outlets that reported it. This is the evidence, and its
   * length is the reason to believe the alert — which is why it is a set of
   * outlets and not a count of observations. One talkative rep repeating
   * himself must not be able to raise an alert on his own.
   */
  outletIds: z.array(z.string()).default([]),
  observationIds: z.array(z.string()).default([]),

  severity: SeveritySchema,

  /** When the earliest contributing observation was recorded in the field. */
  firstSeenAt: z.string().datetime(),
  /** When corroboration crossed the threshold and this became an alert. */
  raisedAt: z.string().datetime(),

  status: AlertStatusSchema,
  /**
   * When a human took it. `acknowledgedAt − raisedAt` is the one operational
   * number this product can honestly claim to move: not whether a stock-out
   * was fixed, which is the distributor's job, but how long it took anyone to
   * know. Today that gap is measured in weeks.
   */
  acknowledgedAt: z.string().datetime().nullable().default(null),
  acknowledgedBy: z.string().nullable().default(null),
  note: z.string().nullable().default(null),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Alert = z.infer<typeof AlertSchema>;

/** Seconds between an alert being raised and a human taking it. */
export function responseSeconds(a: Pick<Alert, "raisedAt" | "acknowledgedAt">): number | null {
  if (!a.acknowledgedAt) return null;
  return (Date.parse(a.acknowledgedAt) - Date.parse(a.raisedAt)) / 1000;
}

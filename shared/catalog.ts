import { z } from "zod";

/**
 * Master data.
 *
 * Muse is NOT the system of record for products, outlets or reps — those are
 * imported from the customer's existing systems (SAP, a DMS, an SFA). The one
 * table Muse genuinely owns is `Alias`, the phonetic variant layer, which is
 * precisely the thing no existing system provides.
 */

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const SkuSchema = z.object({
  skuId: z.string().min(1),
  companyId: z.string().min(1),
  name: z.string().min(1),
  /** Brand this SKU belongs to. Used to scope a rep's candidate set. */
  brand: z.string().min(1),
  /**
   * Parent company, where it differs from the brand.
   *
   * Reps say the manufacturer as readily as the brand — "Unilever এর নতুন
   * অফার" is ordinary speech, and Lux, Surf Excel, Wheel and Rin are all
   * Unilever. Without this, the most natural way to refer to a portfolio
   * resolves to nothing at all.
   */
  manufacturer: z.string().optional(),
  /** Free-form pack descriptor, e.g. "250ml", "1L", "80g". */
  pack: z.string().optional(),
  /** True when this represents a *competitor* product rather than our own. */
  isCompetitor: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type Sku = z.infer<typeof SkuSchema>;

/**
 * A spoken or mis-transcribed form that maps to a SKU.
 *
 * Aliases are how the system learns. When the resolver repeatedly sees a form
 * it cannot confidently match, an admin approves it here once and the resolver
 * never asks again.
 */
export const AliasSchema = z.object({
  aliasId: z.string().min(1),
  companyId: z.string().min(1),
  skuId: z.string().min(1),
  /** The surface form as heard, e.g. "হইল" for Wheel. */
  surface: z.string().min(1),
  source: z.enum(["seed", "admin_approved", "import"]).default("admin_approved"),
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),
});
export type Alias = z.infer<typeof AliasSchema>;

export const OutletSchema = z.object({
  outletId: z.string().min(1),
  companyId: z.string().min(1),
  name: z.string().min(1),
  territoryId: z.string().optional(),
  geo: GeoPointSchema,
  address: z.string().optional(),
  active: z.boolean().default(true),
});
export type Outlet = z.infer<typeof OutletSchema>;

export const TerritorySchema = z.object({
  territoryId: z.string().min(1),
  companyId: z.string().min(1),
  name: z.string().min(1),
});
export type Territory = z.infer<typeof TerritorySchema>;

/**
 * A field representative.
 *
 * `territoryId` + `brandPortfolio` are not bookkeeping — they scope the SKU
 * candidate set before matching runs. A rep sells 50-200 SKUs, not the
 * company's full catalogue of thousands, so scoping turns a large-catalogue
 * matching problem back into a small one AND removes confusable candidates
 * the rep could not possibly have said. This is the mechanism that keeps the
 * resolver accurate at enterprise scale.
 */
export const RepSchema = z.object({
  repId: z.string().min(1),
  companyId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  territoryId: z.string().optional(),
  brandPortfolio: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});
export type Rep = z.infer<typeof RepSchema>;

export const CompanySchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  brands: z.array(z.string()).default([]),
  /** Open-join sandbox tenant used for the exhibition booth. */
  isDemo: z.boolean().default(false),
  /**
   * Bearer credential for the admin console.
   *
   * Deliberately separate from a rep's token: a rep token can only hand in a
   * recording, while this one reads the company's whole field intelligence and
   * rewrites its master data.
   */
  adminToken: z.string().optional(),
});
export type Company = z.infer<typeof CompanySchema>;

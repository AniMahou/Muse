/**
 * The demo tenant's catalogue, as data.
 *
 * Extracted from seed-catalog.ts so that anything else needing to know what is
 * in the catalogue can import it without connecting to Mongo — and, more
 * importantly, without running the seed as a side effect.
 *
 * The evaluation crib sheet is generated from exactly this, which is the point:
 * a labeller reading one list and a resolver matching against another is how a
 * dataset quietly becomes wrong.
 */
import type { Alias, Company, Outlet, Rep, Sku, Territory } from "@shared/catalog";

export const COMPANY_ID = "demo-fmcg";
export const TERRITORY_ID = "T-MIRPUR";
export const BASE = { lat: 23.7806, lng: 90.4074 };

export const company: Company = {
  companyId: COMPANY_ID,
  name: "Demo FMCG Ltd",
  adminToken: process.env.SEED_ADMIN_TOKEN ?? "dev-admin-muse",
  brands: ["PRAN", "Surf Excel", "Lux", "Sunsilk", "Clear", "Harpic", "Colgate"],
  isDemo: true,
};

export const territory: Territory = {
  territoryId: TERRITORY_ID,
  companyId: COMPANY_ID,
  name: "Mirpur-2",
};

const sku = (skuId: string, name: string, brand: string, extra: Partial<Sku> = {}): Sku => ({
  skuId, companyId: COMPANY_ID, name, brand, isCompetitor: false, active: true, ...extra,
});

export const skus: Sku[] = [
  sku("SKU-404", "PRAN Mango Juice", "PRAN", { pack: "250ml" }),
  sku("SKU-407", "PRAN Mango Drink", "PRAN", { pack: "1L" }),
  sku("SKU-410", "PRAN Litchi Juice", "PRAN", { pack: "250ml" }),
  sku("SKU-420", "PRAN Chanachur", "PRAN", { pack: "150g" }),
  sku("SKU-501", "Surf Excel Powder", "Surf Excel", { pack: "500g", manufacturer: "Unilever" }),
  sku("SKU-502", "Lux Soap", "Lux", { pack: "100g", manufacturer: "Unilever" }),
  sku("SKU-504", "Sunsilk Shampoo", "Sunsilk", { pack: "180ml", manufacturer: "Unilever" }),
  sku("SKU-505", "Clear Shampoo", "Clear", { pack: "180ml", manufacturer: "Unilever" }),
  sku("SKU-503", "Harpic Toilet Cleaner", "Harpic", { pack: "500ml", manufacturer: "Reckitt" }),
  sku("SKU-601", "Colgate Toothpaste", "Colgate", { pack: "100g", manufacturer: "Colgate" }),
  sku("COMP-WHEEL", "Wheel", "Wheel", { isCompetitor: true, manufacturer: "Unilever" }),
  sku("COMP-WHITEPLUS", "White Plus", "White Plus", { isCompetitor: true }),
  sku("COMP-RIN", "Rin Powder", "Rin", { isCompetitor: true, manufacturer: "Unilever" }),
];

export const aliases: Alias[] = [
  { aliasId: "AL-1", companyId: COMPANY_ID, skuId: "SKU-420", surface: "চানাচুর", source: "seed" },
];

const at = (dLat: number, dLng: number) => ({ lat: BASE.lat + dLat, lng: BASE.lng + dLng });

export const outlets: Outlet[] = [
  { outletId: "OUT-1182", companyId: COMPANY_ID, name: "Bijoy Store", geo: at(0.00016, 0), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1183", companyId: COMPANY_ID, name: "Rahman Store", geo: at(0.00009, 0.00008), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1184", companyId: COMPANY_ID, name: "New Alam Enterprise", geo: at(-0.00014, 0.00005), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1185", companyId: COMPANY_ID, name: "Shanto General Store", geo: at(0.0004, 0.0003), territoryId: TERRITORY_ID, active: true },
];

/** The rep the demo tenant ships with. `brandPortfolio` scopes the SKU candidate set. */
export const repBase: Rep = {
  repId: "REP-1",
  companyId: COMPANY_ID,
  name: "Rahim Uddin",
  territoryId: TERRITORY_ID,
  brandPortfolio: ["PRAN", "Surf Excel", "Lux", "Sunsilk", "Clear"],
  active: true,
};

export const skuById = new Map(skus.map((s) => [s.skuId, s]));
export const outletById = new Map(outlets.map((o) => [o.outletId, o]));

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

  // Round-two recordings used a far wider range of real Bangladeshi FMCG
  // brands than the original thirteen. Adding them is not bookkeeping: a
  // catalogue of unambiguous products makes the resolver look better than it
  // is, and these bring genuine near-neighbours — three noodle brands, two
  // teas, two toothpastes, two cooking oils — which is what a real catalogue
  // looks like and what the margin signal exists to handle.
  sku("SKU-700", "Taaza Tea", "Taaza", { pack: "400g", manufacturer: "Unilever" }),
  sku("SKU-701", "Pepsodent Toothpaste", "Pepsodent", { pack: "100g", manufacturer: "Unilever" }),
  sku("SKU-702", "Closeup Toothpaste", "Closeup", { pack: "100g", manufacturer: "Unilever" }),
  sku("SKU-703", "Ispahani Mirzapore Tea", "Ispahani", { pack: "400g", manufacturer: "Ispahani" }),
  sku("SKU-704", "Meril Petroleum Jelly", "Meril", { pack: "100ml", manufacturer: "Square" }),
  sku("SKU-705", "Radhuni Halim Mix", "Radhuni", { pack: "200g", manufacturer: "Square" }),
  sku("SKU-706", "Bashundhara Tissue", "Bashundhara", { pack: "100 pcs", manufacturer: "Bashundhara" }),
  sku("SKU-707", "Fresh Soybean Oil", "Fresh", { pack: "1L", manufacturer: "Meghna" }),
  sku("SKU-708", "Parachute Coconut Oil", "Parachute", { pack: "200ml", manufacturer: "Marico" }),
  sku("SKU-709", "Olympic Energy Biscuit", "Olympic", { pack: "100g", manufacturer: "Olympic" }),
  sku("SKU-710", "Cocola Noodles", "Cocola", { pack: "70g", manufacturer: "Cocola" }),
  sku("SKU-711", "Mojo", "Mojo", { pack: "250ml", manufacturer: "Akij" }),
  sku("SKU-712", "Clemon", "Clemon", { pack: "250ml", manufacturer: "Akij" }),
  sku("SKU-713", "Tibet Pomade", "Tibet", { pack: "50g", manufacturer: "Kohinoor" }),
  sku("SKU-714", "Chaka Washing Powder", "Chaka", { pack: "500g", manufacturer: "Kallol" }),
  sku("COMP-MRNOODLES", "Mr. Noodles", "Mr. Noodles", { isCompetitor: true, manufacturer: "Pran" }),
  sku("COMP-MAGGI", "Maggi Noodles", "Maggi", { isCompetitor: true, manufacturer: "Nestle" }),
  sku("COMP-BOMBAY", "Bombay Sweets", "Bombay Sweets", { isCompetitor: true }),
  sku("COMP-ARIEL", "Ariel Powder", "Ariel", { isCompetitor: true, manufacturer: "P&G" }),
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

  // The round-two outlets. Spread a little wider than the original cluster so
  // GPS narrows the candidate set without deciding it — which is the situation
  // stage 4 was built for, and the one the first four outlets were too tightly
  // packed to exercise across a whole route.
  { outletId: "OUT-1186", companyId: COMPANY_ID, name: "Bhai Bhai Traders", geo: at(0.0011, -0.0004), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1187", companyId: COMPANY_ID, name: "Mayer Doa Store", geo: at(-0.0009, 0.0012), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1188", companyId: COMPANY_ID, name: "Bismillah Enterprise", geo: at(0.0016, 0.0008), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1189", companyId: COMPANY_ID, name: "Jononi General Store", geo: at(-0.0014, -0.0011), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1190", companyId: COMPANY_ID, name: "Tasmia Traders", geo: at(0.0007, 0.0019), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1191", companyId: COMPANY_ID, name: "Sikder Mart", geo: at(-0.0018, 0.0006), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1192", companyId: COMPANY_ID, name: "Rony Store", geo: at(0.0021, -0.0013), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1193", companyId: COMPANY_ID, name: "Medina Enterprise", geo: at(-0.0006, -0.0017), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1194", companyId: COMPANY_ID, name: "Al-Amin Traders", geo: at(0.0013, 0.0022), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1195", companyId: COMPANY_ID, name: "Milon Store", geo: at(-0.0022, 0.0015), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1196", companyId: COMPANY_ID, name: "Tara Mart", geo: at(0.0025, 0.0004), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1197", companyId: COMPANY_ID, name: "Haque Enterprise", geo: at(-0.0011, 0.0024), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1198", companyId: COMPANY_ID, name: "Zaman Store", geo: at(0.0019, -0.0021), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1199", companyId: COMPANY_ID, name: "Jannat General Store", geo: at(-0.0025, -0.0007), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1200", companyId: COMPANY_ID, name: "Kazi Brothers", geo: at(0.0009, -0.0026), territoryId: TERRITORY_ID, active: true },
];

/** The rep the demo tenant ships with. `brandPortfolio` scopes the SKU candidate set. */
export const repBase: Rep = {
  repId: "REP-1",
  companyId: COMPANY_ID,
  name: "Rahim Uddin",
  territoryId: TERRITORY_ID,
  brandPortfolio: [
    "PRAN", "Surf Excel", "Lux", "Sunsilk", "Clear",
    "Taaza", "Pepsodent", "Closeup", "Ispahani", "Meril", "Radhuni",
    "Bashundhara", "Fresh", "Parachute", "Olympic", "Cocola", "Mojo",
    "Clemon", "Tibet", "Chaka",
  ],
  active: true,
};

export const skuById = new Map(skus.map((s) => [s.skuId, s]));
export const outletById = new Map(outlets.map((o) => [o.outletId, o]));

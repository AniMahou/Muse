import type { Alias, Sku } from "@shared/catalog";

const C = "acme-bd";

const sku = (
  skuId: string,
  name: string,
  brand: string,
  extra: Partial<Sku> = {},
): Sku => ({
  skuId,
  companyId: C,
  name,
  brand,
  isCompetitor: false,
  active: true,
  ...extra,
});

/**
 * A representative slice of a Bangladeshi FMCG catalogue: our own brands
 * across several categories, plus the competitor brands a rep would report on.
 * Deliberately includes near-neighbours (PRAN Mango Juice 250ml vs 1L, Wheel
 * vs White Plus) so the margin signal has something real to work against.
 */
export const SKUS: Sku[] = [
  sku("SKU-404", "PRAN Mango Juice", "PRAN", { pack: "250ml" }),
  sku("SKU-407", "PRAN Mango Drink", "PRAN", { pack: "1L" }),
  sku("SKU-410", "PRAN Litchi Juice", "PRAN", { pack: "250ml" }),
  sku("SKU-420", "PRAN Chanachur", "PRAN", { pack: "150g" }),
  sku("SKU-501", "Surf Excel Powder", "Surf Excel", { pack: "500g" }),
  sku("SKU-502", "Lux Soap", "Lux", { pack: "100g" }),
  sku("SKU-503", "Harpic Toilet Cleaner", "Harpic", { pack: "500ml" }),
  sku("SKU-601", "Colgate Toothpaste", "Colgate", { pack: "100g" }),

  sku("COMP-WHEEL", "Wheel", "Wheel", { isCompetitor: true }),
  sku("COMP-WHITEPLUS", "White Plus", "White Plus", { isCompetitor: true }),
  sku("COMP-RIN", "Rin Powder", "Rin", { isCompetitor: true }),
];

export const ALIASES: Alias[] = [
  {
    aliasId: "AL-1",
    companyId: C,
    skuId: "SKU-420",
    // An approved alias for a form phonetic matching alone would not reach.
    surface: "চানাচুর",
    source: "admin_approved",
  },
];

export const COMPANY_ID = C;

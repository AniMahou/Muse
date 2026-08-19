/**
 * Seeds a demo tenant: company, rep, territory, SKUs, aliases and outlets.
 *
 * Two things worth knowing about the data it writes.
 *
 * The SKU list contains deliberate near-neighbours (PRAN Mango Juice 250ml
 * beside PRAN Mango Drink 1L, Wheel beside White Plus) so the resolver margin
 * has something real to work against. A catalogue of unambiguous products
 * would make the system look better than it is.
 *
 * The outlets sit within twenty metres of each other, which is the situation
 * stage 4 exists for — GPS alone cannot separate them and the spoken name has
 * to decide.
 *
 *   npm run seed:catalog
 */
import { randomUUID } from "node:crypto";
import { connectMongo, collections, ensureIndexes, closeMongo, toOutletDoc } from "@/db/client";
import { logger } from "@/common/logger";
import type { Alias, Company, Outlet, Rep, Sku, Territory } from "@shared/catalog";

const COMPANY_ID = "demo-fmcg";
const TERRITORY_ID = "T-MIRPUR";
const BASE = { lat: 23.7806, lng: 90.4074 };

const ADMIN_TOKEN = process.env.SEED_ADMIN_TOKEN ?? "dev-admin-muse";

const company: Company = {
  companyId: COMPANY_ID,
  name: "Demo FMCG Ltd",
  adminToken: ADMIN_TOKEN,
  brands: ["PRAN", "Surf Excel", "Lux", "Sunsilk", "Clear", "Harpic", "Colgate"],
  isDemo: true,
};

const territory: Territory = {
  territoryId: TERRITORY_ID,
  companyId: COMPANY_ID,
  name: "Mirpur-2",
};

const sku = (skuId: string, name: string, brand: string, extra: Partial<Sku> = {}): Sku => ({
  skuId, companyId: COMPANY_ID, name, brand, isCompetitor: false, active: true, ...extra,
});

const skus: Sku[] = [
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

const aliases: Alias[] = [
  {
    aliasId: "AL-1",
    companyId: COMPANY_ID,
    skuId: "SKU-420",
    surface: "চানাচুর",
    source: "seed",
  },
];

const at = (dLat: number, dLng: number) => ({ lat: BASE.lat + dLat, lng: BASE.lng + dLng });

const outlets: Outlet[] = [
  { outletId: "OUT-1182", companyId: COMPANY_ID, name: "Bijoy Store", geo: at(0.00016, 0), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1183", companyId: COMPANY_ID, name: "Rahman Store", geo: at(0.00009, 0.00008), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1184", companyId: COMPANY_ID, name: "New Alam Enterprise", geo: at(-0.00014, 0.00005), territoryId: TERRITORY_ID, active: true },
  { outletId: "OUT-1185", companyId: COMPANY_ID, name: "Shanto General Store", geo: at(0.0004, 0.0003), territoryId: TERRITORY_ID, active: true },
];

async function main(): Promise<void> {
  const db = await connectMongo();
  await ensureIndexes(db);
  const c = collections(db);

  const inviteToken = process.env.SEED_REP_TOKEN ?? randomUUID();
  const rep: Rep & { inviteToken: string } = {
    repId: "REP-1",
    companyId: COMPANY_ID,
    name: "Rahim Uddin",
    territoryId: TERRITORY_ID,
    // Scoping to a portfolio is what keeps the resolver accurate at scale;
    // seeding it makes the demo exercise that path rather than bypass it.
    brandPortfolio: ["PRAN", "Surf Excel", "Lux", "Sunsilk", "Clear"],
    active: true,
    inviteToken,
  };

  await c.companies.updateOne({ companyId: COMPANY_ID }, { $set: company }, { upsert: true });
  await c.territories.updateOne({ territoryId: TERRITORY_ID }, { $set: territory }, { upsert: true });
  await c.reps.updateOne({ repId: rep.repId }, { $set: rep }, { upsert: true });

  for (const s of skus) {
    await c.skus.updateOne({ companyId: COMPANY_ID, skuId: s.skuId }, { $set: s }, { upsert: true });
  }
  for (const a of aliases) {
    await c.aliases.updateOne(
      { companyId: COMPANY_ID, surface: a.surface, skuId: a.skuId },
      { $set: a },
      { upsert: true },
    );
  }
  for (const o of outlets) {
    await c.outlets.updateOne(
      { companyId: COMPANY_ID, outletId: o.outletId },
      { $set: toOutletDoc(o) },
      { upsert: true },
    );
  }

  logger.info(
    { company: COMPANY_ID, skus: skus.length, outlets: outlets.length, aliases: aliases.length },
    "seed complete",
  );

  console.log("\n────────────────────────────────────────────────────────");
  console.log("  Demo tenant ready.");
  console.log(`  companyId : ${COMPANY_ID}`);
  console.log(`  repId     : ${rep.repId}`);
  console.log(`  rep token : ${inviteToken}`);
  console.log(`  admin tok : ${ADMIN_TOKEN}`);
  console.log(`  GPS        : ${BASE.lat}, ${BASE.lng}  (inside the outlet cluster)`);
  console.log("\n  Upload a clip:");
  console.log(`    curl -X POST http://localhost:4000/api/observations \\`);
  console.log(`      -H "Authorization: Bearer ${inviteToken}" \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(`      -d '{"clientUuid":"'$(uuidgen)'","audioBase64":"<base64>",`);
  console.log(`           "mimeType":"audio/webm","geo":{"lat":${BASE.lat},"lng":${BASE.lng}},`);
  console.log(`           "declaredOutletId":null,"recordedAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'`);
  console.log("────────────────────────────────────────────────────────\n");

  await closeMongo();
}

main().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});

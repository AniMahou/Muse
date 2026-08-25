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
import type { Rep } from "@shared/catalog";
import {
  COMPANY_ID, TERRITORY_ID, BASE,
  company, territory, skus, aliases, outlets, repBase,
} from "./seed-data";

const ADMIN_TOKEN = company.adminToken ?? "dev-admin-muse";

async function main(): Promise<void> {
  const db = await connectMongo();
  await ensureIndexes(db);
  const c = collections(db);

  const inviteToken = process.env.SEED_REP_TOKEN ?? randomUUID();
  // Scoping to a portfolio is what keeps the resolver accurate at scale;
  // seeding it makes the demo exercise that path rather than bypass it.
  const rep: Rep & { inviteToken: string } = { ...repBase, inviteToken };

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

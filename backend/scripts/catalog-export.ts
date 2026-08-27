/**
 * Dump the catalogue as JSON for the ML tooling.
 *
 *   npm run catalog:export
 *
 * The synthetic image generator needs to know what words will appear on a
 * price tag, and those words are the customer's own products. Exporting rather
 * than reimplementing keeps one source of truth: the generator trains on the
 * same names the resolver matches against, so a rename cannot leave the model
 * fluent in vocabulary the catalogue no longer contains.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { skus, outlets, COMPANY_ID } from "./seed-data";

const OUT = path.resolve(process.cwd(), "../ml/data/catalog.json");

async function main(): Promise<void> {
  const payload = {
    companyId: COMPANY_ID,
    exportedAt: new Date().toISOString(),
    skus: skus.map((s) => ({
      skuId: s.skuId,
      name: s.name,
      brand: s.brand,
      pack: s.pack ?? null,
      isCompetitor: s.isCompetitor,
    })),
    outlets: outlets.map((o) => ({ outletId: o.outletId, name: o.name })),
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`  wrote ${path.relative(process.cwd(), OUT)} — ${payload.skus.length} skus, ${payload.outlets.length} outlets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

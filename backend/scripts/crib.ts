/**
 * Generates datasets/CRIB.md — every identifier a labeller is allowed to write.
 *
 * The failure this prevents is specific and expensive. A label is valid to the
 * schema as long as skuId is *a string*, so an invented id like "SKU-999"
 * passes validation, reaches the evaluation, and is silently counted as a
 * wrong answer by the system rather than a wrong answer by the labeller. The
 * accuracy number drops and nothing anywhere says why.
 *
 * Generated from scripts/seed-data.ts rather than hand-maintained, because a
 * crib sheet that has drifted from the catalogue is worse than none at all.
 *
 *   npm run crib
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { skus, outlets, repBase, BASE, COMPANY_ID } from "./seed-data";

const OUT = path.resolve(process.cwd(), "datasets/CRIB.md");

function table(rows: string[][], head: string[]): string {
  const line = (r: string[]) => `| ${r.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
}

async function main(): Promise<void> {
  const ours = skus.filter((s) => !s.isCompetitor);
  const rivals = skus.filter((s) => s.isCompetitor);
  const inPortfolio = (brand: string) => repBase.brandPortfolio.includes(brand);

  const md = `# Catalogue crib sheet

**Generated — do not edit by hand.** Run \`npm run crib\` after changing the seed.

Every \`sku_id\`, \`competitor_brand\` and \`outlet_id\` written into ground truth
must appear in one of these tables, spelled exactly as shown.

Tenant \`${COMPANY_ID}\` · rep \`${repBase.repId}\` (${repBase.name}) · territory \`${repBase.territoryId}\`

---

## Our products — the \`sku_id\` column

\`✓\` means the SKU is inside rep ${repBase.repId}'s brand portfolio, so it resolves both in the
evaluation *and* in the live app. A \`✗\` SKU still resolves in the evaluation — which
passes no brand scope — but is filtered out for this rep in the running product, so
prefer \`✓\` rows when writing cards you also intend to demo.

${table(
  ours.map((s) => [
    `\`${s.skuId}\``,
    s.name,
    s.brand,
    s.pack ?? "—",
    s.manufacturer ?? "—",
    inPortfolio(s.brand) ? "✓" : "✗",
  ]),
  ["sku_id", "name", "brand", "pack", "manufacturer", "in portfolio"],
)}

## Competitors — the \`competitor_brand\` column

Competitors are **always** in scope; brand portfolio does not filter them.

Note the column these belong in. A competitor id goes in \`competitor_brand\`, never in
\`sku_id\` — stage 5 builds them into two separate enums, so a competitor written into
\`sku_id\` can never be matched and scores as a miss.

${table(
  rivals.map((s) => [`\`${s.skuId}\``, s.name, s.manufacturer ?? "—"]),
  ["competitor_brand", "name", "manufacturer"],
)}

## Outlets — the \`outlet_id\` column

All four sit within roughly forty metres of each other. That is deliberate: GPS alone
cannot separate them, so the spoken name has to decide, which is the whole reason
stage 4 exists.

${table(
  outlets.map((o) => [
    `\`${o.outletId}\``,
    o.name,
    `${o.geo.lat.toFixed(5)}, ${o.geo.lng.toFixed(5)}`,
  ]),
  ["outlet_id", "name", "lat, lng"],
)}

Recording GPS for the whole set: \`${BASE.lat}, ${BASE.lng}\` — inside the cluster.
You never type coordinates; \`npm run labels:build\` fills them from \`outlet_id\`.

---

## Observation types — the \`type\` column

| type | means | fields that carry the meaning |
|---|---|---|
| \`demand_signal\` | shop wants to order something | \`sku_id\`, \`quantity\`, \`unit\` |
| \`stock_out\` | shop has run out | \`sku_id\` |
| \`competitor_promo\` | a rival is running an offer | \`competitor_brand\`, \`price_delta\` |
| \`price_change\` | our price moved | \`sku_id\`, \`price_delta\` |
| \`retailer_complaint\` | shopkeeper is unhappy | \`sku_id\` (optional) |
| \`posm_issue\` | poster, display or branding problem | \`outlet_id\` only |

## Units — the \`unit\` column

\`piece\` · \`carton\` · \`sack\` · \`box\` · \`packet\` · \`bottle\` · \`crate\` · \`kg\` · \`g\` · \`litre\` · \`ml\` · \`BDT\`

## Bangla quantities — what \`quantity\` should say

Quantity is the **resolved number**, never the words. দেড় ডজন is \`18\`, not \`1.5\`.

| spoken | value | worked example |
|---|---|---|
| আধা | 0.5 | |
| দেড় | 1.5 | দেড় ডজন → 1.5 × 12 = **18** |
| আড়াই | 2.5 | আড়াই ডজন → 2.5 × 12 = **30** |
| সাড়ে X | X + 0.5 | সাড়ে তিন কার্টন → **3.5** |
| সোয়া X | X + 0.25 | সোয়া দুই কার্টন → **2.25** |
| **পৌনে X** | **X − 0.25** | পৌনে তিন কার্টন → **2.75** (it subtracts) |
| ডজন | × 12 | |
| হালি | × 4 | দুই হালি → 2 × 4 = **8** |
| কুড়ি | 20 | |

---

## Not scored — do not agonise

The evaluation scores exactly six fields: \`type\`, \`outlet_id\`, \`sku_id\`,
\`competitor_brand\`, \`quantity\`, \`price_delta\`.

\`severity\`, \`unit\` and \`verbatim_bn\` are recorded but **not** scored, so a judgement
call on severity cannot move the accuracy number. Fill them sensibly and move on.

## Sign conventions

\`price_delta\` is signed, in taka, from *our* point of view.
A competitor undercutting by 5 taka is \`-5\`. Our price rising 10 taka is \`+10\`.
Leave it empty when a promo was mentioned without a number.
`;

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, md, "utf8");
  console.log(`  wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  ${ours.length} skus · ${rivals.length} competitors · ${outlets.length} outlets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Freeze which photographs may be trained on and which may not.
 *
 *   npm run photos:split
 *   npm run photos:split -- --show
 *
 * Split BY PHOTOGRAPH, never by line. Two crops from the same photo share a
 * shop, a printer, a light source and usually a tag design; putting one in
 * train and the other in test would let the model memorise the answer and
 * report it as generalisation. The unit of independence here is the photo,
 * exactly as the unit for audio was the recording card.
 *
 * Stratified by location. Photos 001-013 are a small local shop shot at night
 * in hand; 014-028 are a lit supermarket. A split that drew all its test
 * photos from one of those would measure that one, so both are sampled.
 *
 * Written once and then refused. The value of a held-out set is entirely in
 * never having been optimised against, and a set that can be redrawn after a
 * disappointing number is not held out — it is a second opinion.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "datasets/photos");
const SPLIT = path.join(ROOT, "split.json");
const TEST_FRACTION = 0.3;

/** Photo ids at or below this came from the local shop; above, the supermarket. */
const LOCAL_SHOP_MAX = 13;

interface Split {
  createdAt: string;
  test: string[];
  train: string[];
  note: string;
}

/** Deterministic shuffle so the split is reproducible from the seed alone. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function photoIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const kind of ["printed", "handwritten"]) {
    const entries = await fs.readdir(path.join(ROOT, kind)).catch(() => []);
    for (const e of entries) {
      const m = /^(photo-\d{3})\./.exec(e);
      if (m) ids.add(m[1]!);
    }
  }
  return [...ids].sort();
}

function stratum(id: string): "local" | "market" {
  return Number(id.slice(-3)) <= LOCAL_SHOP_MAX ? "local" : "market";
}

async function main(): Promise<void> {
  const show = process.argv.includes("--show");
  const existing = await fs
    .readFile(SPLIT, "utf8")
    .then((r) => JSON.parse(r) as Split)
    .catch(() => null);

  if (existing) {
    console.log(`  frozen ${new Date(existing.createdAt).toLocaleString()}`);
    console.log(`  train  ${existing.train.length}: ${existing.train.join(" ")}`);
    console.log(`  test   ${existing.test.length}: ${existing.test.join(" ")}`);
    if (!show) {
      console.log("\n  Already drawn, and it will not be redrawn.");
      console.log("  A held-out set redrawn after a bad number is not held out.");
    }
    return;
  }

  const ids = await photoIds();
  if (ids.length === 0) {
    console.error("no photos — run: npm run photos -- <folder>");
    process.exitCode = 1;
    return;
  }

  const test: string[] = [];
  for (const group of ["local", "market"] as const) {
    const members = shuffled(
      ids.filter((id) => stratum(id) === group),
      group === "local" ? 20260829 : 20260830,
    );
    test.push(...members.slice(0, Math.max(1, Math.round(members.length * TEST_FRACTION))));
  }
  test.sort();
  const train = ids.filter((id) => !test.includes(id));

  const split: Split = {
    createdAt: new Date().toISOString(),
    test,
    train,
    note:
      "Split by photograph, stratified by location. Test photos must never be " +
      "fine-tuned on, and this file is not to be regenerated.",
  };
  await fs.writeFile(SPLIT, `${JSON.stringify(split, null, 2)}\n`, "utf8");

  console.log(`  ${ids.length} photos`);
  console.log(`  train ${train.length}: ${train.join(" ")}`);
  console.log(`  test  ${test.length}: ${test.join(" ")}`);
  console.log("\n  Frozen. Lines from test photos are for measuring only.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

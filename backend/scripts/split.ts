/**
 * Freeze a held-out test set.
 *
 *   npm run split              show the current split
 *   npm run split -- --create  create one (refuses if it already exists)
 *
 * Do this BEFORE tuning anything, because it cannot be done honestly
 * afterwards. Once you have looked at how a change performs on a clip, that
 * clip can no longer tell you whether the change generalises — and the whole
 * point of the next few months of work is knowing which improvements are real.
 *
 * The split is written to a committed file rather than recomputed, so it
 * survives clips being added later: a clip assigned to test stays in test for
 * the life of the project, and new clips join the pool that has room.
 *
 * Assignment is by CARD, not by clip. Card 7 recorded twice is the same
 * sentence, the same products and the same shop; putting one take in train and
 * the other in test would leak the answer and quietly inflate every number.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const DATASETS = path.resolve(process.cwd(), "datasets");
const SPLIT_FILE = path.join(DATASETS, "split.json");
const TEST_SHARE = 0.3;

export interface Split {
  createdAt: string;
  /** Held out. Never tuned against, never inspected while iterating. */
  test: string[];
  /** Everything else. Look at these as much as you like. */
  dev: string[];
  note: string;
}

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

export async function loadSplit(): Promise<Split | null> {
  try {
    return JSON.parse(await fs.readFile(SPLIT_FILE, "utf8")) as Split;
  } catch {
    return null;
  }
}

/** Which bucket a clip belongs to. Unassigned clips (recorded later) count as dev. */
export function bucketOf(split: Split | null, clipId: string): "dev" | "test" {
  if (!split) return "dev";
  return split.test.includes(cardOf(clipId)) ? "test" : "dev";
}

/** clip-07-b -> "07". Takes of one card must never straddle the split. */
export function cardOf(clipId: string): string {
  return /^clip-(\d{2})-/.exec(clipId)?.[1] ?? clipId;
}

/** Deterministic, so re-running never reshuffles what is already frozen. */
function mix(s: string): number {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  return Math.imul(h, 0x85ebca6b) >>> 0;
}

async function main(): Promise<void> {
  const create = process.argv.includes("--create");
  const existing = await loadSplit();

  if (existing && create) {
    console.log(c.red(`\n  A split already exists — refusing to overwrite it.\n`));
    console.log(c.dim(`  Re-drawing it after you have started tuning is how a held-out set`));
    console.log(c.dim(`  stops being held out. If you genuinely need a new one, delete`));
    console.log(c.dim(`  datasets/split.json by hand and know why you are doing it.\n`));
    process.exit(1);
  }

  if (existing) {
    console.log(`\n  ${c.bold("Split")} — frozen ${existing.createdAt.slice(0, 10)}\n`);
    console.log(`    ${c.green("dev ")} cards ${existing.dev.join(", ")}`);
    console.log(`    ${c.yellow("test")} cards ${existing.test.join(", ")}  ${c.dim("(do not look)")}`);
    console.log(c.dim(`\n    npm run eval -- --split dev    while iterating`));
    console.log(c.dim(`    npm run eval -- --split test   only to report\n`));
    return;
  }

  if (!create) {
    console.log(c.yellow(`\n  No split yet.  npm run split -- --create\n`));
    return;
  }

  const labels = await fs.readdir(path.join(DATASETS, "labels")).catch(() => [] as string[]);
  const cards = [...new Set(labels.filter((f) => f.endsWith(".json")).map((f) => cardOf(path.basename(f, ".json"))))].sort();

  if (cards.length === 0) {
    console.log(c.red(`\n  No labels in datasets/labels/ — nothing to split.\n`));
    process.exit(1);
  }

  const ranked = [...cards].sort((a, b) => mix(a) - mix(b));
  const testCount = Math.max(1, Math.round(cards.length * TEST_SHARE));
  const test = ranked.slice(0, testCount).sort();
  const dev = cards.filter((x) => !test.includes(x)).sort();

  const split: Split = {
    createdAt: new Date().toISOString(),
    test,
    dev,
    note:
      "Frozen held-out set. Assigned by card, so two takes of one sentence cannot " +
      "straddle the split. Do not evaluate against `test` while iterating, and do " +
      "not redraw it — a set you have tuned against is not held out.",
  };

  await fs.writeFile(SPLIT_FILE, JSON.stringify(split, null, 2) + "\n", "utf8");

  console.log(`\n  ${c.green("✓")} froze a held-out set — ${c.bold(String(test.length))} of ${cards.length} cards\n`);
  console.log(`    ${c.green("dev ")} ${dev.join(", ")}`);
  console.log(`    ${c.yellow("test")} ${test.join(", ")}`);
  console.log(c.dim(`\n    Commit datasets/split.json now. From here on:`));
  console.log(c.dim(`    npm run eval -- --split dev    while iterating`));
  console.log(c.dim(`    npm run eval -- --split test   only when reporting a number\n`));
}

if (process.argv[1]?.includes("split")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

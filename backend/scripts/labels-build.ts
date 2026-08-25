/**
 * Build datasets/labels/*.json from two spreadsheets.
 *
 *   npm run labels:check      validate only, write nothing
 *   npm run labels:build      validate and write
 *
 * Why two CSVs rather than hand-written JSON.
 *
 * ClipLabel is a nested object with an array of fully-specified observations.
 * Hand-writing forty of them in Bangla produces trailing commas, misspelled
 * enum members and invented identifiers — and eval/run.ts responds to an
 * invalid label by logging and CONTINUING, so a third of the set can vanish
 * without the reported clip count ever looking wrong.
 *
 * So the two halves are separated by who knows what:
 *
 *   ground-truth.csv   written once, in advance, by whoever wrote the cards.
 *                      The answer key. One row per expected observation.
 *   clips.csv          filled in by whoever recorded. Only what they can know:
 *                      which card, what was actually said, who said it, how
 *                      noisy it was.
 *
 * Nobody hand-labels an observation after listening to audio, which is the
 * step that silently corrupts a dataset when two people disagree about what
 * counts as `medium` severity.
 *
 * This script fails LOUDLY and cites the spreadsheet row, which is the whole
 * difference between it and the evaluation's own validation.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ClipLabelSchema, type ClipLabel } from "@shared/label.schema";
import type { ObservationCore } from "@shared/observation.schema";
import { parseCsv } from "@/catalog/csv";
import { skuById, outletById, BASE } from "./seed-data";

const RAW = path.resolve(process.cwd(), "datasets/raw");
const CLIPS = path.resolve(process.cwd(), "datasets/clips");
const LABELS = path.resolve(process.cwd(), "datasets/labels");

const NOISE = new Set(["quiet", "moderate", "loud"]);
const DIALECT = new Set(["dhaka", "chittagong", "sylhet", "other"]);
const CLIP_NAME = /^clip-\d{2}-[a-z]$/;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const problems: string[] = [];
const warnings: string[] = [];
const fail = (where: string, msg: string) => problems.push(`${c.bold(where)}  ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${c.bold(where)}  ${msg}`);

const num = (v: string): number | null => {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The rep's GPS, not the outlet's.
 *
 * Using each outlet's own coordinates would hand stage 4 the answer and make
 * outlet accuracy meaningless — the four demo outlets sit inside forty metres
 * precisely so the spoken name has to decide. This puts the phone where the
 * rep actually stands, with a few metres of deterministic scatter so the set
 * is reproducible run to run.
 */
function repGeo(clipId: string): { lat: number; lng: number } {
  let h = 0;
  for (const ch of clipId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dLat = (((h & 0xff) / 255) - 0.5) * 0.0003;
  const dLng = ((((h >> 8) & 0xff) / 255) - 0.5) * 0.0003;
  return { lat: Number((BASE.lat + dLat).toFixed(6)), lng: Number((BASE.lng + dLng).toFixed(6)) };
}

async function readCsv(file: string) {
  const full = path.join(RAW, file);
  const text = await fs.readFile(full, "utf8").catch(() => null);
  if (text === null) {
    console.error(c.red(`\n  Missing ${path.relative(process.cwd(), full)}\n`));
    process.exit(1);
  }
  return parseCsv(text).rows;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");

  const truthRows = await readCsv("ground-truth.csv");
  const clipRows = await readCsv("clips.csv");

  // ---- ground truth, grouped by card -------------------------------------
  const byCard = new Map<string, ObservationCore[]>();
  const outletOfCard = new Map<string, string | null>();

  truthRows.forEach((r, i) => {
    const at = `ground-truth.csv:${i + 2}`;
    const card = (r.card_id ?? "").trim();
    if (!card) return fail(at, "card_id is empty");

    const outletId = (r.outlet_id ?? "").trim() || null;
    const skuId = (r.sku_id ?? "").trim() || null;
    const competitorBrand = (r.competitor_brand ?? "").trim() || null;

    if (outletId && !outletById.has(outletId)) fail(at, `outlet_id "${outletId}" is not in the catalogue — see datasets/CRIB.md`);
    if (skuId) {
      const s = skuById.get(skuId);
      if (!s) fail(at, `sku_id "${skuId}" is not in the catalogue — see datasets/CRIB.md`);
      // The single most likely data-entry error, and it is invisible later:
      // stage 5 builds skuId and competitorBrand as two separate enums, so a
      // competitor sitting in sku_id can never be matched by anything.
      else if (s.isCompetitor) fail(at, `"${skuId}" is a competitor — it belongs in competitor_brand, not sku_id`);
    }
    if (competitorBrand) {
      const s = skuById.get(competitorBrand);
      if (!s) fail(at, `competitor_brand "${competitorBrand}" is not in the catalogue`);
      else if (!s.isCompetitor) fail(at, `"${competitorBrand}" is one of our own SKUs — it belongs in sku_id`);
    }

    const quantity = num(r.quantity ?? "");
    if (Number.isNaN(quantity)) fail(at, `quantity "${r.quantity}" is not a number`);
    const priceDelta = num(r.price_delta ?? "");
    if (Number.isNaN(priceDelta)) fail(at, `price_delta "${r.price_delta}" is not a number`);

    const obs = {
      type: (r.type ?? "").trim(),
      outletId,
      skuId,
      competitorBrand,
      quantity: Number.isNaN(quantity) ? null : quantity,
      unit: (r.unit ?? "").trim() || null,
      priceDelta: Number.isNaN(priceDelta) ? null : priceDelta,
      severity: (r.severity ?? "medium").trim(),
      verbatimBn: "",
    } as ObservationCore;

    if (!byCard.has(card)) {
      byCard.set(card, []);
      outletOfCard.set(card, outletId);
    }
    byCard.get(card)!.push(obs);
  });

  // ---- clips -------------------------------------------------------------
  const built: ClipLabel[] = [];
  const seen = new Set<string>();

  for (const [i, r] of clipRows.entries()) {
    const at = `clips.csv:${i + 2}`;
    const problemsBefore = problems.length;
    const clipId = (r.clip_id ?? "").trim();
    const card = (r.card_id ?? "").trim();
    const transcriptBn = (r.transcript_bn ?? "").trim();

    if (!clipId) { fail(at, "clip_id is empty"); continue; }
    if (!CLIP_NAME.test(clipId)) fail(at, `clip_id "${clipId}" must look like clip-01-a`);
    if (seen.has(clipId)) { fail(at, `clip_id "${clipId}" appears twice`); continue; }
    seen.add(clipId);

    if (!byCard.has(card)) { fail(at, `card_id "${card}" has no rows in ground-truth.csv`); continue; }
    if (!transcriptBn) { fail(at, "transcript_bn is empty — write what was actually said"); continue; }

    const audioFile = `${clipId}.wav`;
    const hasAudio = await fs.access(path.join(CLIPS, audioFile)).then(() => true, () => false);
    if (!hasAudio) fail(at, `no audio at datasets/clips/${audioFile} — run npm run collect`);

    const noise = (r.noise ?? "moderate").trim() || "moderate";
    if (!NOISE.has(noise)) fail(at, `noise "${noise}" must be quiet, moderate or loud`);

    const dialect = (r.dialect ?? "dhaka").trim() || "dhaka";
    if (!DIALECT.has(dialect)) fail(at, `dialect "${dialect}" is not a known value`);
    // eval/run.ts drops non-Dhaka clips with no warning and no change to the
    // reported count. Say it here instead, where somebody is looking.
    else if (dialect !== "dhaka") warn(at, `dialect "${dialect}" — this clip WILL BE EXCLUDED from the evaluation`);

    const observations = byCard.get(card)!.map((o) => ({ ...o, verbatimBn: transcriptBn }));

    const label = {
      clipId,
      audioFile,
      transcriptBn,
      observations,
      outletId: outletOfCard.get(card) ?? null,
      geo: repGeo(clipId),
      meta: {
        dialect,
        noise,
        speakerId: (r.speaker ?? "").trim() || undefined,
        labelledBy: "muse-team",
        labelledAt: new Date().toISOString(),
        promotedFromCorrection: false,
      },
    };

    // A row that already failed a named check would only collect a second,
    // less readable restatement of the same fault from the schema.
    if (problems.length > problemsBefore) continue;

    const parsed = ClipLabelSchema.safeParse(label);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        fail(at, `${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }
    built.push(parsed.data);
  }

  // ---- report ------------------------------------------------------------
  console.log("");
  if (warnings.length) {
    console.log(c.yellow(`  ${warnings.length} warning(s)`));
    for (const w of warnings) console.log(`    ${c.yellow("!")} ${w}`);
    console.log("");
  }

  if (problems.length) {
    console.log(c.red(`  ${problems.length} problem(s) — nothing written`));
    for (const p of problems) console.log(`    ${c.red("x")} ${p}`);
    console.log("");
    process.exit(1);
  }

  const usable = built.filter((b) => b.meta.dialect === "dhaka");
  const noiseMix = { quiet: 0, moderate: 0, loud: 0 } as Record<string, number>;
  const speakers = new Set<string>();
  let multi = 0;
  for (const b of usable) {
    noiseMix[b.meta.noise] = (noiseMix[b.meta.noise] ?? 0) + 1;
    if (b.meta.speakerId) speakers.add(b.meta.speakerId);
    if (b.observations.length > 1) multi++;
  }

  console.log(`  ${c.green("✓")} ${c.bold(String(built.length))} clip(s) valid · ${usable.length} usable in the evaluation`);
  console.log(`    noise    quiet ${noiseMix.quiet} · moderate ${noiseMix.moderate} · loud ${noiseMix.loud}`);
  console.log(`    speakers ${speakers.size || "—"}`);
  console.log(`    ${multi} clip(s) carry more than one observation`);

  // These are collection-design targets, not schema rules, so they are advice
  // rather than failures — but they are the ones that decide whether the
  // numbers mean anything.
  const advice: string[] = [];
  if (usable.length < 40) advice.push(`${40 - usable.length} more clip(s) to reach 40`);
  if ((noiseMix.loud ?? 0) < usable.length * 0.25) advice.push("under a quarter of clips are loud — the noisy ones are the experiment");
  if (speakers.size < 3) advice.push("fewer than 3 distinct speakers");
  if (multi < 8) advice.push("fewer than 8 multi-observation clips");
  if (advice.length) {
    console.log(c.yellow(`\n  Still to do:`));
    for (const a of advice) console.log(`    ${c.yellow("·")} ${a}`);
  }

  if (check) {
    console.log(c.dim(`\n  --check: nothing written. Run npm run labels:build to write.\n`));
    return;
  }

  await fs.mkdir(LABELS, { recursive: true });
  for (const b of built) {
    await fs.writeFile(path.join(LABELS, `${b.clipId}.json`), JSON.stringify(b, null, 2), "utf8");
  }
  console.log(`\n  wrote ${built.length} file(s) to datasets/labels/\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

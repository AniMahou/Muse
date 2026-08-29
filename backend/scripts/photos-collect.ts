/**
 * Ingest a folder of phone photographs into the OCR evaluation set.
 *
 *   npm run photos -- ~/Desktop/muse-photos
 *   npm run photos -- ~/Desktop/muse-photos --force
 *
 * Mirrors scripts/collect.ts for the image half, and for the same reason: the
 * person holding the camera should need nothing running — no API key, no
 * Mongo, no network. Photos never enter git.
 *
 * PRINT AND HANDWRITING ARE KEPT APART. The recogniser learned from 137
 * typefaces, so it reads print. Handwritten tags are a different problem with
 * a different expected score, and averaging the two produces a number that
 * describes neither. A source folder may contain printed/ and handwritten/
 * subfolders; a flat folder is treated as printed and says so.
 *
 * The audit here is deliberately about the two failures that survive looking
 * fine on a phone screen: a photo too small to hold readable glyphs once the
 * line is cropped to 32 pixels tall, and a photo blurred past recovery. Both
 * are cheap to catch now and expensive to catch after labelling — the same
 * lesson the silent-clip check taught on the audio side.
 */
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"]);
const OUT_ROOT = path.resolve(process.cwd(), "datasets/photos");
const KINDS = ["printed", "handwritten"] as const;
type Kind = (typeof KINDS)[number];

/** Below this, a cropped line cannot hold enough pixels per glyph to read. */
const MIN_WIDTH = 400;
/**
 * Blur is flagged RELATIVE to the rest of the batch, not against a constant.
 *
 * ffmpeg's blurdetect returns an unbounded number whose scale depends on
 * resolution, subject and compression, and there is no honest absolute
 * threshold to pick before a single real photograph exists. Inventing one
 * would either flag everything or nothing, and would look like a measurement.
 * So: report every value, and flag only the shots markedly blurrier than their
 * own batch's median.
 */
const BLUR_RELATIVE = 1.6;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

interface Probe {
  width: number | null;
  height: number | null;
  blur: number | null;
}

async function probe(file: string): Promise<Probe> {
  let width: number | null = null;
  let height: number | null = null;
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0", file,
    ]);
    const [w, h] = stdout.trim().split(",").map(Number);
    if (Number.isFinite(w)) width = w!;
    if (Number.isFinite(h)) height = h!;
  } catch {
    /* unreadable; reported by the caller as a skip */
  }

  let blur: number | null = null;
  try {
    // blurdetect writes its verdict to stderr, like volumedetect does.
    const { stderr } = await exec("ffmpeg", [
      "-v", "info", "-i", file, "-vf", "blurdetect", "-f", "null", "-",
    ]);
    blur = parseBlur(stderr);
  } catch (err) {
    blur = parseBlur((err as { stderr?: string }).stderr ?? "");
  }

  return { width, height, blur };
}

/** ffmpeg prints "blur mean: 5.5548110" on stderr, the way volumedetect does. */
function parseBlur(stderr: string): number | null {
  const m = /blur mean:\s*([0-9.]+)/.exec(stderr);
  return m ? Number(m[1]) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

async function sha(file: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function listImages(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && IMAGE.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/** printed/ and handwritten/ when present; otherwise the folder itself is print. */
async function sources(root: string): Promise<Array<{ kind: Kind; files: string[] }>> {
  const out: Array<{ kind: Kind; files: string[] }> = [];
  let foundSub = false;
  for (const kind of KINDS) {
    const files = await listImages(path.join(root, kind));
    if (files.length > 0) {
      foundSub = true;
      out.push({ kind, files });
    }
  }
  if (!foundSub) {
    const files = await listImages(root);
    if (files.length > 0) out.push({ kind: "printed", files });
  }
  return out;
}

async function existingHashes(): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  for (const kind of KINDS) {
    for (const f of await listImages(path.join(OUT_ROOT, kind))) {
      seen.set(await sha(f), path.basename(f));
    }
  }
  return seen;
}

/**
 * Numbering runs across BOTH folders, not within each.
 *
 * Per-folder numbering produced a printed/photo-001 and a handwritten/photo-001,
 * and everything downstream keys on the id alone: labelling one would mark the
 * other complete and their line crops would overwrite each other. A photo id is
 * an identity, so it has to be unique wherever the photo lives.
 */
async function nextIndex(): Promise<number> {
  let max = 0;
  for (const kind of KINDS) {
    for (const f of await listImages(path.join(OUT_ROOT, kind))) {
      const m = /^photo-(\d{3})/.exec(path.basename(f));
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const root = args.find((a) => !a.startsWith("--"));

  if (!root) {
    console.error("usage: npm run photos -- <folder> [--force]");
    process.exitCode = 1;
    return;
  }

  const groups = await sources(path.resolve(root));
  if (groups.length === 0) {
    console.error(`no images under ${root}`);
    process.exitCode = 1;
    return;
  }

  if (groups.length === 1 && groups[0]!.kind === "printed") {
    const hasSub = await fs
      .stat(path.join(path.resolve(root), "handwritten"))
      .then(() => true)
      .catch(() => false);
    if (!hasSub) {
      console.log(
        c.yellow("  no printed/ or handwritten/ subfolders — treating everything as PRINTED"),
      );
      console.log(c.dim("  if any of these are handwritten, they will skew the score"));
      console.log();
    }
  }

  const seen = await existingHashes();
  let copied = 0;
  let duplicate = 0;
  const flagged: string[] = [];

  // Probe everything before copying anything: the blur flag is relative to this
  // batch's median, which cannot be known until every photo has been measured.
  const staged: Array<{ kind: Kind; file: string; hash: string; probe: Probe }> = [];
  for (const { kind, files } of groups) {
    for (const file of files) {
      const hash = await sha(file);
      if (seen.has(hash) && !force) {
        console.log(
          `  ${c.dim(path.basename(file).padEnd(24))} ${c.dim(`duplicate of ${seen.get(hash)}`)}`,
        );
        duplicate++;
        continue;
      }
      const p = await probe(file);
      if (p.width === null) {
        console.log(`  ${path.basename(file).padEnd(24)} ${c.red("unreadable — skipped")}`);
        continue;
      }
      staged.push({ kind, file, hash, probe: p });
    }
  }

  const blurLimit = (() => {
    const m = median(staged.map((s) => s.probe.blur).filter((b): b is number => b !== null));
    return m === null ? null : m * BLUR_RELATIVE;
  })();

  for (const kind of KINDS) {
    const mine = staged.filter((s) => s.kind === kind);
    if (mine.length === 0) continue;
    await fs.mkdir(path.join(OUT_ROOT, kind), { recursive: true });
    let index = await nextIndex();
    console.log(c.bold(`${kind}  ${mine.length} file(s)`));

    for (const { file, hash, probe: p } of mine) {
      const id = `photo-${String(index).padStart(3, "0")}`;
      const dest = path.join(OUT_ROOT, kind, `${id}${path.extname(file).toLowerCase()}`);
      await fs.copyFile(file, dest);
      seen.set(hash, id);
      index++;
      copied++;

      const notes: string[] = [];
      if (p.width! < MIN_WIDTH) notes.push(c.red(`only ${p.width}px wide`));
      if (blurLimit !== null && p.blur !== null && p.blur > blurLimit) {
        notes.push(c.yellow(`blurrier than the rest (${p.blur.toFixed(1)})`));
      }
      if (notes.length > 0) flagged.push(`${id} — ${notes.join(", ")}`);

      const blurStr = p.blur === null ? "" : c.dim(` blur ${p.blur.toFixed(1)}`);
      console.log(
        `  ${c.green(id.padEnd(12))} ${c.dim(path.basename(file).padEnd(20))} ` +
          `${p.width}x${p.height}${blurStr}` +
          (notes.length > 0 ? `  ${notes.join(" ")}` : ""),
      );
    }
    console.log();
  }

  console.log(c.bold(`${copied} added`) + (duplicate > 0 ? c.dim(`, ${duplicate} duplicate`) : ""));

  if (flagged.length > 0) {
    console.log();
    console.log(c.yellow(`  ${flagged.length} photo(s) worth a second look:`));
    for (const f of flagged) console.log(`    ${f}`);
    console.log(c.dim("  keep them — a real set contains bad shots — but expect them to score badly"));
  }

  console.log();
  console.log(c.dim("  next: npm run photos:label"));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

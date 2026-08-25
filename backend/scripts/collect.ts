/**
 * Ingest a folder of phone recordings into the evaluation clip set.
 *
 *   npm run collect -- ~/Desktop/muse-clips
 *   npm run collect -- ~/Desktop/muse-clips --force
 *
 * Deliberately does NOT run the pipeline, touch Mongo, or need an API key.
 * The person collecting data should be able to work on a laptop with nothing
 * running, in a market, on a bad connection. scripts/try-clip.ts is the other
 * tool — that one posts to a live API and is for debugging a single clip.
 *
 * Phone recordings arrive as m4a at 44.1kHz stereo; the pipeline wants 16kHz
 * mono, which is also what every ASR provider resamples to internally. Doing
 * it once here means the same bytes are sent every run, so a cached stage
 * result stays valid.
 */
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const AUDIO = new Set([".m4a", ".mp3", ".wav", ".aac", ".mp4", ".ogg", ".opus", ".webm", ".caf", ".amr"]);
const CLIP_NAME = /^clip-\d{2}-[a-z]$/;
const OUT_DIR = path.resolve(process.cwd(), "datasets/clips");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function durationOf(file: string): Promise<number | null> {
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const src = args.find((a) => !a.startsWith("--"));

  if (!src) {
    console.error(`
  Usage: npm run collect -- <folder-of-recordings> [--force]

  Every file must be named  clip-<card>-<take>  e.g.  clip-01-a.m4a
                                                      clip-16-b.m4a
`);
    process.exit(1);
  }

  try {
    await exec("ffmpeg", ["-version"]);
  } catch {
    console.error(c.red("\n  ffmpeg is not installed.\n") + "  macOS: brew install ffmpeg\n  Linux: sudo apt install ffmpeg\n");
    process.exit(1);
  }

  const dir = path.resolve(src);
  const entries = await fs.readdir(dir).catch(() => {
    console.error(c.red(`\n  No such folder: ${dir}\n`));
    process.exit(1);
  });

  await fs.mkdir(OUT_DIR, { recursive: true });

  let ok = 0, skipped = 0, bad = 0;
  const short: string[] = [];

  for (const entry of (entries as string[]).sort()) {
    const ext = path.extname(entry).toLowerCase();
    if (!AUDIO.has(ext)) continue;

    const clipId = path.basename(entry, ext);
    if (!CLIP_NAME.test(clipId)) {
      console.log(`  ${c.yellow("skip")}  ${entry}  ${c.dim("— name must look like clip-01-a")}`);
      bad++;
      continue;
    }

    const out = path.join(OUT_DIR, `${clipId}.wav`);
    if (!force && await fs.access(out).then(() => true, () => false)) {
      console.log(`  ${c.dim("have")}  ${clipId}`);
      skipped++;
      continue;
    }

    // -ar 16000 -ac 1: what the pipeline and every ASR provider actually want.
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-i", path.join(dir, entry), "-ar", "16000", "-ac", "1", out]);

    const secs = await durationOf(out);
    const label = secs === null ? "" : `${secs.toFixed(1)}s`;

    // A clip under two seconds is almost always a misfire — the recorder was
    // stopped early, or the file is silence. Better to catch it now than to
    // find a dead row in the evaluation on the day.
    if (secs !== null && secs < 2) {
      console.log(`  ${c.red("thin")}  ${clipId}  ${c.dim(label)}`);
      short.push(clipId);
    } else {
      console.log(`  ${c.green("ok")}    ${clipId}  ${c.dim(label)}`);
    }
    ok++;
  }

  console.log(`\n  ${c.bold(String(ok))} ingested · ${skipped} already present · ${bad} badly named`);
  const total = (await fs.readdir(OUT_DIR)).filter((f) => f.endsWith(".wav")).length;
  console.log(`  ${c.bold(String(total))} clips now in datasets/clips/  ${c.dim("(target: 40)")}`);

  if (short.length) {
    console.log(c.red(`\n  Re-record these — under 2 seconds: ${short.join(", ")}`));
  }
  if (bad) {
    console.log(c.yellow(`\n  ${bad} file(s) ignored for their name. Rename to clip-<card>-<take> and run again.`));
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

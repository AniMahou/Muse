/**
 * Ingest a folder of phone recordings into the evaluation clip set.
 *
 *   npm run collect -- ~/Desktop/muse-clips
 *   npm run collect -- ~/Desktop/muse-clips --force
 *   npm run collect -- ~/Desktop/muse-clips --shift
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

// Android recorders emit 3gp/amr as readily as m4a; iOS emits m4a and caf.
const AUDIO = new Set([".m4a", ".mp3", ".wav", ".aac", ".mp4", ".ogg", ".opus",
  ".webm", ".caf", ".amr", ".3gp", ".3gpp", ".wma", ".flac"]);
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
  // Two people recording the same card set produce the same filenames. Skipping
  // (the default) would silently drop the second speaker's work, which is the
  // opposite of what you want — a second voice is the scarcest thing in the set.
  // --shift keeps both by moving the incoming clip to the next free take letter.
  const shift = args.includes("--shift");
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

    let target = clipId;
    let out = path.join(OUT_DIR, `${target}.wav`);
    const taken = async (p: string) => fs.access(p).then(() => true, () => false);

    if (!force && (await taken(out))) {
      if (!shift) {
        console.log(`  ${c.dim("have")}  ${clipId}`);
        skipped++;
        continue;
      }
      // Walk the take letter forward until the name is free. Processing in
      // sorted order means an incoming a,b pair stays a contiguous pair.
      const card = clipId.slice(0, -1);
      let moved = false;
      for (let code = "a".charCodeAt(0); code <= "z".charCodeAt(0); code++) {
        const candidate = `${card}${String.fromCharCode(code)}`;
        const p = path.join(OUT_DIR, `${candidate}.wav`);
        if (!(await taken(p))) {
          target = candidate;
          out = p;
          moved = true;
          break;
        }
      }
      if (!moved) {
        console.log(`  ${c.yellow("full")}  ${clipId} — no free take letter`);
        skipped++;
        continue;
      }
    }

    // -ar 16000 -ac 1: what the pipeline and every ASR provider actually want.
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-i", path.join(dir, entry), "-ar", "16000", "-ac", "1", out]);

    const secs = await durationOf(out);
    const label = secs === null ? "" : `${secs.toFixed(1)}s`;

    // A clip under two seconds is almost always a misfire — the recorder was
    // stopped early, or the file is silence. Better to catch it now than to
    // find a dead row in the evaluation on the day.
    const renamed = target === clipId ? "" : c.dim(`  <- ${clipId}`);
    if (secs !== null && secs < 2) {
      console.log(`  ${c.red("thin")}  ${target}  ${c.dim(label)}${renamed}`);
      short.push(target);
    } else {
      console.log(`  ${c.green("ok")}    ${target}  ${c.dim(label)}${renamed}`);
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

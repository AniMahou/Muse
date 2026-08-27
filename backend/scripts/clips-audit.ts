/**
 * Report what is actually in datasets/clips/.
 *
 *   npm run clips
 *
 * Audio never travels through git — the folder is ignored, because forty wav
 * files do not belong in a repository — so whoever is collecting and whoever
 * is evaluating cannot see each other's clips. This prints something one can
 * paste to the other.
 *
 * The check that matters is loudness, not duration. A recording made against a
 * muted input, or against the wrong device on a machine with several, produces
 * a file of exactly the right length containing nothing at all. Everything
 * downstream then behaves plausibly: the transcript comes back empty or
 * hallucinated, field accuracy collapses, and it looks like the pipeline
 * failed. Catching it here costs a minute; catching it after labelling costs
 * the collection twice.
 */
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const DIR = path.resolve(process.cwd(), "datasets/clips");
const CARDS = 25;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

interface Probe {
  clipId: string;
  card: number | null;
  seconds: number | null;
  maxDb: number | null;
  meanDb: number | null;
  bytes: number;
}

async function probe(file: string): Promise<Pick<Probe, "seconds" | "maxDb" | "meanDb">> {
  let seconds: number | null = null;
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    const n = Number(stdout.trim());
    if (Number.isFinite(n)) seconds = n;
  } catch { /* reported as null */ }

  // volumedetect writes its summary to stderr and the null muxer exits 0.
  let maxDb: number | null = null;
  let meanDb: number | null = null;
  try {
    const { stderr } = await exec("ffmpeg", [
      "-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-",
    ]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
    const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
    const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
    if (max) maxDb = Number(max[1]);
    if (mean) meanDb = Number(mean[1]);
  } catch { /* reported as null */ }

  return { seconds, maxDb, meanDb };
}

function verdict(p: Probe): { text: string; bad: boolean } {
  if (p.seconds === null) return { text: c.red("unreadable"), bad: true };
  if (p.seconds < 2) return { text: c.red("too short"), bad: true };
  // -50 dBFS peak is far below any speech, including a distant voice in a
  // noisy market: this is a dead input, not a quiet one.
  if (p.maxDb !== null && p.maxDb < -50) return { text: c.red("SILENT"), bad: true };
  if (p.maxDb !== null && p.maxDb < -35) return { text: c.yellow("very quiet"), bad: true };
  // Peaks at 0 dBFS mean samples were clipped off the top and the words at
  // those peaks are already distorted.
  if (p.maxDb !== null && p.maxDb >= -0.5) return { text: c.yellow("clipping"), bad: false };
  if (p.seconds > 40) return { text: c.yellow("very long"), bad: false };
  return { text: c.green("ok"), bad: false };
}

async function main(): Promise<void> {
  let files: string[];
  try {
    files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".wav")).sort();
  } catch {
    console.error(c.red(`\n  No datasets/clips/ folder. Run this from the backend directory.\n`));
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(c.yellow(`\n  datasets/clips/ is empty.\n`) +
      c.dim("  Record with:  npm run mic\n  Or ingest phone recordings:  npm run collect -- <folder>\n"));
    return;
  }

  console.log(`\n  ${c.bold("Clips in datasets/clips/")}\n`);

  const probes: Probe[] = [];
  for (const f of files) {
    const full = path.join(DIR, f);
    const clipId = path.basename(f, ".wav");
    const m = /^clip-(\d{2})-[a-z]$/.exec(clipId);
    const { size } = await fs.stat(full);
    const p: Probe = { clipId, card: m ? Number(m[1]) : null, bytes: size, ...(await probe(full)) };
    probes.push(p);

    const v = verdict(p);
    const dur = p.seconds === null ? "  ?  " : `${p.seconds.toFixed(1).padStart(5)}s`;
    const peak = p.maxDb === null ? "   ?  " : `${p.maxDb.toFixed(1).padStart(6)} dB`;
    console.log(`    ${clipId.padEnd(14)} ${dur}  peak ${peak}   ${v.text}`);
  }

  const bad = probes.filter((p) => verdict(p).bad);
  const silent = probes.filter((p) => p.maxDb !== null && p.maxDb < -50);
  const usable = probes.length - bad.length;
  const totalSec = probes.reduce((a, p) => a + (p.seconds ?? 0), 0);
  const mb = probes.reduce((a, p) => a + p.bytes, 0) / 1e6;

  console.log(`\n  ${c.bold(String(probes.length))} file(s) · ${c.bold(String(usable))} usable · ` +
    `${Math.round(totalSec)}s of audio · ${mb.toFixed(1)} MB`);

  const covered = new Set(probes.filter((p) => p.card !== null).map((p) => p.card));
  const missing: number[] = [];
  for (let i = 1; i <= CARDS; i++) if (!covered.has(i)) missing.push(i);

  console.log(`  cards covered: ${covered.size}/${CARDS}`);
  if (missing.length) console.log(c.yellow(`  not yet recorded: ${missing.join(", ")}`));

  const unnamed = probes.filter((p) => p.card === null);
  if (unnamed.length) {
    console.log(c.yellow(`  ${unnamed.length} file(s) not named clip-NN-x: ${unnamed.map((p) => p.clipId).join(", ")}`));
  }

  if (silent.length) {
    console.log(c.red(`\n  ${silent.length} clip(s) contain no audio.`));
    console.log(c.red(`  The microphone was muted or the wrong input was selected.`));
    console.log(c.dim(`  Check with:  npm run mic -- --devices\n`));
  } else if (bad.length) {
    console.log(c.yellow(`\n  ${bad.length} clip(s) need re-recording: ${bad.map((p) => p.clipId).join(", ")}\n`));
  } else {
    console.log(c.green(`\n  Every clip has audio in it.`));
    console.log(c.dim(`  Next: fill in transcripts, then  npm run labels:check\n`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

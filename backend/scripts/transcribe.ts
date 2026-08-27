/**
 * Play each clip and type what you hear, straight into clips.csv.
 *
 *   npm run transcribe            every clip still missing a transcript
 *   npm run transcribe -- 7       just clip-07-a
 *
 * The transcript is the reference the word error rate is measured against, and
 * it is the only part of a label a machine cannot produce. Everything else in
 * the pipeline exists to be compared against this.
 *
 * It deliberately does NOT show you what the recogniser heard. Correcting a
 * pre-filled guess is faster, and it is also worthless: anchoring the reference
 * to the hypothesis drives the measured error rate towards zero and destroys
 * the one number the whole project turns on. Type what you hear, from the
 * audio, or the metric means nothing.
 */
import { promises as fs } from "node:fs";
import { spawn, execFile } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { parseCsv } from "@/catalog/csv";

const exec = promisify(execFile);
const RAW = path.resolve(process.cwd(), "datasets/raw");
const CLIPS = path.resolve(process.cwd(), "datasets/clips");
const CSV = path.join(RAW, "clips.csv");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

/** ffplay ships with ffmpeg, which is already required, so playback is uniform. */
function play(file: string): { stop: () => void; done: Promise<void> } {
  const p = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", file], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  return {
    stop: () => { try { p.kill(); } catch { /* already gone */ } },
    done: new Promise<void>((r) => p.once("close", () => r())),
  };
}

/** Quote only when the field needs it, so the file stays readable in a diff. */
function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main(): Promise<void> {
  try {
    await exec("ffplay", ["-version"]);
  } catch {
    console.error(c.yellow("\n  ffplay not found — it ships with ffmpeg.\n") +
      "  Windows: winget install Gyan.FFmpeg\n  Linux: sudo apt install ffmpeg\n  macOS: brew install ffmpeg\n");
    process.exit(1);
  }

  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const text = await fs.readFile(CSV, "utf8").catch(() => "");
  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) {
    console.error(c.yellow(`\n  No rows in clips.csv. Run npm run labels:scaffold first.\n`));
    process.exit(1);
  }

  const targets = rows.filter((r) => {
    const id = (r.clip_id ?? "").trim();
    if (only && !id.includes(only.padStart(2, "0"))) return false;
    return (r.transcript_bn ?? "").trim() === "";
  });

  if (targets.length === 0) {
    console.log(c.green(`\n  Every row already has a transcript.\n`));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${c.bold("Transcribe")} — ${targets.length} clip(s) to do\n`);
  console.log(c.dim("  Type exactly what you HEAR, including mistakes and fumbles."));
  console.log(c.dim("  Tidying it up makes our own error rate look better than it is.\n"));
  console.log(c.dim("  ENTER on its own = replay · s = skip · q = save and quit\n"));

  let done = 0;
  try {
    for (const row of targets) {
      const id = (row.clip_id ?? "").trim();
      const file = path.join(CLIPS, `${id}.wav`);
      if (!(await fs.access(file).then(() => true, () => false))) {
        console.log(c.yellow(`  ${id} — no audio, skipping`));
        continue;
      }

      for (;;) {
        const handle = play(file);
        const answer = (await rl.question(`  ${c.cyan(id)} › `)).trim();
        handle.stop();

        if (answer === "") continue;            // replay
        if (answer === "s") break;              // skip this clip
        if (answer === "q") { await save(headers, rows); console.log(c.green(`\n  Saved ${done} transcript(s).\n`)); return; }

        row.transcript_bn = answer;
        if ((row.speaker ?? "").trim() === "") {
          row.speaker = (await rl.question(`  ${c.dim("speaker")} › `)).trim() || "unknown";
        }
        if ((row.noise ?? "").trim() === "") {
          const n = (await rl.question(`  ${c.dim("noise [quiet/moderate/loud]")} › `)).trim();
          row.noise = ["quiet", "moderate", "loud"].includes(n) ? n : "";
        }
        done++;
        // Written after every clip: an hour of transcription must not be lost
        // to a closed terminal.
        await save(headers, rows);
        console.log(c.green(`  ✓ ${done}/${targets.length}\n`));
        break;
      }
    }
  } finally {
    rl.close();
  }

  await save(headers, rows);
  console.log(c.green(`\n  Saved ${done} transcript(s).`));
  console.log(c.dim(`  Next:  npm run labels:build  then  npm run eval\n`));
}

async function save(headers: string[], rows: Array<Record<string, string>>): Promise<void> {
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => csvField(r[h] ?? "")).join(",")).join("\n");
  await fs.writeFile(CSV, `${head}\n${body}\n`, "utf8");
}

void os;
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

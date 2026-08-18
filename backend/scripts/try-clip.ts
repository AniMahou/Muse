/**
 * Push one audio file through the running pipeline and print everything it
 * did — transcript with per-word confidence, what each resolver considered,
 * and the final per-field scores.
 *
 * This is the debugging loop the project actually needs: when a field comes
 * out wrong the question is immediately "which stage?", and the answer should
 * be one screen rather than a re-run with logs.
 *
 *   npm run try -- recording.m4a
 *   npm run try -- recording.m4a --outlet OUT-1182
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);

const API = process.env.MUSE_API ?? "http://localhost:4000";
const TOKEN = process.env.MUSE_TOKEN ?? "dev-token-muse";
const GEO = { lat: 23.7806, lng: 90.4074 };

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

/** Colour a 0..1 confidence by how much it should worry you. */
function score(n: number): string {
  const s = n.toFixed(2);
  if (n >= 0.8) return c.green(s);
  if (n >= 0.6) return c.yellow(s);
  return c.red(s);
}

/**
 * Margins read on a different scale to confidences.
 *
 * A margin is the gap to the runner-up, so BIG is good and 0.3 already means
 * decisive — colouring it like a confidence made a healthy 0.39 look alarming.
 */
function margin(n: number): string {
  const s = n.toFixed(2);
  if (n >= 0.3) return c.green(s);
  if (n >= 0.15) return c.yellow(s);
  return c.red(s);
}

/** Runner-up rows are dimmed rather than alarmed: being lower is their job. */
function rank(n: number, isTop: boolean): string {
  return isTop ? score(n) : c.dim(n.toFixed(2));
}

async function toOpus(input: string): Promise<string> {
  const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "muse-try-")), "clip.webm");
  // 16 kHz mono is what speech models want; anything more is wasted bytes on
  // a field connection.
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", input,
    "-ar", "16000", "-ac", "1", "-c:a", "libopus", "-b:a", "24k", out]);
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: npm run try -- <audio-file> [--outlet OUT-1182]");
    process.exit(1);
  }
  const outletIdx = args.indexOf("--outlet");
  const declaredOutletId = outletIdx >= 0 ? (args[outletIdx + 1] ?? null) : null;

  const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
  if (!health) {
    console.error(c.red(`Cannot reach ${API}. Start it with:  npm run dev`));
    process.exit(1);
  }
  console.log(c.dim(`api ${API}  asr=${health.asr}  llm=${health.llm}`));

  const webm = await toOpus(file);
  const bytes = await fs.readFile(webm);
  console.log(c.dim(`uploading ${path.basename(file)} -> ${(bytes.length / 1024).toFixed(1)} KB opus\n`));

  const res = await fetch(`${API}/api/observations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      clientUuid: randomUUID(),
      audioBase64: bytes.toString("base64"),
      mimeType: "audio/webm",
      geo: GEO,
      declaredOutletId,
      recordedAt: new Date().toISOString(),
    }),
  });
  const posted = await res.json();
  if (!res.ok) {
    console.error(c.red(`upload failed (HTTP ${res.status}): ${JSON.stringify(posted)}`));
    process.exit(1);
  }
  const clipId = posted.clipId as string;

  process.stdout.write(c.dim("processing"));
  let clip: Record<string, unknown> | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write(c.dim("."));
    clip = await fetch(`${API}/api/clips/${clipId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }).then((r) => r.json());
    if (clip && (clip.status === "processed" || clip.status === "failed")) break;
  }
  console.log("\n");

  if (!clip || clip.status !== "processed") {
    console.error(c.red(`clip ${clip?.status ?? "timed out"}: ${clip?.error ?? ""}`));
    process.exit(1);
  }

  // The trace holds every stage's input and output for this clip.
  const day = new Date().toISOString().slice(0, 10);
  const tracePath = path.join(process.cwd(), "traces", day, `${clipId}.json`);
  const trace = JSON.parse(await fs.readFile(tracePath, "utf8"));
  const stage = (name: string) =>
    trace.stages.find((s: { stage: string }) => s.stage.startsWith(name));

  const transcript = stage("01-transcribe").output;
  const ann = stage("02,03,04").output;
  const observations = stage("06-confidence").output;

  // ---- transcript ------------------------------------------------------
  console.log(c.bold("TRANSCRIPT"));
  console.log(`  ${transcript.text}\n`);
  console.log(c.bold("  per-word confidence") + c.dim("  (green >=0.8, yellow >=0.6, red below)"));
  const line = transcript.words
    .map((w: { w: string; conf: number }) =>
      w.conf >= 0.8 ? c.green(w.w) : w.conf >= 0.6 ? c.yellow(w.w) : c.red(w.w),
    )
    .join(" ");
  console.log(`  ${line}`);
  console.log(
    c.dim(
      `  provider=${transcript.provider}/${transcript.model}` +
        `  derived=${transcript.confidenceDerived}  duration=${transcript.durationSec ?? "?"}s\n`,
    ),
  );

  // ---- quantities ------------------------------------------------------
  console.log(c.bold("QUANTITIES") + c.dim("  (stage 2, deterministic grammar)"));
  if (ann.quantities.length === 0) console.log(c.dim("  none found"));
  for (const q of ann.quantities) {
    console.log(
      `  ${c.cyan(JSON.stringify(q.raw).padEnd(22))} = ${String(q.value).padStart(7)} ${(q.unit ?? "").padEnd(7)} ` +
        `${score(q.confidence)}  ${c.dim(q.basis)}`,
    );
  }
  console.log();

  // ---- products --------------------------------------------------------
  console.log(c.bold("PRODUCTS") + c.dim("  (stage 3, phonetic match against the catalogue)"));
  if (ann.skus.length === 0) console.log(c.dim("  none found"));
  for (const s of ann.skus) {
    console.log(`  heard ${c.cyan(JSON.stringify(s.raw))}   margin ${margin(s.margin)}`);
    s.candidates.slice(0, 4).forEach((cand: Record<string, any>, i: number) => {
      const tag = cand.isCompetitor ? c.yellow("COMPETITOR") : c.dim("own");
      const via = cand.viaAlias ? c.dim(` via alias "${cand.viaAlias}"`) : "";
      console.log(`     ${rank(cand.score, i === 0)}  ${cand.skuId.padEnd(16)} ${cand.name.padEnd(26)} ${tag}${via}`);
    });
  }
  console.log();

  // ---- outlet ----------------------------------------------------------
  console.log(c.bold("OUTLET") + c.dim("  (stage 4, GPS radius + spoken name)"));
  const o = ann.outlet;
  console.log(
    c.dim(`  heard ${JSON.stringify(o.raw)}   `) + `margin ${margin(o.margin)}   ` +
      c.dim(`${o.gpsCandidateCount} shop(s) in radius   declared=${o.declared}`),
  );
  o.candidates.slice(0, 4).forEach((cand: Record<string, any>, i: number) => {
    console.log(
      `     ${rank(cand.score, i === 0)}  ${cand.outletId.padEnd(12)} ${cand.name.padEnd(24)} ` +
        c.dim(`${String(cand.distanceM).padStart(6)}m  name=${cand.nameScore.toFixed(2)}`),
    );
  });
  console.log();

  // ---- observations ----------------------------------------------------
  console.log(c.bold("OBSERVATIONS") + c.dim("  (stage 5 assembled, stage 6 scored)"));
  if (observations.length === 0) console.log(c.dim("  none"));
  observations.forEach((obs: Record<string, any>, i: number) => {
    const flagged = obs.flaggedFields.length > 0;
    const badge = flagged ? c.yellow("NEEDS CLARIFICATION") : c.green("CONFIRMED");
    console.log(`\n  ${c.bold(`[${i + 1}] ${obs.type}`)}   ${badge}`);
    for (const [k, v] of Object.entries(obs)) {
      if (["fieldConfidence", "flaggedFields", "status", "type", "verbatimBn"].includes(k)) continue;
      if (v === null) continue;
      const conf = obs.fieldConfidence[k];
      const mark = obs.flaggedFields.includes(k) ? c.red(" <- flagged") : "";
      console.log(`      ${k.padEnd(16)} ${String(v).padEnd(20)} ${conf !== undefined ? score(conf) : ""}${mark}`);
    }
    console.log(c.dim(`      verbatim: ${obs.verbatimBn}`));
  });

  console.log("\n" + c.bold("TIMINGS"));
  for (const s of trace.stages) {
    console.log(`  ${s.stage.padEnd(24)} ${String(s.ms).padStart(6)} ms${s.cached ? c.dim("  (cached)") : ""}`);
  }
  console.log(c.dim(`\n  trace: ${tracePath}`));
}

main().catch((err) => {
  console.error(c.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

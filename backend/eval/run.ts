/**
 * Evaluation harness.
 *
 * NOT a test. Tests are deterministic and gate every commit; this is
 * stochastic, costs money, and produces METRICS. Conflating the two gives you
 * a flaky CI that eventually gets switched off, which is how teams end up
 * shipping quality regressions they cannot see.
 *
 *   npm run eval                 # full set
 *   npm run eval -- --no-cache   # bypass the stage cache before presenting
 *   npm run eval -- --limit 20
 *
 * Reads labelled clips from datasets/, runs the real pipeline, and writes a
 * markdown report plus a JSON snapshot that the next run is diffed against.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ClipLabelSchema, type ClipLabel } from "@shared/label.schema";
import { ProviderError } from "@/common/errors";
import { mimeForExtension } from "@/common/audio";
import { connectMongo, closeMongo } from "@/db/client";
import { buildContainer } from "@/container";
import { config } from "@/common/config";
import { logger } from "@/common/logger";
import {
  wer, cer, scoreClip, pairObservations, mergeTallies, precisionRecall,
  calibration, gateEffectiveness, SCORED_FIELDS, type ScoredField, type FieldTally,
} from "./metrics";
import { renderReport, type EvalReport } from "./report";

const DATASETS = path.resolve(process.cwd(), "datasets");
const REPORT_DIR = path.resolve(process.cwd(), "eval/report");
const SNAPSHOT_DIR = path.resolve(process.cwd(), "eval/snapshots");

async function loadLabels(limit?: number): Promise<ClipLabel[]> {
  const dir = path.join(DATASETS, "labels");
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const out: ClipLabel[] = [];
  for (const f of files) {
    const raw = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    const parsed = ClipLabelSchema.safeParse(raw);
    if (!parsed.success) {
      // Ground truth is validated as strictly as production data. An
      // inconsistent label silently corrupts every metric downstream and stays
      // invisible for a week.
      logger.error({ file: f, issues: parsed.error.issues }, "invalid label, skipping");
      continue;
    }
    // v1 targets Dhaka-standard Bangla; dialect clips are labelled but held out.
    if (parsed.data.meta.dialect !== "dhaka") continue;
    out.push(parsed.data);
    if (limit && out.length >= limit) break;
  }
  return out;
}

/**
 * Run one clip, waiting out rate limits rather than recording them as failures.
 *
 * In production BullMQ owns retries; the evaluation has no such layer, so a
 * free-tier tokens-per-minute ceiling turned into "17 of 20 clips FAILED" and
 * a field-accuracy figure computed from whatever survived. That is the worst
 * possible failure mode for a measurement: it still produces a number.
 *
 * Groq states the wait in its own error ("Please try again in 9.62s"), which
 * is better than any backoff we could guess, so honour it when present. This
 * also paces the whole run automatically — no fixed sleep that would be too
 * slow when the limit is not being hit.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ProviderError) || !err.retryable) throw err;
      const suggested = /try again in ([\d.]+)s/i.exec(err.message);
      const waitMs = suggested
        ? Math.ceil(Number(suggested[1]) * 1000) + 500
        : Math.min(30_000, 2_000 * 2 ** i);
      process.stdout.write(`rate limited, waiting ${(waitMs / 1000).toFixed(1)}s ... `);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noCache = args.includes("--no-cache");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

  const labels = await loadLabels(limit);
  if (labels.length === 0) {
    console.error(
      `\nNo labelled clips found in ${path.join(DATASETS, "labels")}.\n\n` +
        `The harness needs ground truth to measure anything. Put audio in\n` +
        `datasets/clips/ and one JSON per clip in datasets/labels/, matching\n` +
        `shared/label.schema.ts.\n\n` +
        `This is the project's real critical path and no code substitutes for it.\n`,
    );
    process.exit(1);
  }

  const db = await connectMongo();
  const container = buildContainer(db);
  const orchestrator = container.buildOrchestrator();

  let tally = emptyTally();
  let werSum = 0;
  let cerSum = 0;
  // Word error rate needs a human reference; field accuracy does not, because
  // it scores against the scenario's expected observations. Clips with no
  // transcript are still fully scored on the metric that matters, and simply
  // drop out of this average — counted separately so the report can say so
  // rather than quietly dividing by the wrong denominator.
  let werScored = 0;
  const confidenceSamples: Array<{ confidence: number; correct: boolean }> = [];
  const gateSamples: Array<{ flagged: boolean; correct: boolean }> = [];
  const perClip: EvalReport["clips"] = [];
  let failures = 0;

  for (const [i, label] of labels.entries()) {
    const audioPath = path.join(DATASETS, "clips", label.audioFile);
    process.stdout.write(`  [${i + 1}/${labels.length}] ${label.clipId} ... `);

    let audio: Buffer;
    try {
      audio = await fs.readFile(audioPath);
    } catch {
      console.log("MISSING AUDIO");
      failures++;
      continue;
    }

    try {
      const result = await withRetry(() => orchestrator.run({
        clipId: label.clipId,
        companyId: process.env.EVAL_COMPANY_ID ?? "demo-fmcg",
        repId: "EVAL",
        audio: new Uint8Array(audio),
        storageKey: label.audioFile,
        mimeType: mimeForExtension(path.extname(label.audioFile)),
        geo: label.geo,
        declaredOutletId: null,
        recordedAt: new Date().toISOString(),
      }));

      const hasReference = label.transcriptBn.trim().length > 0;
      const clipWer = hasReference ? wer(label.transcriptBn, result.transcript.text) : null;
      const clipCer = hasReference ? cer(label.transcriptBn, result.transcript.text) : null;
      if (clipWer !== null && clipCer !== null) {
        werSum += clipWer;
        cerSum += clipCer;
        werScored++;
      }

      const clipTally = scoreClip(result.observations, label.observations);
      tally = mergeTallies(tally, clipTally);

      // Calibration pairs each scored field's confidence with whether it was
      // actually right — the only way to know if the gate means anything.
      // Pair against the SAME matcher the field tally uses. Comparing every
      // prediction to label.observations[0] silently scored the second and
      // third observations of a clip against the first one's truth, which is
      // wrong on precisely the multi-observation clips the set over-samples.
      const { pairs } = pairObservations(result.observations, label.observations);
      for (const { truth: match, predicted } of pairs) {
        if (!predicted) continue;
        const obs = predicted as (typeof result.observations)[number];
        for (const f of SCORED_FIELDS) {
          const conf = obs.fieldConfidence[f];
          if (conf === undefined) continue;
          const correct =
            String((obs as Record<string, unknown>)[f] ?? "") ===
            String((match as Record<string, unknown>)[f] ?? "");
          confidenceSamples.push({ confidence: conf, correct });
          gateSamples.push({ flagged: obs.flaggedFields.includes(f), correct });
        }
      }

      perClip.push({
        clipId: label.clipId,
        wer: clipWer === null ? null : round(clipWer),
        cer: clipCer === null ? null : round(clipCer),
        predicted: result.observations.length,
        expected: label.observations.length,
        flagged: result.observations.filter((o) => o.flaggedFields.length > 0).length,
      });

      console.log(
        `${clipWer === null ? "WER   —  " : `WER ${(clipWer * 100).toFixed(1).padStart(5)}%`}` +
          `  obs ${result.observations.length}/${label.observations.length}`,
      );
    } catch (err) {
      failures++;
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const scored = labels.length - failures;
  const fields = Object.fromEntries(
    SCORED_FIELDS.map((f) => [f, { ...tally[f], ...precisionRecall(tally[f]) }]),
  ) as EvalReport["fields"];

  const report: EvalReport = {
    ranAt: new Date().toISOString(),
    provider: { asr: `${container.asr.name}/${container.asr.model}`, llm: `${container.llm.name}/${container.llm.model}` },
    clipCount: labels.length,
    noiseMix: countBy(labels.map((l) => l.meta.noise)),
    scoredCount: scored,
    failures,
    cacheDisabled: noCache,
    transcription: {
      wer: werScored === 0 ? null : round(werSum / werScored),
      cer: werScored === 0 ? null : round(cerSum / werScored),
      scoredCount: werScored,
    },
    fields,
    overallFieldAccuracy: round(overallAccuracy(tally)),
    calibration: calibration(confidenceSamples),
    gate: gateEffectiveness(gateSamples),
    clips: perClip,
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const previous = await loadLatestSnapshot();
  const day = report.ranAt.slice(0, 10);
  await fs.writeFile(path.join(REPORT_DIR, `${day}.md`), renderReport(report, previous), "utf8");

  // A run that lost clips to rate limits or provider errors measured a
  // different, smaller set — writing it as the baseline makes the next full
  // run look like a regression against a number that was never comparable.
  // The report is still written; only the baseline is withheld.
  const complete = failures === 0;
  if (complete) {
    await fs.writeFile(
      path.join(SNAPSHOT_DIR, `${day}.json`),
      JSON.stringify(report, null, 2),
      "utf8",
    );
  } else {
    console.log(
      `\n  ${failures} clip(s) failed — report written, but NOT saved as the baseline.`,
    );
  }

  console.log("\n" + renderReport(report, previous));
  console.log(`\n  report:   eval/report/${day}.md`);
  if (complete) console.log(`  snapshot: eval/snapshots/${day}.json`);

  await container.close();
  await closeMongo();

  // Regression gate: a drop of more than 2 points in overall field accuracy
  // fails the run, so a prompt change cannot quietly make things worse.
  // Only compare against a baseline drawn from a comparable set. Twenty clips
  // against a previous three is not a regression, it is a different question.
  const comparable = previous !== null && previous.scoredCount >= report.scoredCount * 0.9;
  if (comparable && previous && report.overallFieldAccuracy < previous.overallFieldAccuracy - 0.02) {
    console.error(
      `\n  REGRESSION: field accuracy ${previous.overallFieldAccuracy} -> ${report.overallFieldAccuracy}\n`,
    );
    process.exit(1);
  }
}

async function loadLatestSnapshot(): Promise<EvalReport | null> {
  try {
    const files = (await fs.readdir(SNAPSHOT_DIR)).filter((f) => f.endsWith(".json")).sort();
    const last = files.at(-1);
    if (!last) return null;
    return JSON.parse(await fs.readFile(path.join(SNAPSHOT_DIR, last), "utf8")) as EvalReport;
  } catch {
    return null;
  }
}

function emptyTally(): Record<ScoredField, FieldTally> {
  return Object.fromEntries(
    SCORED_FIELDS.map((f) => [f, { correct: 0, wrong: 0, missed: 0, spurious: 0 }]),
  ) as Record<ScoredField, FieldTally>;
}

function overallAccuracy(t: Record<ScoredField, FieldTally>): number {
  let correct = 0;
  let total = 0;
  for (const f of SCORED_FIELDS) {
    correct += t[f].correct;
    total += t[f].correct + t[f].wrong + t[f].missed + t[f].spurious;
  }
  return total === 0 ? 0 : correct / total;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

void config;
main().catch((err) => {
  logger.error({ err }, "eval failed");
  process.exit(1);
});

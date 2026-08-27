import type { CalibrationBin } from "./metrics";

export interface EvalReport {
  ranAt: string;
  provider: { asr: string; llm: string };
  split?: "dev" | "test" | "all";
  clipCount: number;
  scoredCount: number;
  failures: number;
  cacheDisabled: boolean;
  transcription: { wer: number | null; cer: number | null; scoredCount: number; scriptDerived?: number };
  noiseMix?: Record<string, number>;
  fields: Record<
    string,
    { correct: number; wrong: number; missed: number; spurious: number;
      precision: number; recall: number; f1: number; accuracy: number }
  >;
  overallFieldAccuracy: number;
  calibration: { bins: CalibrationBin[]; ece: number; brier: number };
  gate: { flaggedShare: number; errorsCaught: number; precisionOfFlag: number };
  clips: Array<{ clipId: string; wer: number | null; cer: number | null; predicted: number; expected: number; flagged: number }>;
}

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const delta = (now: number | null, before?: number | null) => {
  if (now === null || before === undefined || before === null) return "";
  const d = now - before;
  if (Math.abs(d) < 0.0005) return " (=)";
  return d > 0 ? ` (+${(d * 100).toFixed(1)})` : ` (${(d * 100).toFixed(1)})`;
};

export function renderReport(r: EvalReport, prev: EvalReport | null): string {
  const L: string[] = [];

  L.push(`# Evaluation — ${r.ranAt.slice(0, 10)}`);
  L.push("");
  L.push(`ASR \`${r.provider.asr}\` · LLM \`${r.provider.llm}\``);
  L.push(`split \`${r.split ?? "all"}\` · ${r.scoredCount}/${r.clipCount} clips scored${r.failures ? `, ${r.failures} failed` : ""}${r.cacheDisabled ? " · cache bypassed" : ""}`);
  L.push("");

  // Say what is missing, in the report itself. A reader who does not know the
  // word error rate was never measured will read a dash as a zero.
  if (r.transcription.wer === null) {
    L.push("> **Word error rate not measured.** No clip in this set carries a human");
    L.push("> reference transcript, so there is nothing to compare the recogniser against.");
    L.push("> Field accuracy below is unaffected — it is scored against the expected");
    L.push("> observations, not against the transcript.");
    L.push("");
  } else if ((r.transcription.scriptDerived ?? 0) >= r.transcription.scoredCount) {
    L.push("> **The word error rate below is an over-estimate, and should be quoted as one.**");
    L.push("> Its reference is the line the speaker was given to read, not an independent");
    L.push("> transcription of what they actually said — so every fumble and paraphrase is");
    L.push("> counted as a recogniser error. The true rate is lower than this figure.");
    L.push("");
  } else if (r.transcription.scoredCount < r.scoredCount) {
    L.push(`> Word error rate covers ${r.transcription.scoredCount} of ${r.scoredCount} scored clips —`);
    L.push("> the rest have no human reference transcript.");
    L.push("");
  }

  L.push("## The headline");
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  const werCell = r.transcription.wer === null
    ? "**not measured**"
    : `**${pct(r.transcription.wer)}**${delta(r.transcription.wer, prev?.transcription.wer)}`;
  L.push(`| **Word error rate** | ${werCell} |`);
  L.push(`| **Field accuracy** | **${pct(r.overallFieldAccuracy)}**${delta(r.overallFieldAccuracy, prev?.overallFieldAccuracy)} |`);
  L.push(`| Character error rate | ${pct(r.transcription.cer)} |`);
  if (r.transcription.scriptDerived) {
    L.push(`| WER reference | ${r.transcription.scriptDerived} of ${r.transcription.scoredCount} from the read script |`);
  }
  if (r.noiseMix) {
    const parts = Object.entries(r.noiseMix).map(([k, v]) => `${k} ${v}`).join(" · ");
    L.push(`| Recording conditions | ${parts} |`);
  }
  L.push("");
  L.push(
    "The gap between those first two numbers is the entire argument. The " +
      "transcript is wrong and the fields are right, because a closed catalogue " +
      "and a Bangla numeral grammar recover them — not because the acoustic " +
      "model got better.",
  );
  L.push("");

  L.push("## Per field");
  L.push("");
  L.push("| Field | Correct | Wrong | Missed | Spurious | Precision | Recall | F1 |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const [name, f] of Object.entries(r.fields)) {
    L.push(
      `| \`${name}\` | ${f.correct} | ${f.wrong} | ${f.missed} | ${f.spurious} | ` +
        `${pct(f.precision)} | ${pct(f.recall)} | ${pct(f.f1)} |`,
    );
  }
  L.push("");
  L.push("*Wrong* and *spurious* are the expensive columns — a wrong value and an invented one both reach a dashboard looking like data.");
  L.push("");

  L.push("## Does the confidence mean anything?");
  L.push("");
  L.push(`Expected calibration error **${r.calibration.ece.toFixed(3)}**${delta(r.calibration.ece, prev?.calibration.ece)} · Brier ${r.calibration.brier.toFixed(3)}`);
  L.push("");
  L.push("| Confidence band | n | Claimed | Actually correct |");
  L.push("|---|---:|---:|---:|");
  for (const b of r.calibration.bins) {
    if (b.count === 0) continue;
    L.push(`| ${b.lower.toFixed(1)}–${b.upper.toFixed(1)} | ${b.count} | ${pct(b.meanConfidence)} | ${pct(b.observedAccuracy)} |`);
  }
  L.push("");
  L.push(
    "A system whose 0.9 means 0.6 in practice is worse than one with no " +
      "confidence at all: it suppresses exactly the prompts that would have " +
      "caught its own errors.",
  );
  L.push("");

  L.push("## Is the flagging doing real work?");
  L.push("");
  L.push(`Flagged **${pct(r.gate.flaggedShare)}** of fields, and those contain **${pct(r.gate.errorsCaught)}** of all errors.`);
  L.push("");
  L.push(
    r.gate.errorsCaught > r.gate.flaggedShare * 2
      ? "The gate is selecting errors, not choosing at random."
      : "⚠ The gate is barely better than random. Confidence needs work before it can be trusted to interrupt a rep.",
  );
  L.push("");

  if (r.clips.length > 0) {
    L.push("## Per clip");
    L.push("");
    L.push("| Clip | WER | CER | Predicted | Expected | Flagged |");
    L.push("|---|---:|---:|---:|---:|---:|");
    for (const c of r.clips) {
      L.push(`| ${c.clipId} | ${pct(c.wer)} | ${pct(c.cer)} | ${c.predicted} | ${c.expected} | ${c.flagged} |`);
    }
  }

  return L.join("\n");
}

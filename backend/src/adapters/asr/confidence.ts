/**
 * Deriving per-word confidence when a provider does not report it.
 *
 * Stage 6 treats ASR confidence as EVIDENCE — it is one of the multiplied
 * terms deciding whether a rep gets interrupted with a question. So where the
 * number came from has to be written down rather than quietly assumed, and a
 * transcript carrying derived confidence is flagged as such.
 *
 * Whisper-family APIs (including Groq's) return `avg_logprob` per segment and
 * no per-word figure at all. The standard reading is that the mean token
 * probability is exp(avg_logprob): about 0.90 at -0.1, 0.61 at -0.5, 0.37 at
 * -1.0. Every word inside a segment inherits its segment's value, which is
 * coarse but honest — it is a real signal about that stretch of audio, not an
 * invented per-word one.
 *
 * `no_speech_prob` is folded in because a segment the model suspects is
 * silence should not lend confidence to whatever it transcribed there.
 */

export interface SegmentSignal {
  avgLogprob?: number | undefined;
  noSpeechProb?: number | undefined;
  compressionRatio?: number | undefined;
}

/** Below this, output is usually a repetition loop rather than speech. */
const COMPRESSION_RATIO_LIMIT = 2.4;

export function segmentConfidence(sig: SegmentSignal): number {
  const base =
    sig.avgLogprob === undefined ? 0.75 : clamp01(Math.exp(sig.avgLogprob));

  const speech = sig.noSpeechProb === undefined ? 1 : clamp01(1 - sig.noSpeechProb);

  // A runaway compression ratio means the decoder repeated itself; the text
  // may look fluent while corresponding to nothing.
  const sane =
    sig.compressionRatio !== undefined && sig.compressionRatio > COMPRESSION_RATIO_LIMIT
      ? 0.5
      : 1;

  return round(clamp01(base * speech * sane));
}

/**
 * Fallback for providers that return text and nothing else.
 *
 * Deliberately mid-range rather than high. Claiming certainty we have no
 * evidence for would suppress exactly the clarification prompts that make the
 * system safe, and claiming none would flag every field.
 */
export const OPAQUE_PROVIDER_CONFIDENCE = 0.72;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

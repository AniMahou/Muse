import type { Transcript, Word } from "@shared/stage-io";
import { tokenize } from "./text";

/**
 * Build a Transcript from plain text and a uniform confidence.
 *
 * Used by the fake ASR adapter, by fixtures, and by the eval harness when it
 * needs to run stages 2-6 against a human reference transcription rather than
 * a machine one — which is how per-stage metrics get isolated from ASR error.
 */
export function transcriptFromText(
  text: string,
  opts: {
    conf?: number;
    provider?: string;
    model?: string;
    durationSec?: number | null;
    language?: string;
    confidenceDerived?: boolean;
  } = {},
): Transcript {
  const conf = opts.conf ?? 0.9;
  const words: Word[] = tokenize(text).map((t) => ({
    w: t.text,
    start: 0,
    end: 0,
    conf,
    span: t.span,
  }));

  return {
    text,
    words,
    language: opts.language ?? "bn",
    durationSec: opts.durationSec ?? null,
    provider: opts.provider ?? "fixture",
    model: opts.model ?? "fixture",
    confidenceDerived: opts.confidenceDerived ?? false,
  };
}

/**
 * Attach character spans to words that only carry timings.
 *
 * Providers return word text and timestamps but no character offsets, so we
 * walk the transcript and align. Falls back to a whitespace tokenisation when
 * a word cannot be located, which keeps the span array the same length as the
 * word array — downstream code indexes them together.
 */
export function attachSpans(text: string, words: Omit<Word, "span">[]): Word[] {
  const out: Word[] = [];
  let cursor = 0;

  for (const word of words) {
    const needle = word.w.trim();
    if (needle.length === 0) continue;

    let at = text.indexOf(needle, cursor);
    if (at === -1) at = text.indexOf(needle);
    if (at === -1) {
      // Provider emitted a token that is not literally present (normalisation,
      // punctuation folding). Give it a zero-width span at the cursor so
      // indices stay aligned rather than dropping the word.
      out.push({ ...word, span: [cursor, cursor] });
      continue;
    }
    out.push({ ...word, span: [at, at + needle.length] });
    cursor = at + needle.length;
  }
  return out;
}

/**
 * Mean ASR confidence over a character span.
 *
 * Words are weighted by how much of them the span actually covers, so a span
 * clipping the edge of a word does not inherit its full confidence.
 */
export function confidenceOverSpan(t: Transcript, span: [number, number]): number {
  const [s, e] = span;
  if (e <= s) return 0;

  let weighted = 0;
  let total = 0;

  for (const w of t.words) {
    const overlap = Math.min(e, w.span[1]) - Math.max(s, w.span[0]);
    if (overlap <= 0) continue;
    weighted += w.conf * overlap;
    total += overlap;
  }

  if (total === 0) {
    // No word overlaps the span. Fall back to the transcript mean rather than
    // reporting zero confidence, which would flag every such field.
    if (t.words.length === 0) return 0.5;
    return t.words.reduce((a, w) => a + w.conf, 0) / t.words.length;
  }
  return weighted / total;
}

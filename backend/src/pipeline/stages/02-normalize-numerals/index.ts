import type { QuantityAnnotation, Transcript } from "@shared/stage-io";
import { tokenize, type Token } from "@/common/text";
import { phoneticKeySimilarity } from "@/common/bangla-phonetic";
import {
  LEXICON,
  COMPOUNDS,
  FUZZY_FORMS,
  normalizeToken,
  bengaliDigitsToAscii,
  type LexEntry,
} from "./lexicon";
import type { NumeralStageOptions, NumeralStageOutput } from "./types";

interface Matched {
  token: Token;
  entry: LexEntry;
  /** 1 for an exact canonical hit, lower for a variant or a fuzzy match. */
  confidence: number;
  /** Present when the token was a bare number rather than a lexicon word. */
  literal?: number;
  compoundBasis?: string;
}

const DIGIT_RE = /^\d+(?:\.\d+)?$/;

/**
 * Stage 2 — Bangla quantity grammar.
 *
 * Reads the transcript and emits quantity annotations. It does NOT rewrite the
 * transcript: every annotation carries a span pointing back at the characters
 * it came from, so stage 6 can ask how confident the ASR was over exactly
 * those characters, and the review UI can highlight them.
 *
 * Pure and dependency-free by design — no ports, no I/O, no model. A test
 * constructs it with `new NumeralStage()` and nothing else, which is what
 * keeps the suite in the millisecond range.
 */
export class NumeralStage {
  readonly name = "02-normalize-numerals";

  private readonly fuzzyThreshold: number;
  private readonly variantPenalty: number;
  private readonly fuzzyPenalty: number;

  constructor(opts: NumeralStageOptions = {}) {
    this.fuzzyThreshold = opts.fuzzyThreshold ?? 0.85;
    this.variantPenalty = opts.variantPenalty ?? 0.95;
    this.fuzzyPenalty = opts.fuzzyPenalty ?? 0.9;
  }

  run(transcript: Transcript): NumeralStageOutput {
    const tokens = tokenize(transcript.text);
    const matched = tokens.map((t) => this.matchToken(t));
    const quantities: QuantityAnnotation[] = [];

    let i = 0;
    while (i < matched.length) {
      const m = matched[i];
      if (!m || !this.startsQuantity(m)) {
        i++;
        continue;
      }
      const parsed = this.parseRun(matched, i, transcript.text);
      if (parsed) {
        quantities.push(parsed.annotation);
        i = parsed.nextIndex;
      } else {
        i++;
      }
    }

    return { quantities };
  }

  // -------------------------------------------------------------------------
  // Token classification
  // -------------------------------------------------------------------------

  private matchToken(token: Token): Matched | null {
    const norm = normalizeToken(token.text);
    if (norm.length === 0) return null;

    // Bare numbers, Bengali or ASCII digits.
    const ascii = bengaliDigitsToAscii(norm);
    if (DIGIT_RE.test(ascii)) {
      return {
        token,
        entry: { kind: "cardinal", value: Number(ascii), canonical: ascii },
        confidence: 1,
        literal: Number(ascii),
      };
    }

    const compound = COMPOUNDS.get(norm);
    if (compound) {
      return {
        token,
        entry: { kind: "cardinal", value: compound.value, canonical: token.text },
        confidence: 1,
        compoundBasis: compound.basis,
      };
    }

    const exact = LEXICON.get(norm);
    if (exact) {
      // Canonical spelling scores 1; a listed variant takes a small penalty so
      // that stage 6 can distinguish "heard it cleanly" from "recovered it".
      const isCanonical = normalizeToken(exact.canonical) === norm;
      return { token, entry: exact, confidence: isCanonical ? 1 : this.variantPenalty };
    }

    return this.fuzzyMatch(token, norm);
  }

  /**
   * Last resort for spellings the variant table does not list.
   *
   * Compared in PHONETIC space rather than by raw edit distance, because the
   * corruptions ASR actually produces are sound-preserving: তীন for তিন
   * differs only in vowel length, which is orthographic and not phonemic. Raw
   * edit distance sees one substitution in three characters (0.67) and
   * rejects it; phonetically the two are identical.
   *
   * Uses the STRICT comparison, keeping vowels. The lenient skeleton variant
   * used for product names would read স্টোরে ("at the store") as সতেরো (17),
   * since both reduce to s-t-r.
   *
   * A hit here is recorded at visibly lower confidence than a canonical
   * spelling, so stage 6 can tell "heard it cleanly" from "recovered it" and
   * decide whether the difference is worth asking the rep about.
   */
  private fuzzyMatch(token: Token, norm: string): Matched | null {
    if (norm.length < 2) return null;

    let best: { form: string; score: number } | null = null;
    for (const form of FUZZY_FORMS) {
      const score = phoneticKeySimilarity(norm, form);
      if (!best || score > best.score) best = { form, score };
      if (score === 1) break;
    }

    if (!best || best.score < this.fuzzyThreshold) return null;
    const entry = LEXICON.get(best.form);
    if (!entry) return null;

    return { token, entry, confidence: best.score * this.fuzzyPenalty };
  }

  private startsQuantity(m: Matched | null | undefined): boolean {
    if (!m) return false;
    return (
      m.entry.kind === "cardinal" ||
      m.entry.kind === "fraction_standalone" ||
      m.entry.kind === "fraction_prefix"
    );
  }

  private isNumeric(m: Matched | null | undefined): boolean {
    if (!m) return false;
    return (
      m.entry.kind === "cardinal" ||
      m.entry.kind === "fraction_standalone" ||
      m.entry.kind === "fraction_prefix" ||
      m.entry.kind === "scale" ||
      m.entry.kind === "count_multiplier"
    );
  }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Consume one quantity expression starting at `start`.
   *
   * Grammar, loosely:
   *   RUN  := (FRACTION | CARDINAL | SCALE | COUNT_MULT)+  UNIT?
   *
   * Groups accumulate multiplicatively and flush additively at scales of a
   * thousand or more, which is what makes "তিন হাজার পাঁচশ" evaluate to 3500
   * rather than to two unrelated numbers.
   */
  private parseRun(
    matched: Array<Matched | null>,
    start: number,
    text: string,
  ): { annotation: QuantityAnnotation; nextIndex: number } | null {
    let total = 0;
    let current = 0;
    let pendingPrefix: LexEntry | null = null;
    let sawValue = false;

    const parts: string[] = [];
    let minConfidence = 1;
    let i = start;
    let lastIndex = start;

    while (i < matched.length) {
      const m = matched[i];
      if (!this.isNumeric(m) || !m) break;

      minConfidence = Math.min(minConfidence, m.confidence);

      switch (m.entry.kind) {
        case "fraction_standalone": {
          if (sawValue && current !== 0) {
            total += current;
            current = 0;
          }
          current = m.entry.value;
          parts.push(`${m.entry.value} (${m.entry.canonical})`);
          sawValue = true;
          break;
        }
        case "fraction_prefix": {
          // Holds until the cardinal it modifies arrives.
          pendingPrefix = m.entry;
          break;
        }
        case "cardinal": {
          let v = m.entry.value;
          if (pendingPrefix) {
            v = v + pendingPrefix.value;
            parts.push(`${m.entry.value} ${pendingPrefix.value >= 0 ? "+" : "−"} ${Math.abs(pendingPrefix.value)} (${pendingPrefix.canonical} ${m.entry.canonical})`);
            pendingPrefix = null;
          } else if (m.compoundBasis) {
            parts.push(m.compoundBasis);
          } else {
            parts.push(`${v}${m.literal === undefined ? ` (${m.entry.canonical})` : ""}`);
          }
          if (current !== 0) {
            // A second bare cardinal begins a new additive group.
            total += current;
          }
          current = v;
          sawValue = true;
          break;
        }
        case "scale": {
          current = (current === 0 ? 1 : current) * m.entry.value;
          parts.push(`× ${m.entry.value} (${m.entry.canonical})`);
          sawValue = true;
          if (m.entry.value >= 1000) {
            total += current;
            current = 0;
          }
          break;
        }
        case "count_multiplier": {
          current = (current === 0 ? 1 : current) * m.entry.value;
          parts.push(`× ${m.entry.value} (${m.entry.canonical})`);
          sawValue = true;
          break;
        }
        default:
          break;
      }

      lastIndex = i;
      i++;
    }

    // A dangling prefix with no cardinal after it ("সাড়ে" alone) is not a
    // quantity. Emitting 0.5 there would be a confident wrong answer.
    if (!sawValue || pendingPrefix) return null;

    total += current;

    // Optional trailing unit of measure.
    let unit: string | null = null;
    let endIndex = lastIndex;
    const next = matched[i];
    if (next && next.entry.kind === "unit" && next.entry.unit) {
      unit = next.entry.unit;
      minConfidence = Math.min(minConfidence, next.confidence);
      parts.push(next.entry.unit);
      endIndex = i;
      i++;
    }

    // A count multiplier with no stated unit means individual pieces —
    // "দেড় ডজন" is eighteen items, not one-and-a-half of something.
    if (!unit) {
      const usedCountMultiplier = matched
        .slice(start, endIndex + 1)
        .some((mm) => mm?.entry.kind === "count_multiplier");
      if (usedCountMultiplier) unit = "piece";
    }

    const first = matched[start];
    const last = matched[endIndex];
    if (!first || !last) return null;

    const span: [number, number] = [first.token.span[0], last.token.span[1]];

    return {
      annotation: {
        span,
        raw: text.slice(span[0], span[1]),
        value: round(total),
        unit,
        basis: parts.join(" "),
        confidence: round(minConfidence, 4),
      },
      nextIndex: i,
    };
  }
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Tokenisation with character spans.
 *
 * Spans are load-bearing throughout the pipeline. Every annotation points back
 * into the original transcript by character offset, which is what lets stage 6
 * ask "how confident was the ASR over exactly the characters that produced
 * this field" and what lets the review UI shade the transcript by confidence.
 */

export interface Token {
  text: string;
  /** [start, end) into the source string. */
  span: [number, number];
  index: number;
}

/**
 * Word-ish tokens: runs of anything that is not whitespace or standalone
 * punctuation. Bangla has no case and uses ‌দাঁড়ি (।) as a full stop, so we
 * strip a small punctuation set from the edges rather than relying on \b,
 * which is Latin-centric.
 */
const EDGE_PUNCT = /^[।,.;:!?"'()[\]{}—–-]+|[।,.;:!?"'()[\]{}—–-]+$/g;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let index = 0;

  while ((m = re.exec(text)) !== null) {
    const rawStart = m.index;
    const raw = m[0];

    // Trim edge punctuation while keeping the span honest.
    const leading = raw.match(/^[।,.;:!?"'()[\]{}—–-]+/)?.[0]?.length ?? 0;
    const trailing = raw.match(/[।,.;:!?"'()[\]{}—–-]+$/)?.[0]?.length ?? 0;
    const clean = raw.slice(leading, raw.length - trailing);
    if (clean.length === 0) continue;

    tokens.push({
      text: clean,
      span: [rawStart + leading, rawStart + leading + clean.length],
      index: index++,
    });
  }
  return tokens;
}

/** Strip edge punctuation without touching spans. */
export function stripPunct(s: string): string {
  return s.replace(EDGE_PUNCT, "");
}

/** Merge a contiguous run of tokens into one span. */
export function spanOf(tokens: Token[], from: number, to: number): [number, number] {
  const first = tokens[from];
  const last = tokens[to];
  if (!first || !last) throw new Error(`spanOf: index out of range (${from}..${to})`);
  return [first.span[0], last.span[1]];
}

/** Do two spans share any characters? */
export function spansOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Levenshtein distance, iterative with a rolling row. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a[i - 1];
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/** 1 - normalised edit distance. 1 means identical, 0 means nothing in common. */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return Math.max(0, 1 - levenshtein(a, b) / max);
}

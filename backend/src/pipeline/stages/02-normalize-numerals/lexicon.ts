/**
 * Bangla quantity lexicon.
 *
 * This file is the reason the pipeline works at 30% word error rate. No
 * general-purpose model reliably handles পৌনে or আড়াই, and getting a quantity
 * wrong is the single most expensive extraction failure in the domain — an
 * order of 18 recorded as 1.5 is worse than no record at all.
 *
 * Three token classes carry the arithmetic:
 *
 *   STANDALONE fractions  দেড় = 1.5, আড়াই = 2.5  — complete values by
 *                         themselves; they never take a following cardinal.
 *   PREFIX fractions      সাড়ে X = X + 0.5, সোয়া X = X + 0.25,
 *                         পৌনে X = X − 0.25  — they modify the number after
 *                         them, and পৌনে *subtracts*, which is the one that
 *                         trips up anything doing naive keyword matching.
 *   MULTIPLIERS           ডজন = 12, হালি = 4, কুড়ি = 20, গণ্ডা = 4 —
 *                         units of count, not of measure.
 *
 * Every entry carries spelling variants because ASR emits them constantly
 * (দেড় arrives as দের far more often than not). Variants listed here are
 * matched exactly; anything else falls through to fuzzy matching in index.ts,
 * so the table does not need to be exhaustive to be useful.
 */

export type TokenKind =
  | "cardinal"
  | "fraction_standalone"
  | "fraction_prefix"
  | "scale"
  | "count_multiplier"
  | "unit";

export interface LexEntry {
  kind: TokenKind;
  /** Numeric value. For `fraction_prefix` this is the offset added to the following cardinal. */
  value: number;
  /** Canonical Bangla form, used to build the human-readable derivation. */
  canonical: string;
  /** Normalised unit name, for `unit` entries only. */
  unit?: string;
}

/** Strip zero-width joiners, which appear in Bangla text and break exact lookup. */
export function normalizeToken(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

/** Bengali digits ০-৯ to ASCII, so "১২" and "12" parse identically. */
export function bengaliDigitsToAscii(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

function e(
  kind: TokenKind,
  value: number,
  canonical: string,
  forms: string[],
  unit?: string,
): [string[], LexEntry] {
  return [[canonical, ...forms], { kind, value, canonical, ...(unit ? { unit } : {}) }];
}

const TABLE: Array<[string[], LexEntry]> = [
  // -- standalone fractions ------------------------------------------------
  e("fraction_standalone", 0.5, "আধা", ["আধ", "আধা", "অর্ধেক"]),
  e("fraction_standalone", 1.5, "দেড়", ["দের", "দেড", "দেঢ়", "ডেড়", "দেঁড়"]),
  e("fraction_standalone", 2.5, "আড়াই", ["আরাই", "আড়াই", "আঢ়াই", "আডাই"]),

  // -- prefix fractions ----------------------------------------------------
  e("fraction_prefix", 0.5, "সাড়ে", ["সারে", "সাঢ়ে", "সাড়ে", "সাডে"]),
  e("fraction_prefix", 0.25, "সোয়া", ["শোয়া", "সয়া", "সোয়া"]),
  e("fraction_prefix", -0.25, "পৌনে", ["পোনে", "পউনে", "পৌণে"]),

  // -- cardinals 0-20 ------------------------------------------------------
  e("cardinal", 0, "শূন্য", ["শুন্য"]),
  e("cardinal", 1, "এক", ["একটা", "একটি"]),
  e("cardinal", 2, "দুই", ["দু", "দুটা", "দুটি", "দুইটা"]),
  e("cardinal", 3, "তিন", ["তিনটা", "তিনটি"]),
  e("cardinal", 4, "চার", ["চাইর", "চারটা"]),
  e("cardinal", 5, "পাঁচ", ["পাচ", "পাঁচটা", "পান্চ"]),
  e("cardinal", 6, "ছয়", ["ছয", "ছ", "ছয়টা"]),
  e("cardinal", 7, "সাত", ["সাতটা"]),
  e("cardinal", 8, "আট", ["আটটা"]),
  e("cardinal", 9, "নয়", ["নয", "নই", "নয়টা"]),
  e("cardinal", 10, "দশ", ["দশটা"]),
  e("cardinal", 11, "এগারো", ["এগার", "এগারা"]),
  e("cardinal", 12, "বারো", ["বার", "বারা"]),
  e("cardinal", 13, "তেরো", ["তের", "তেরা"]),
  e("cardinal", 14, "চৌদ্দ", ["চোদ্দ"]),
  e("cardinal", 15, "পনেরো", ["পনের", "পনেরা"]),
  e("cardinal", 16, "ষোল", ["ষোলো", "সোল"]),
  e("cardinal", 17, "সতেরো", ["সতের"]),
  e("cardinal", 18, "আঠারো", ["আঠার"]),
  e("cardinal", 19, "উনিশ", ["ঊনিশ"]),
  e("cardinal", 20, "বিশ", ["বিষ"]),

  // -- cardinals 21-30 -----------------------------------------------------
  e("cardinal", 21, "একুশ", []),
  e("cardinal", 22, "বাইশ", []),
  e("cardinal", 23, "তেইশ", []),
  e("cardinal", 24, "চব্বিশ", []),
  e("cardinal", 25, "পঁচিশ", ["পচিশ"]),
  e("cardinal", 26, "ছাব্বিশ", []),
  e("cardinal", 27, "সাতাশ", []),
  e("cardinal", 28, "আটাশ", []),
  e("cardinal", 29, "ঊনত্রিশ", ["উনত্রিশ"]),
  e("cardinal", 30, "ত্রিশ", ["তিরিশ"]),

  // -- tens ----------------------------------------------------------------
  e("cardinal", 35, "পঁয়ত্রিশ", ["পয়ত্রিশ"]),
  e("cardinal", 40, "চল্লিশ", ["চাল্লিশ"]),
  e("cardinal", 45, "পঁয়তাল্লিশ", []),
  e("cardinal", 50, "পঞ্চাশ", ["পন্চাশ"]),
  e("cardinal", 60, "ষাট", ["শাট"]),
  e("cardinal", 70, "সত্তর", ["সততর"]),
  e("cardinal", 80, "আশি", ["আসি"]),
  e("cardinal", 90, "নব্বই", ["নববই"]),

  // -- scales --------------------------------------------------------------
  e("scale", 100, "শ", ["শত", "শো", "সো"]),
  e("scale", 1_000, "হাজার", ["হাযার"]),
  e("scale", 100_000, "লাখ", ["লক্ষ", "লাক"]),
  e("scale", 10_000_000, "কোটি", ["কটি"]),

  // -- count multipliers ---------------------------------------------------
  e("count_multiplier", 12, "ডজন", ["ডজোন", "ডযন", "ডজ়ন", "ডাজন", "দর্জন", "দরজন"]),
  e("count_multiplier", 4, "হালি", ["হালী", "হালি"]),
  e("count_multiplier", 4, "গণ্ডা", ["গন্ডা"]),
  e("count_multiplier", 2, "জোড়া", ["জোড়া", "জোরা"]),
  e("count_multiplier", 20, "কুড়ি", ["কুরি"]),

  // -- units of measure ----------------------------------------------------
  e("unit", 0, "কার্টন", ["কার্টুন", "কাটুন", "কারটন"], "carton"),
  e("unit", 0, "পিস", ["পিছ", "পিচ", "পিসে"], "piece"),
  e("unit", 0, "বস্তা", ["বস্তা", "বসতা"], "sack"),
  e("unit", 0, "বক্স", ["বাক্স", "বক্সে"], "box"),
  e("unit", 0, "প্যাকেট", ["পেকেট", "প্যাকেট", "পাকেট"], "packet"),
  e("unit", 0, "বোতল", ["বোতোল"], "bottle"),
  e("unit", 0, "ক্রেট", ["ক্রেইট"], "crate"),
  e("unit", 0, "টাকা", ["টেকা", "টাকায়"], "BDT"),
  e("unit", 0, "কেজি", ["কিলো", "কিলোগ্রাম", "কেজী"], "kg"),
  e("unit", 0, "গ্রাম", ["গ্রামে"], "g"),
  e("unit", 0, "লিটার", ["লিটর", "লিটারে"], "litre"),
  e("unit", 0, "মিলি", ["মিলিলিটার", "এমএল"], "ml"),
];

/** Exact-match index: every surface form to its entry. */
export const LEXICON: ReadonlyMap<string, LexEntry> = (() => {
  const m = new Map<string, LexEntry>();
  for (const [forms, entry] of TABLE) {
    for (const f of forms) {
      const k = normalizeToken(f);
      // First writer wins, so a canonical form is never shadowed by another
      // entry's variant (কুড়ি is both a cardinal 20 and a multiplier 20 —
      // the cardinal reading is listed first and is the safer default).
      if (!m.has(k)) m.set(k, entry);
    }
  }
  return m;
})();

/**
 * Compounds written as one word.
 *
 * দেড়শ is extremely common in speech and arrives from ASR unsegmented, so
 * splitting it generically would mean guessing at morpheme boundaries. The
 * handful that actually occur are cheaper to enumerate.
 */
export const COMPOUNDS: ReadonlyMap<string, { value: number; basis: string }> = new Map(
  Object.entries({
    দেড়শ: { value: 150, basis: "1.5 × 100 (দেড়শ)" },
    দেড়শো: { value: 150, basis: "1.5 × 100 (দেড়শ)" },
    দেরশ: { value: 150, basis: "1.5 × 100 (দেড়শ)" },
    আড়াইশ: { value: 250, basis: "2.5 × 100 (আড়াইশ)" },
    আড়াইশো: { value: 250, basis: "2.5 × 100 (আড়াইশ)" },
    দেড়হাজার: { value: 1500, basis: "1.5 × 1000 (দেড় হাজার)" },
    আড়াইহাজার: { value: 2500, basis: "2.5 × 1000 (আড়াই হাজার)" },
  }).map(([k, v]) => [normalizeToken(k), v]),
);

/** All known surface forms, for the fuzzy fallback to search. */
export const ALL_FORMS: readonly string[] = Array.from(LEXICON.keys());

/** Tokens worth attempting a fuzzy match against. Units are excluded — a
 *  near-miss on a unit is far more likely to be an unrelated word. */
export const FUZZY_FORMS: readonly string[] = Array.from(LEXICON.entries())
  .filter(([, v]) => v.kind !== "unit")
  .map(([k]) => k);

/**
 * Canonical quantity words, for decode-time ASR biasing.
 *
 * Short, high-frequency, and the place a mis-hearing costs most: দশ arriving as
 * দাস loses a price change outright, because stage 5 refuses to emit a number
 * the grammar did not parse. Canonical spellings only — the point is to pull
 * the decoder TOWARDS these, and seeding it with the corrupted variants the
 * table also knows would defeat that.
 */
export const BIAS_LEXICON: readonly string[] = Array.from(
  new Set(Array.from(LEXICON.values()).map((e) => e.canonical)),
);

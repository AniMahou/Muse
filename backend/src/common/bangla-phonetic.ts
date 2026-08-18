/**
 * Bangla phonetic normalisation.
 *
 * The core insight behind the whole resolver: Bangla orthography is
 * many-to-one onto sound. শ, ষ and স are all /s/. ণ and ন are both /n/. র, ড়
 * and ঢ় are all /r/. Vowel length (ই/ঈ, উ/ঊ) is orthographic, not phonemic,
 * in modern Bengali speech. Aspiration (ক/খ, ত/থ, প/ফ) is routinely lost or
 * invented by speech recognition.
 *
 * So a transcript can be wrong on the page and right in the ear. Collapsing
 * both the heard text and the catalogue into a common phonetic key means
 * হইল matches হুইল matches "Wheel" — which is how a resolver survives a 30%
 * word error rate without a better acoustic model.
 *
 * Latin is folded into the SAME key space, because a Bangladeshi FMCG
 * catalogue is written in English ("PRAN Mango Juice 250ml") while reps speak
 * Bangla. Without a shared space, no amount of edit distance would connect
 * প্রাণ to PRAN.
 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/** Virama / hasant — a conjunct joiner, carrying no sound of its own. */
const VIRAMA = "\u09CD";

/**
 * Nukta letters, normalised before the per-character walk.
 *
 * ড়, ঢ় and য় are each TWO code points — base letter plus nukta U+09BC — and
 * Unicode's composition-exclusion table means NFC will never join them into
 * the precomposed forms. A naive per-character pass therefore sees only the
 * base letter and silently reads ড় as /d/ when it is /r/, which corrupts
 * every word containing one (আড়াই among them).
 *
 * Both the decomposed and precomposed spellings are folded here, before
 * anything else looks at the string.
 */
const NUKTA_FORMS: Array<[RegExp, string]> = [
  [/\u09A1\u09BC/g, "\u0001"], // ড + nukta  -> /r/
  [/\u09A2\u09BC/g, "\u0001"], // ঢ + nukta  -> /r/
  [/\u09AF\u09BC/g, "\u0002"], // য + nukta  -> /y/
  [/\u09DC/g, "\u0001"],        // precomposed ড়
  [/\u09DD/g, "\u0001"],        // precomposed ঢ়
  [/\u09DF/g, "\u0002"],        // precomposed য়
];

/**
 * Grapheme to phonetic key.
 *
 * Aspirated consonants map onto their unaspirated partner, and the retroflex
 * and dental series collapse together (ট/ত both to `t`, ড/দ both to `d`),
 * because those are precisely the distinctions ASR loses first.
 */
const GRAPHEME: Record<string, string> = {
  // vowels, independent
  অ: "a", আ: "a", ই: "i", ঈ: "i", উ: "u", ঊ: "u", ঋ: "ri",
  এ: "e", ঐ: "oi", ও: "o", ঔ: "ou",
  // vowel signs
  "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u",
  "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou",

  // velars
  ক: "k", খ: "k", গ: "g", ঘ: "g", ঙ: "ng",
  // palatals
  চ: "c", ছ: "c", জ: "j", ঝ: "j", ঞ: "n",
  // retroflex and dental collapse together
  ট: "t", ঠ: "t", ড: "d", ঢ: "d", ণ: "n",
  ত: "t", থ: "t", দ: "d", ধ: "d", ন: "n",
  // labials
  প: "p", ফ: "p", ব: "b", ভ: "b", ম: "m",
  // semivowels, liquids, sibilants
  য: "j", র: "r", ল: "l",
  শ: "s", ষ: "s", স: "s", হ: "h",
  "\u0001": "r", "\u0002": "y", "\u09CE": "t",

  // diacritics that carry sound
  "ং": "ng", // anusvara ং
  "ঃ": "", // visarga ঃ — silent in Bengali
  "ঁ": "", // chandrabindu ঁ — nasalisation, dropped

  // Bengali digits, so numeric SKU tokens survive
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

/**
 * Latin digraphs, applied before single letters.
 *
 * `wh` to `hu` is the one that looks arbitrary and is not: Bengali speakers
 * render English initial "wh" with হু, so "Wheel" is spoken and transcribed
 * হুইল. Without this rule the brand never matches its own catalogue entry.
 */
const LATIN_DIGRAPHS: Array<[RegExp, string]> = [
  [/^wh/g, "hu"],
  [/ph/g, "p"],
  [/th/g, "t"],
  [/kh/g, "k"],
  [/gh/g, "g"],
  [/ch/g, "c"],
  [/sh/g, "s"],
  [/zh/g, "j"],
  [/ck/g, "k"],
  [/ee/g, "i"],
  [/oo/g, "u"],
  [/aa/g, "a"],
  [/ea/g, "i"],
  [/ou/g, "u"],
];

const LATIN_SINGLE: Record<string, string> = {
  // `y` stays `y` rather than folding to `i`, so it lines up with Bangla য়
  // (also `y`). Mapping the two sides differently costs every name carrying
  // one — বিজয় against "Bijoy" being the obvious case.
  q: "k", x: "ks", w: "b", v: "b", z: "j", f: "p", y: "y", c: "k",
};

/** Soft c before a front vowel is /s/: "Excel" to eksel, "juice" to juis. */
const SOFT_C = /c(?=[eiy])/g;

function isBanglaChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x0980 && c <= 0x09ff;
}

/** Collapse runs of the same character: "manggo" to "mango". */
function collapseRuns(s: string): string {
  let out = "";
  for (const ch of s) {
    if (out[out.length - 1] !== ch) out += ch;
  }
  return out;
}

function phoneticBangla(input: string): string {
  let s = input;
  // Nukta letters first — they are two code points and must be folded before
  // anything walks the string one character at a time.
  for (const [re, to] of NUKTA_FORMS) s = s.replace(re, to);
  // ya-phala (্য) only colours the preceding vowel; it is not a /j/.
  s = s.replace(new RegExp(`${VIRAMA}\u09AF`, "g"), "");
  // ra-phala (্র) and reph (র্) are both an /r/ adjacent to the consonant.
  s = s.replace(new RegExp(`${VIRAMA}\u09B0`, "g"), "r");
  s = s.replace(new RegExp(`\u09B0${VIRAMA}`, "g"), "r");

  let out = "";
  for (const ch of s) {
    if (ch === VIRAMA) continue; // remaining conjunct joiners are silent
    const mapped = GRAPHEME[ch];
    if (mapped !== undefined) out += mapped;
    else if (ch === "\u0001" || ch === "\u0002") continue; // handled above
    else if (!isBanglaChar(ch)) out += ch; // Latin or digits mixed inline
  }
  return out;
}

function phoneticLatin(input: string): string {
  let s = input.toLowerCase();
  for (const [re, to] of LATIN_DIGRAPHS) s = s.replace(re, to);
  s = s.replace(SOFT_C, "s");
  // Silent trailing e: "juice" to "juic", which then meets জুস as "jus".
  s = s.replace(/e$/, "");
  let out = "";
  for (const ch of s) {
    if (/[a-z]/.test(ch)) out += LATIN_SINGLE[ch] ?? ch;
    else if (/[0-9]/.test(ch)) out += ch;
  }
  return out;
}

/**
 * Fold a token into the shared phonetic key space.
 *
 * Handles Bangla, Latin, and tokens mixing both. Returns "" for input with no
 * phonetic content, which callers should treat as unmatchable rather than as
 * matching everything.
 */
export function phoneticKey(input: string): string {
  // NFC first: য়, ড় and ঢ় each have a precomposed form AND a base+nukta
  // form. Without normalising, the decomposed spelling misses the lookup
  // table entirely and silently loses a consonant.
  const cleaned = input.normalize("NFC").replace(ZERO_WIDTH, "").trim();
  if (cleaned.length === 0) return "";

  const hasBangla = [...cleaned].some(isBanglaChar);
  const raw = hasBangla ? phoneticBangla(cleaned) : phoneticLatin(cleaned);

  // Vowels carry very little discriminating power once length is collapsed,
  // but dropping them entirely loses too much on short brand names, so they
  // are kept and only runs are squeezed.
  return collapseRuns(raw.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** Phonetic key for a whole phrase, token by token. */
export function phoneticKeys(input: string): string[] {
  return input
    .split(/\s+/)
    .map(phoneticKey)
    .filter((k) => k.length > 0);
}

/**
 * Consonant skeleton of a phonetic key.
 *
 * Vowels are the least trustworthy part of both signals we are comparing.
 * Speech recognition drops and invents them freely (স্টোরে arrives as স্টরে),
 * and transliteration between scripts disagrees about them constantly (জুস
 * versus "juice"). Consonants survive both. Comparing skeletons recovers
 * matches that full-key edit distance misses, without the recall explosion
 * that would come from dropping vowels entirely.
 */
export function consonantSkeleton(key: string): string {
  return key.replace(/[aeiou]/g, "");
}

/**
 * Strict phonetic similarity: full key only, vowels included.
 *
 * For SHORT, closed vocabularies where vowels carry real discriminating
 * power — the numeral lexicon above all. সতেরো (17) and স্টোরে ("at the
 * store") share the consonant skeleton s-t-r exactly, so a skeleton-based
 * comparison reads a shop as the number seventeen. Keeping vowels separates
 * them (stero vs store, 0.6) while still folding তীন onto তিন, whose keys are
 * identical once vowel length collapses.
 */
export function phoneticKeySimilarity(a: string, b: string): number {
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  if (ka.length === 0 || kb.length === 0) return 0;
  if (ka === kb) return 1;
  return ratio(ka, kb);
}

/**
 * Lenient phonetic similarity: better of the full key and the consonant
 * skeleton, 0..1.
 *
 * For LONG, open vocabularies — product and outlet names — where vowels are
 * mostly noise from transliteration and ASR. The skeleton result is
 * discounted slightly so an exact full match always outranks a
 * vowels-ignored one.
 *
 * Do not use this on the numeral lexicon; see phoneticKeySimilarity.
 */
export function phoneticSimilarity(a: string, b: string): number {
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  if (ka.length === 0 || kb.length === 0) return 0;
  if (ka === kb) return 1;

  const full = ratio(ka, kb);
  const sa = consonantSkeleton(ka);
  const sb = consonantSkeleton(kb);
  if (sa.length === 0 || sb.length === 0) return full;

  const skeleton = sa === sb ? 1 : ratio(sa, sb);
  return Math.max(full, skeleton * 0.95);
}

function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return Math.max(0, 1 - editDistance(a, b) / max);
}

function editDistance(a: string, b: string): number {
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
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

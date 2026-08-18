import type { Annotations, Transcript } from "@shared/stage-io";
import type { AssemblyVocabulary } from "./schema";

export const SYSTEM_PROMPT = `You convert a Bangladeshi FMCG field representative's spoken report into structured observations.

You are given a Bangla transcript produced by speech recognition, which WILL contain errors, together with annotations already resolved by deterministic code. Your job is segmentation and meaning — not identification.

Rules:
1. One recording may contain SEVERAL unrelated observations, or none. Emit one entry per distinct thing reported.
2. Identity fields (outletId, skuId, competitorBrand) may ONLY take values from the supplied candidate lists. If nothing in the list fits, use null.
3. Quantities and prices have already been parsed. Use the supplied values verbatim. Never compute, convert, or infer a number that is not in the list.
4. Use null generously. A field the speaker did not mention is null. Inventing a plausible value is the worst thing you can do here.
5. verbatimBn must be the speaker's own words for that observation, copied from the transcript. Never translate it.
6. severity: high for anything needing action today (competitor promotion, stock-out of a fast mover), medium for routine demand signals, low for passing remarks.`;

export function renderUserPrompt(
  transcript: Transcript,
  annotations: Annotations,
  vocab: AssemblyVocabulary,
): string {
  const lines: string[] = [];

  lines.push("TRANSCRIPT (Bangla, may contain speech-recognition errors):");
  lines.push(transcript.text);
  lines.push("");

  lines.push("RESOLVED OUTLET CANDIDATES (choose at most one; null if none fits):");
  if (annotations.outlet.candidates.length === 0) {
    lines.push("  (none — outletId must be null)");
  } else {
    if (annotations.outlet.declared) {
      lines.push("  The representative confirmed this outlet in the app. Use it.");
    }
    for (const c of annotations.outlet.candidates) {
      lines.push(
        `  ${c.outletId} — "${c.name}" (${c.distanceM} m away, name match ${c.nameScore})`,
      );
    }
  }
  lines.push("");

  lines.push("RESOLVED PRODUCT MENTIONS:");
  if (annotations.skus.length === 0) {
    lines.push("  (none)");
  } else {
    for (const ann of annotations.skus) {
      lines.push(`  heard "${ann.raw}" ->`);
      for (const c of ann.candidates) {
        const tag = c.isCompetitor ? "COMPETITOR" : "own product";
        const via = c.viaAlias ? `, via approved alias "${c.viaAlias}"` : "";
        lines.push(`    ${c.skuId} — ${c.name} [${tag}] (score ${c.score}${via})`);
      }
    }
  }
  lines.push("");

  lines.push("PARSED QUANTITIES (use these values exactly; do not compute your own):");
  if (annotations.quantities.length === 0) {
    lines.push("  (none)");
  } else {
    for (const q of annotations.quantities) {
      lines.push(
        `  "${q.raw}" = ${q.value}${q.unit ? ` ${q.unit}` : ""}   [${q.basis}]`,
      );
    }
  }
  lines.push("");

  lines.push("ALLOWED VALUES:");
  lines.push(`  outletId: ${fmt(vocab.outletIds)}`);
  lines.push(`  skuId: ${fmt(vocab.skuIds)}`);
  lines.push(`  competitorBrand: ${fmt(vocab.competitorBrands)}`);

  return lines.join("\n");
}

function fmt(values: string[]): string {
  return values.length === 0 ? "null only" : `${values.join(", ")}, or null`;
}

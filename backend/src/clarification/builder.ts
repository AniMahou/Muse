import { randomUUID } from "node:crypto";
import type { Observation } from "@shared/observation.schema";
import type { Annotations } from "@shared/stage-io";
import type {
  Clarification,
  ClarificationKind,
  ClarificationOption,
} from "@shared/clarification.schema";

export interface BuildOptions {
  /** Hours before an unanswered prompt auto-resolves to the current value. */
  timeoutHours?: number;
  /** Alternatives offered per question, beyond the current value. */
  maxOptions?: number;
}

const FIELD_TO_KIND: Record<string, ClarificationKind> = {
  outletId: "outlet",
  skuId: "sku",
  competitorBrand: "competitor_brand",
  quantity: "quantity",
};

/**
 * Turn flagged fields into questions a rep can answer with one tap.
 *
 * Pure — no database, no clock beyond `now`, so the wording and option
 * ordering can be tested exhaustively without a container.
 *
 * Only fields that stage 6 actually flagged become questions. Asking about
 * everything uncertain would produce a wall of prompts at end of route, and a
 * rep who is asked ten questions answers none.
 */
export function buildClarifications(
  observation: Observation,
  annotations: Annotations,
  now: Date,
  opts: BuildOptions = {},
): Clarification[] {
  const timeoutHours = opts.timeoutHours ?? 24;
  const maxOptions = opts.maxOptions ?? 3;
  const out: Clarification[] = [];

  for (const field of observation.flaggedFields) {
    const kind = FIELD_TO_KIND[field];
    if (!kind) continue;

    const current = (observation as unknown as Record<string, unknown>)[field];
    const options = optionsFor(field, observation, annotations, maxOptions);

    // A question with nothing to choose between is not a question. Better to
    // leave the record flagged for HQ review than to ask an empty prompt.
    if (options.length < 2) continue;

    out.push({
      clarificationId: `clr_${randomUUID()}`,
      companyId: observation.companyId,
      repId: observation.repId,
      observationId: observation.observationId,
      clipId: observation.clipId,
      kind,
      field,
      question: questionFor(kind, options),
      options,
      currentValue: (current as string | number | null) ?? null,
      confidence: observation.fieldConfidence[field] ?? 0,
      status: "pending",
      answeredValue: null,
      answeredAt: null,
      answeredLate: false,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + timeoutHours * 3_600_000).toISOString(),
    });
  }

  return out;
}

function optionsFor(
  field: string,
  observation: Observation,
  annotations: Annotations,
  max: number,
): ClarificationOption[] {
  if (field === "outletId") {
    return annotations.outlet.candidates.slice(0, max).map((c) => ({
      value: c.outletId,
      label: c.name,
      score: c.score,
    }));
  }

  if (field === "skuId" || field === "competitorBrand") {
    const wantCompetitor = field === "competitorBrand";
    const current = observation[field];
    const ann =
      annotations.skus.find((a) => a.candidates.some((c) => c.skuId === current)) ??
      annotations.skus.find((a) => a.candidates.some((c) => c.isCompetitor === wantCompetitor));
    if (!ann) return [];
    return ann.candidates
      .filter((c) => c.isCompetitor === wantCompetitor)
      .slice(0, max)
      .map((c) => ({ value: c.skuId, label: c.name, score: c.score }));
  }

  if (field === "quantity") {
    // Offer the parsed value plus other quantities heard in the same clip —
    // the usual confusion is between two numbers the rep actually said.
    const seen = new Set<number>();
    const opts: ClarificationOption[] = [];
    for (const q of annotations.quantities) {
      if (seen.has(q.value)) continue;
      seen.add(q.value);
      opts.push({
        value: q.value,
        label: `${formatNumber(q.value)}${q.unit ? ` ${q.unit}` : ""}`,
        score: q.confidence,
      });
      if (opts.length >= max) break;
    }
    return opts;
  }

  return [];
}

/** Bangla, short enough to read at a glance on a phone in sunlight. */
function questionFor(kind: ClarificationKind, options: ClarificationOption[]): string {
  switch (kind) {
    case "outlet":
      return options.length === 2
        ? `${options[0]!.label} নাকি ${options[1]!.label}?`
        : "কোন দোকান?";
    case "sku":
      return "কোন পণ্য?";
    case "competitor_brand":
      return "কোন কোম্পানির?";
    case "quantity":
      return options.length === 2
        ? `${options[0]!.label} নাকি ${options[1]!.label}?`
        : "কতটা?";
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

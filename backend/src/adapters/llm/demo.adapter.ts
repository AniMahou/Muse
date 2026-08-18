import type { ILlmProvider, LlmRequest, LlmResponse } from "@/pipeline/ports";

/**
 * Offline stand-in for the assembly model.
 *
 * Exists for two reasons, both real:
 *
 *   1. The project can be run, demonstrated and reviewed with NO API key and
 *      NO network — which is what a fresh clone needs in order to show
 *      anything at all.
 *   2. It is the exhibition's offline backup. Venue wifi fails; a demo that
 *      dies with it is a demo that did not happen.
 *
 * It is not a hard-coded answer. It reads the candidate lists out of the
 * rendered prompt and assembles from them exactly as the real model must, so
 * stages 3 and 4 still genuinely decide what appears — swap the catalogue and
 * the output changes. What it does NOT do is language understanding:
 * segmentation is a crude heuristic, not a model.
 */
export class DemoLlmProvider implements ILlmProvider {
  readonly name = "demo";
  readonly model = "offline-heuristic";

  async complete<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    const outletId = firstMatch(req.user, /^ {2}(OUT-[\w-]+) —/m);
    const ownSkus = allMatches(req.user, / {4}(SKU-[\w-]+) — .*\[own product\]/g);
    const competitors = allMatches(req.user, / {4}(COMP-[\w-]+) — .*\[COMPETITOR\]/g);
    const quantities = parseQuantities(req.user);
    const verbatim = firstMatch(req.user, /^TRANSCRIPT[^\n]*\n(.+)$/m) ?? "";

    const observations: Array<Record<string, unknown>> = [];

    // A demand signal for the best-resolved own product, carrying the first
    // non-currency quantity if one was parsed.
    const sku = ownSkus[0];
    if (sku) {
      const q = quantities.find((x) => x.unit !== "BDT") ?? null;
      observations.push({
        type: "demand_signal",
        outletId,
        skuId: sku,
        competitorBrand: null,
        quantity: q?.value ?? null,
        unit: q?.unit ?? null,
        priceDelta: null,
        severity: "medium",
        verbatimBn: verbatim,
      });
    }

    // A competitor promotion, negating a currency amount if one appeared —
    // "পাঁচ টাকা কম" parses as 5 and means −5.
    const competitor = competitors[0];
    if (competitor) {
      const money = quantities.find((x) => x.unit === "BDT") ?? null;
      observations.push({
        type: "competitor_promo",
        outletId,
        skuId: null,
        competitorBrand: competitor,
        quantity: null,
        unit: null,
        priceDelta: money ? -money.value : null,
        severity: "high",
        verbatimBn: verbatim,
      });
    }

    // Nothing resolved: still emit something, so an empty result is visibly a
    // decision rather than a silent failure.
    if (observations.length === 0 && verbatim.trim().length > 0) {
      observations.push({
        type: "retailer_complaint",
        outletId,
        skuId: null,
        competitorBrand: null,
        quantity: null,
        unit: null,
        priceDelta: null,
        severity: "low",
        verbatimBn: verbatim,
      });
    }

    const candidate = { observations };
    const parsed = req.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `DemoLlmProvider produced output failing schema "${req.schemaName}": ` +
          JSON.stringify(parsed.error.issues).slice(0, 300),
      );
    }
    return { data: parsed.data, raw: JSON.stringify(candidate) };
  }
}

function firstMatch(text: string, re: RegExp): string | null {
  return text.match(re)?.[1]?.trim() ?? null;
}

function allMatches(text: string, re: RegExp): string[] {
  return [...text.matchAll(re)].map((m) => m[1]!).filter(Boolean);
}

function parseQuantities(prompt: string): Array<{ value: number; unit: string | null }> {
  const out: Array<{ value: number; unit: string | null }> = [];
  for (const m of prompt.matchAll(/^ {2}"[^"]*" = ([\d.]+)(?: (\w+))?\s+\[/gm)) {
    const value = Number(m[1]);
    if (Number.isFinite(value)) out.push({ value, unit: m[2] ?? null });
  }
  return out;
}

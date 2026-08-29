import type { IAsrProvider, ICatalogRepo, IOutletRepo } from "@/pipeline/ports";
import { BIAS_LEXICON } from "@/pipeline/stages/02-normalize-numerals/lexicon";
import { ProviderError } from "@/common/errors";
import type { TranscribeStageInput, TranscribeStageOutput } from "./types";

/**
 * Stage 1 — audio to text.
 *
 * A thin stage on purpose. All the provider-specific work (word alignment,
 * confidence derivation, error classification) belongs in the adapters, so
 * that swapping ASR is a container change and nothing here moves.
 *
 * The one piece of logic it does own is the empty-transcript guard: an empty
 * string is not a valid transcript, and letting it through would produce a
 * clip that silently yields no observations with no explanation of why.
 *
 * It also assembles the decode-time vocabulary bias. That belongs here rather
 * than in an adapter because WHICH words to bias towards is a domain question —
 * this rep's brands, the outlets near this GPS point — while HOW to send them
 * is provider-specific. Catalogue access comes through ports, so `pipeline/`
 * still imports nothing concrete.
 */
export class TranscribeStage {
  readonly name = "01-transcribe";

  /**
   * Who actually produced the transcript.
   *
   * Public so the orchestrator can put it in the cache key. It is not a
   * detail: a cached transcript is only valid for the provider that made it.
   */
  get extractor(): { name: string; model: string } {
    return { name: this.asr.name, model: this.asr.model };
  }

  constructor(
    private readonly asr: IAsrProvider,
    private readonly catalog?: ICatalogRepo,
    private readonly outlets?: IOutletRepo,
    private readonly opts: { bias?: boolean; radiusM?: number } = {},
  ) {}

  async run(input: TranscribeStageInput): Promise<TranscribeStageOutput> {
    if (input.audio.byteLength === 0) {
      throw new ProviderError(this.asr.name, `clip ${input.clipId} has no audio`, false);
    }

    const biasTerms = await this.biasTerms(input);

    const transcript = await this.asr.transcribe({
      clipId: input.clipId,
      audio: input.audio,
      mimeType: input.mimeType,
      ...(input.language ? { language: input.language } : {}),
      ...(biasTerms.length ? { biasTerms } : {}),
    });

    if (transcript.text.trim().length === 0) {
      throw new ProviderError(
        this.asr.name,
        `clip ${input.clipId} transcribed to an empty string`,
        true,
      );
    }

    return { transcript };
  }

  /**
   * The words this clip is likely to contain.
   *
   * Scoped, not the whole catalogue. A rep sells 50-200 SKUs and is standing
   * near a handful of shops, and a bias list padded with products he could not
   * have mentioned dilutes the terms that matter — the prompt is a fixed budget,
   * so an irrelevant term costs a relevant one.
   *
   * Never fatal. Biasing is an accuracy optimisation; a catalogue lookup that
   * fails should cost accuracy, not the recording.
   */
  private async biasTerms(input: TranscribeStageInput): Promise<string[]> {
    if (this.opts.bias === false) return [];

    // Ordered by measured value, because the prompt is a fixed budget and the
    // API truncates from the front — whatever is listed first is what survives.
    const outletNames: string[] = [];
    const banglaForms: string[] = [];
    const latinNames: string[] = [];

    try {
      if (this.catalog) {
        const [skus, aliases] = await Promise.all([
          this.catalog.listSkus({
            companyId: input.companyId,
            ...(input.brands ? { brands: input.brands } : {}),
            includeCompetitors: true,
          }),
          this.catalog.listAliases(input.companyId),
        ]);

        const inScope = new Set(skus.map((s) => s.skuId));
        // Approved aliases are the only BANGLA-SCRIPT product vocabulary the
        // system owns, and script is what decides whether biasing works at all:
        // measured on one clip, a Latin prompt moved সার্ফেক্সেলে to সার্ফ একসেলে
        // while the Bangla form recovered সার্ফ এক্সেলে exactly. The decoder is
        // emitting Bengali tokens, and a Latin prompt primes the wrong ones.
        //
        // Which makes the alias table compound twice over: every form an admin
        // approves improves the RESOLVER on the next clip, and improves the
        // TRANSCRIPT that feeds it.
        for (const a of aliases) {
          if (inScope.has(a.skuId)) banglaForms.push(a.surface);
        }

        for (const s of skus) {
          latinNames.push(s.name);
          if (s.brand) latinNames.push(s.brand);
        }
      }

      if (this.outlets && input.geo) {
        const near = await this.outlets.findNear(
          input.companyId,
          input.geo,
          this.opts.radiusM ?? 200,
        );
        // The shop name decides attribution and there are only ever a handful
        // of candidates, so it is the highest value per character in the budget.
        outletNames.push(...near.map((o) => o.name));
      }
    } catch {
      // Biasing is an accuracy optimisation. A catalogue lookup that fails
      // should cost accuracy, never the recording.
      return [...outletNames, ...banglaForms, ...BIAS_LEXICON, ...latinNames];
    }

    // Quantity words are worth their place: they are short, they recur in every
    // clip, and they are where a mis-hearing is most expensive — দশ heard as
    // দাস loses a price change outright, because stage 5 will not emit a number
    // the grammar could not parse.
    return [...outletNames, ...banglaForms, ...BIAS_LEXICON, ...latinNames];
  }
}

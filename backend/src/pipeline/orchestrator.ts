import type { z } from "zod";
import type { Annotations, PipelineInput, PipelineResult } from "@shared/stage-io";
import {
  AnnotationsSchema,
  PipelineResultSchema,
  TranscriptSchema,
} from "@shared/stage-io";
import type { IOcrProvider, IStorage } from "./ports";
import type { TranscribeStage } from "./stages/01-transcribe";
import type { NumeralStage } from "./stages/02-normalize-numerals";
import type { SkuResolverStage } from "./stages/03-resolve-sku";
import type { OutletResolverStage } from "./stages/04-resolve-outlet";
import type { AssembleStage } from "./stages/05-assemble";
import type { ConfidenceStage } from "./stages/06-confidence";
import { StageContractError } from "@/common/errors";
import { sha256 } from "@/common/hash";
import { StageCache } from "./cache";
import { Tracer } from "./trace";

/**
 * Bumped when a stage's behaviour changes in a way that invalidates cached
 * output. Part of the cache key, so a logic change cannot be masked by a hit.
 */
export const PIPELINE_VERSION = "1";

export interface OrchestratorStages {
  transcribe: TranscribeStage;
  /** Optional: only companies using photo capture need one. */
  ocr?: IOcrProvider;
  numerals: NumeralStage;
  sku: SkuResolverStage;
  outlet: OutletResolverStage;
  assemble: AssembleStage;
  confidence: ConfidenceStage;
}

export interface OrchestratorOptions {
  language?: string;
  traceDir?: string;
  traceEnabled?: boolean;
  cacheDir?: string;
  cacheEnabled?: boolean;
  validateStageIo?: boolean;
  /** The rep's brand portfolio, which scopes the SKU candidate set. */
  brands?: string[];
}

export type ExtractionSource = "voice" | "photo";

/**
 * Composes the six stages.
 *
 * The shape that matters: stages 2, 3 and 4 run CONCURRENTLY. They each read
 * the same transcript and emit disjoint annotations — quantities do not depend
 * on products, products do not depend on outlets — so serialising them would
 * add latency for nothing. It also means a slow catalogue lookup cannot delay
 * the numeral grammar.
 *
 * Everything else is strictly ordered, because stage 5 needs all three
 * annotation sets to build its vocabulary and stage 6 needs stage 5's output
 * to have something to score.
 */
export class PipelineOrchestrator {
  private readonly cache: StageCache;

  constructor(
    private readonly stages: OrchestratorStages,
    private readonly storage: IStorage,
    private readonly opts: OrchestratorOptions = {},
  ) {
    this.cache = new StageCache(opts.cacheDir ?? "./.cache/stages", opts.cacheEnabled ?? false);
  }

  async run(input: PipelineInput & { source?: ExtractionSource }): Promise<PipelineResult> {
    const tracer = new Tracer(
      input.clipId,
      this.opts.traceDir ?? "./traces",
      this.opts.traceEnabled ?? false,
    );
    const timings: Record<string, number> = {};
    const cacheHits: string[] = [];

    try {
      const audio: Uint8Array = input.audio ?? (await this.storage.get(input.storageKey));
      const audioHash = sha256(audio);

      // ---- 1. extract text ------------------------------------------------
      // Voice and photo diverge for exactly one stage. Everything after this
      // line is identical, which is what makes adding a modality cheap.
      const source: ExtractionSource = input.source ?? "voice";
      const usePhoto = source === "photo" && !!this.stages.ocr;
      const stageName = usePhoto ? "01-ocr" : "01-transcribe";

      const transcript = await this.step(
        stageName,
        // brands is part of the key: biasing changes the transcript, so a clip
        // cached under one portfolio must not be replayed under another.
        {
          hash: audioHash,
          source,
          language: this.opts.language,
          mimeType: input.mimeType,
          brands: this.opts.brands ?? null,
        },
        () =>
          usePhoto
            ? this.stages.ocr!.recognise({
                clipId: input.clipId,
                image: audio,
                mimeType: input.mimeType,
                ...(this.opts.language ? { language: this.opts.language } : {}),
              })
            : this.stages.transcribe
                .run({
                  clipId: input.clipId,
                  companyId: input.companyId,
                  audio,
                  mimeType: input.mimeType,
                  geo: input.geo,
                  ...(this.opts.language ? { language: this.opts.language } : {}),
                  ...(this.opts.brands ? { brands: this.opts.brands } : {}),
                })
                .then((r) => r.transcript),
        TranscriptSchema,
        { tracer, timings, cacheHits, input: { clipId: input.clipId, bytes: audio.byteLength, source } },
      );

      // ---- 2/3/4. annotate, concurrently ---------------------------------
      const annotate = Date.now();
      const [quantities, skus, outlet] = await Promise.all([
        Promise.resolve(this.stages.numerals.run(transcript)).then((r) => r.quantities),
        this.stages.sku
          .run({
            transcript,
            companyId: input.companyId,
            ...(this.opts.brands ? { brands: this.opts.brands } : {}),
          })
          .then((r) => r.skus),
        this.stages.outlet
          .run({
            transcript,
            companyId: input.companyId,
            geo: input.geo,
            declaredOutletId: input.declaredOutletId,
          })
          .then((r) => r.outlet),
      ]);
      timings["annotate(02,03,04)"] = Date.now() - annotate;

      const annotations: Annotations = { quantities, skus, outlet };
      this.validate("02,03,04", AnnotationsSchema, annotations);
      tracer.record({
        stage: "02,03,04-annotate",
        ms: timings["annotate(02,03,04)"] ?? 0,
        cached: false,
        input: { text: transcript.text },
        output: annotations,
      });

      // ---- 5. assemble ---------------------------------------------------
      const assembleStart = Date.now();
      const assembled = await this.stages.assemble.run({ transcript, annotations });
      timings["05-assemble"] = Date.now() - assembleStart;
      tracer.record({
        stage: "05-assemble",
        ms: timings["05-assemble"] ?? 0,
        cached: false,
        input: { text: transcript.text, annotations },
        output: assembled,
      });

      // ---- 6. confidence -------------------------------------------------
      const confStart = Date.now();
      const scored = this.stages.confidence.run({
        transcript,
        annotations,
        observations: assembled.observations,
      });
      timings["06-confidence"] = Date.now() - confStart;
      tracer.record({
        stage: "06-confidence",
        ms: timings["06-confidence"] ?? 0,
        cached: false,
        input: { observations: assembled.observations },
        output: scored.observations,
      });

      const result: PipelineResult = {
        clipId: input.clipId,
        transcript,
        annotations,
        observations: scored.observations,
        timings,
        cacheHits,
      };

      this.validate("pipeline", PipelineResultSchema, result);
      await tracer.flush({ companyId: input.companyId, repId: input.repId });
      return result;
    } catch (err) {
      tracer.record({
        stage: "pipeline",
        ms: 0,
        cached: false,
        input: { clipId: input.clipId },
        output: null,
        error: err instanceof Error ? err.message : String(err),
      });
      await tracer.flush({ failed: true }).catch(() => undefined);
      throw err;
    }
  }

  /** Run one cacheable stage, validating, timing and tracing it. */
  private async step<T>(
    name: string,
    keyInput: unknown,
    compute: () => Promise<T>,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    ctx: {
      tracer: Tracer;
      timings: Record<string, number>;
      cacheHits: string[];
      input: unknown;
    },
  ): Promise<T> {
    const started = Date.now();
    const key = this.cache.key(name, PIPELINE_VERSION, keyInput);
    const { value, cached } = await this.cache.wrap(key, compute);

    ctx.timings[name] = Date.now() - started;
    if (cached) ctx.cacheHits.push(name);

    this.validate(name, schema, value);
    ctx.tracer.record({
      stage: name,
      ms: ctx.timings[name] ?? 0,
      cached,
      input: ctx.input,
      output: value,
    });
    return value;
  }

  /**
   * Check a stage's output against its own contract.
   *
   * Dev-only by default. A stage that violates its schema fails loudly at the
   * seam rather than producing something three stages downstream cannot make
   * sense of, which is the difference between a five-minute fix and an
   * afternoon.
   */
  private validate<T>(stage: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): void {
    if (!this.opts.validateStageIo) return;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new StageContractError(stage, "output", parsed.error.issues);
  }
}

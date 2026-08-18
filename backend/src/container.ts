import Redis from "ioredis";
import type { Db } from "mongodb";
import { config, assertProviderKeys } from "@/common/config";
import { logger } from "@/common/logger";
import { collections, type Collections } from "@/db/client";

import type { IAsrProvider, ILlmProvider, IStorage } from "@/pipeline/ports";
import { FakeAsrProvider } from "@/adapters/asr/fake.adapter";
import { GroqAsrProvider } from "@/adapters/asr/groq.adapter";
import { GeminiAsrProvider } from "@/adapters/asr/gemini.adapter";
import { LocalWhisperProvider } from "@/adapters/asr/local-whisper.adapter";
import { DemoLlmProvider } from "@/adapters/llm/demo.adapter";
import { GroqLlmProvider } from "@/adapters/llm/groq.adapter";
import { GeminiLlmProvider } from "@/adapters/llm/gemini.adapter";
import { LocalStorage } from "@/adapters/storage/local.adapter";
import { S3Storage } from "@/adapters/storage/s3.adapter";
import { MongoCatalogRepo, MongoOutletRepo } from "@/adapters/catalog/mongo.repo";

import { TranscribeStage } from "@/pipeline/stages/01-transcribe";
import { NumeralStage } from "@/pipeline/stages/02-normalize-numerals";
import { SkuResolverStage } from "@/pipeline/stages/03-resolve-sku";
import { OutletResolverStage } from "@/pipeline/stages/04-resolve-outlet";
import { AssembleStage } from "@/pipeline/stages/05-assemble";
import { ConfidenceStage } from "@/pipeline/stages/06-confidence";
import { PipelineOrchestrator } from "@/pipeline/orchestrator";

import { ObservationRepository } from "@/observations/repository";
import { IdempotencyService } from "@/ingest/idempotency.service";
import { RealtimeGateway } from "@/realtime/gateway";

/**
 * The composition root — the ONE place concrete adapters are chosen.
 *
 * No DI container, no decorators, no reflect-metadata. For a pipeline this
 * size explicit wiring is not a compromise, it is the readable option: the
 * whole dependency graph is one function you can read top to bottom, and a
 * test swaps any part of it by calling the same builders with fakes.
 *
 * Everything above this file depends on ports. Nothing in pipeline/ can even
 * import an adapter — an eslint rule enforces it.
 */
export interface Container {
  redis: Redis;
  collections: Collections;
  repo: ObservationRepository;
  idempotency: IdempotencyService;
  realtime: RealtimeGateway;
  storage: IStorage;
  asr: IAsrProvider;
  llm: ILlmProvider;
  orchestrator: PipelineOrchestrator;
  buildOrchestrator(opts?: { brands?: string[] }): PipelineOrchestrator;
  close(): Promise<void>;
}

export function buildAsr(): IAsrProvider {
  switch (config.asrProvider) {
    case "groq":
      return new GroqAsrProvider(config.groqAsrModel, config.groqApiKey);
    case "gemini":
      return new GeminiAsrProvider(config.geminiAsrModel, config.geminiApiKey);
    case "local":
      return new LocalWhisperProvider(config.whisperCppBin, config.whisperCppModel);
    case "fake":
      // Demo mode: a canned Bangla transcript for any clip, so the pipeline
      // runs with no key and no network. Deliberately the ASR-corrupted
      // reference clip (প্রান, দের, হইল) rather than a clean one — a demo
      // that only works on perfect input proves nothing.
      return new FakeAsrProvider(
        {},
        {
          fallbackText:
            "বিজয় স্টরে প্রান ম্যাঙ্গো জুস দের ডজন লাগবে " +
            "আর হইল এর নতুন অফার দিছে পাচ টাকা কম",
          defaultConf: 0.78,
        },
      );
  }
}

export function buildLlm(): ILlmProvider {
  switch (config.llmProvider) {
    case "groq":
      return new GroqLlmProvider(config.groqLlmModel, config.groqApiKey);
    case "gemini":
      return new GeminiLlmProvider(config.geminiLlmModel, config.geminiApiKey);
    case "fake":
      return new DemoLlmProvider();
  }
}

export function buildStorage(): IStorage {
  return config.storageDriver === "s3"
    ? new S3Storage({ bucket: process.env.S3_BUCKET ?? "", region: process.env.S3_REGION ?? "" })
    : new LocalStorage(config.storageLocalDir);
}

export function buildContainer(db: Db): Container {
  assertProviderKeys();

  const cols = collections(db);
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  const storage = buildStorage();
  const asr = buildAsr();
  const llm = buildLlm();

  const catalog = new MongoCatalogRepo(cols);
  const outlets = new MongoOutletRepo(cols);

  const buildOrchestrator = (opts: { brands?: string[] } = {}) =>
    new PipelineOrchestrator(
      {
        transcribe: new TranscribeStage(asr),
        numerals: new NumeralStage(),
        sku: new SkuResolverStage(catalog, {
          minScore: config.skuMatchMinScore,
          maxCandidates: config.skuMaxCandidates,
        }),
        outlet: new OutletResolverStage(outlets, {
          radiusM: config.outletRadiusM,
          maxCandidates: config.outletMaxCandidates,
        }),
        assemble: new AssembleStage(llm, {
          temperature: config.llmTemperature,
          maxTokens: config.llmMaxTokens,
        }),
        confidence: new ConfidenceStage({
          threshold: config.confidenceThreshold,
          criticalFields: config.criticalFields,
        }),
      },
      storage,
      {
        language: config.asrLanguage,
        traceEnabled: config.traceEnabled,
        traceDir: config.traceDir,
        cacheEnabled: config.stageCacheEnabled,
        cacheDir: config.stageCacheDir,
        validateStageIo: config.validateStageIo,
        ...(opts.brands ? { brands: opts.brands } : {}),
      },
    );

  logger.info(
    { asr: `${asr.name}/${asr.model}`, llm: `${llm.name}/${llm.model}`, storage: storage.name },
    "container built",
  );

  return {
    redis,
    collections: cols,
    repo: new ObservationRepository(cols),
    idempotency: new IdempotencyService(redis),
    realtime: new RealtimeGateway(),
    storage,
    asr,
    llm,
    orchestrator: buildOrchestrator(),
    buildOrchestrator,
    async close() {
      redis.disconnect();
    },
  };
}

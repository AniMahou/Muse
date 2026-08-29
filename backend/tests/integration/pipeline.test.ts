import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PipelineOrchestrator } from "@/pipeline/orchestrator";
import { TranscribeStage } from "@/pipeline/stages/01-transcribe";
import { NumeralStage } from "@/pipeline/stages/02-normalize-numerals";
import { SkuResolverStage } from "@/pipeline/stages/03-resolve-sku";
import { OutletResolverStage } from "@/pipeline/stages/04-resolve-outlet";
import { AssembleStage } from "@/pipeline/stages/05-assemble";
import { ConfidenceStage } from "@/pipeline/stages/06-confidence";

import { FakeAsrProvider } from "@/adapters/asr/fake.adapter";
import { FakeLlmProvider } from "@/adapters/llm/fake.adapter";
import { MemoryStorage } from "@/adapters/storage/local.adapter";
import { InMemoryCatalogRepo, InMemoryOutletRepo } from "@/adapters/catalog/in-memory.repo";

import { SKUS, ALIASES } from "@/pipeline/stages/03-resolve-sku/fixtures/catalog";
import { OUTLETS, NEAR_GEO } from "@/pipeline/stages/04-resolve-outlet/fixtures/outlets";
import type { LlmRequest } from "@/pipeline/ports";

const COMPANY = "acme-bd";
const CLIP = "clip-integration-1";

/** The reference clip, as speech recognition actually mangles it. */
const MANGLED =
  "বিজয় স্টরে প্রান ম্যাঙ্গো জুস দের ডজন লাগবে আর হইল এর নতুন অফার দিছে পাচ টাকা কম";

/**
 * Stands in for the assembly model.
 *
 * Reads only the candidate lists it is given, exactly as the real one must,
 * so the test exercises the enum lock rather than a hard-coded answer.
 */
function assemblyHandler(req: LlmRequest<unknown>) {
  const pick = (re: RegExp) => req.user.match(re)?.[1] ?? null;
  const outletId = pick(/\n {2}(OUT-\d+) —/);
  const skuId = pick(/ {4}(SKU-\d+) —/);
  const competitor = pick(/ {4}(COMP-[A-Z]+) —/);

  return {
    observations: [
      {
        type: "demand_signal",
        outletId,
        skuId,
        competitorBrand: null,
        quantity: 18,
        unit: "piece",
        priceDelta: null,
        severity: "medium",
        verbatimBn: "প্রান ম্যাঙ্গো জুস দের ডজন লাগবে",
        mentionIndex: "0",
      },
      {
        type: "competitor_promo",
        outletId,
        skuId: null,
        competitorBrand: competitor,
        quantity: null,
        unit: null,
        priceDelta: -5,
        severity: "high",
        verbatimBn: "হইল এর নতুন অফার দিছে পাচ টাকা কম",
        mentionIndex: "1",
      },
    ],
  };
}

let tmpDir: string;
let storage: MemoryStorage;

function build(opts: { transcriptText?: string; cacheDir?: string; cacheEnabled?: boolean } = {}) {
  const asr = new FakeAsrProvider({ [CLIP]: opts.transcriptText ?? MANGLED }, { defaultConf: 0.88 });
  const llm = new FakeLlmProvider({ handler: assemblyHandler });

  const orchestrator = new PipelineOrchestrator(
    {
      transcribe: new TranscribeStage(asr),
      numerals: new NumeralStage(),
      sku: new SkuResolverStage(new InMemoryCatalogRepo(SKUS, ALIASES)),
      outlet: new OutletResolverStage(new InMemoryOutletRepo(OUTLETS)),
      assemble: new AssembleStage(llm),
      confidence: new ConfidenceStage(),
    },
    storage,
    {
      language: "bn",
      traceEnabled: true,
      traceDir: path.join(tmpDir, "traces"),
      cacheEnabled: opts.cacheEnabled ?? false,
      cacheDir: opts.cacheDir ?? path.join(tmpDir, "cache"),
      validateStageIo: true,
    },
  );
  return { orchestrator, llm, asr };
}

const input = () => ({
  clipId: CLIP,
  companyId: COMPANY,
  repId: "REP-1",
  audio: new Uint8Array([1, 2, 3, 4, 5]),
  storageKey: `${CLIP}.webm`,
  mimeType: "audio/webm",
  geo: NEAR_GEO,
  declaredOutletId: null,
  recordedAt: new Date().toISOString(),
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "muse-it-"));
  storage = new MemoryStorage();
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("end to end, on ASR-corrupted input", () => {
  it("recovers the correct fields despite a wrong transcript", async () => {
    const { orchestrator } = build();
    const r = await orchestrator.run(input());

    // The transcript is wrong on the page...
    expect(r.transcript.text).toContain("প্রান"); // should be প্রাণ
    expect(r.transcript.text).toContain("দের"); // should be দেড়
    expect(r.transcript.text).toContain("হইল"); // should be হুইল

    // ...and the fields are still right.
    expect(r.annotations.quantities[0]!.value).toBe(18);
    expect(r.annotations.skus.some((s) => s.candidates[0]?.skuId === "SKU-404")).toBe(true);
    expect(r.annotations.skus.some((s) => s.candidates[0]?.skuId === "COMP-WHEEL")).toBe(true);
    expect(r.annotations.outlet.candidates[0]!.outletId).toBe("OUT-1182");
  });

  it("produces two observations from one recording", async () => {
    const { orchestrator } = build();
    const r = await orchestrator.run(input());
    expect(r.observations).toHaveLength(2);
    expect(r.observations[0]!.type).toBe("demand_signal");
    expect(r.observations[1]!.type).toBe("competitor_promo");
  });

  it("scores every observation and assigns a status", async () => {
    const { orchestrator } = build();
    const r = await orchestrator.run(input());
    for (const o of r.observations) {
      expect(["confirmed", "needs_clarification"]).toContain(o.status);
      expect(Object.keys(o.fieldConfidence).length).toBeGreaterThan(0);
    }
  });

  it("never rewrites the transcript across the whole run", async () => {
    const { orchestrator } = build();
    const r = await orchestrator.run(input());
    expect(r.transcript.text).toBe(MANGLED);
    // Every annotation span still slices back out of the original text.
    for (const q of r.annotations.quantities) {
      expect(r.transcript.text.slice(q.span[0], q.span[1])).toBe(q.raw);
    }
    for (const s of r.annotations.skus) {
      expect(r.transcript.text.slice(s.span[0], s.span[1])).toBe(s.raw);
    }
  });
});

describe("the enum lock, end to end", () => {
  it("rejects a model naming a product no resolver produced", async () => {
    const asr = new FakeAsrProvider({ [CLIP]: MANGLED });
    const llm = new FakeLlmProvider({
      handler: () => ({
        observations: [
          {
            type: "demand_signal",
            outletId: "OUT-1182",
            skuId: "SKU-DOES-NOT-EXIST",
            competitorBrand: null,
            quantity: 18,
            unit: "piece",
            priceDelta: null,
            severity: "medium",
            verbatimBn: "x",
            mentionIndex: "0",
          },
        ],
      }),
    });
    const orchestrator = new PipelineOrchestrator(
      {
        transcribe: new TranscribeStage(asr),
        numerals: new NumeralStage(),
        sku: new SkuResolverStage(new InMemoryCatalogRepo(SKUS, ALIASES)),
        outlet: new OutletResolverStage(new InMemoryOutletRepo(OUTLETS)),
        assemble: new AssembleStage(llm),
        confidence: new ConfidenceStage(),
      },
      storage,
      { validateStageIo: true, traceEnabled: false },
    );

    await expect(orchestrator.run(input())).rejects.toThrow(/schema/i);
  });
});

describe("storage", () => {
  it("fetches audio when the caller did not supply it", async () => {
    const { orchestrator } = build();
    await storage.put(`${CLIP}.webm`, new Uint8Array([9, 9, 9]), "audio/webm");
    const { audio: _omitted, ...withoutAudio } = input();
    const r = await orchestrator.run(withoutAudio);
    expect(r.observations.length).toBeGreaterThan(0);
  });
});

describe("tracing", () => {
  it("writes a per-clip trace covering every stage", async () => {
    const { orchestrator } = build();
    await orchestrator.run(input());

    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(tmpDir, "traces", day, `${CLIP}.json`);
    const trace = JSON.parse(await fs.readFile(file, "utf8"));

    const stages = trace.stages.map((s: { stage: string }) => s.stage);
    expect(stages).toContain("01-transcribe");
    expect(stages).toContain("02,03,04-annotate");
    expect(stages).toContain("05-assemble");
    expect(stages).toContain("06-confidence");
    expect(trace.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("redacts binary payloads", async () => {
    const { orchestrator } = build();
    await orchestrator.run(input());
    const day = new Date().toISOString().slice(0, 10);
    const raw = await fs.readFile(path.join(tmpDir, "traces", day, `${CLIP}.json`), "utf8");
    expect(raw).not.toContain('"0":1'); // no serialised byte arrays
  });

  it("writes a trace even when the run fails", async () => {
    const asr = new FakeAsrProvider({}); // no fixture -> throws
    const orchestrator = new PipelineOrchestrator(
      {
        transcribe: new TranscribeStage(asr),
        numerals: new NumeralStage(),
        sku: new SkuResolverStage(new InMemoryCatalogRepo(SKUS, ALIASES)),
        outlet: new OutletResolverStage(new InMemoryOutletRepo(OUTLETS)),
        assemble: new AssembleStage(new FakeLlmProvider({ handler: assemblyHandler })),
        confidence: new ConfidenceStage(),
      },
      storage,
      { traceEnabled: true, traceDir: path.join(tmpDir, "traces") },
    );

    await expect(orchestrator.run(input())).rejects.toThrow();
    const day = new Date().toISOString().slice(0, 10);
    const trace = JSON.parse(
      await fs.readFile(path.join(tmpDir, "traces", day, `${CLIP}.json`), "utf8"),
    );
    expect(trace.failed).toBe(true);
    expect(trace.stages.at(-1).error).toBeTruthy();
  });
});

describe("stage cache", () => {
  it("reuses a cached transcript on the second run", async () => {
    const cacheDir = path.join(tmpDir, "cache");

    const first = build({ cacheEnabled: true, cacheDir });
    const r1 = await first.orchestrator.run(input());
    expect(r1.cacheHits).not.toContain("01-transcribe");

    const second = build({ cacheEnabled: true, cacheDir });
    const r2 = await second.orchestrator.run(input());
    expect(r2.cacheHits).toContain("01-transcribe");
    expect(r2.transcript.text).toBe(r1.transcript.text);
  });

  it("misses when the audio changes", async () => {
    const cacheDir = path.join(tmpDir, "cache");
    await build({ cacheEnabled: true, cacheDir }).orchestrator.run(input());

    const changed = { ...input(), audio: new Uint8Array([7, 7, 7]) };
    const r = await build({ cacheEnabled: true, cacheDir }).orchestrator.run(changed);
    expect(r.cacheHits).not.toContain("01-transcribe");
  });

  it("does not cache when disabled", async () => {
    const cacheDir = path.join(tmpDir, "cache");
    await build({ cacheEnabled: false, cacheDir }).orchestrator.run(input());
    const r = await build({ cacheEnabled: false, cacheDir }).orchestrator.run(input());
    expect(r.cacheHits).toEqual([]);
  });
});

describe("timings", () => {
  it("reports a duration for each phase", async () => {
    const { orchestrator } = build();
    const r = await orchestrator.run(input());
    expect(r.timings["01-transcribe"]).toBeGreaterThanOrEqual(0);
    expect(r.timings["annotate(02,03,04)"]).toBeGreaterThanOrEqual(0);
    expect(r.timings["05-assemble"]).toBeGreaterThanOrEqual(0);
    expect(r.timings["06-confidence"]).toBeGreaterThanOrEqual(0);
  });
});

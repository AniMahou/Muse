import { describe, it, expect, beforeEach } from "vitest";
import { OutletResolverStage } from "./index";
import { InMemoryOutletRepo } from "@/adapters/catalog/in-memory.repo";
import { transcriptFromText } from "@/common/transcript";
import { OUTLETS, NEAR_GEO, COMPANY_ID } from "./fixtures/outlets";

let repo: InMemoryOutletRepo;
let stage: OutletResolverStage;

beforeEach(() => {
  repo = new InMemoryOutletRepo(OUTLETS);
  stage = new OutletResolverStage(repo);
});

async function resolve(
  text: string,
  opts: { geo?: { lat: number; lng: number } | null; declared?: string | null } = {},
) {
  const { outlet } = await stage.run({
    transcript: transcriptFromText(text),
    companyId: COMPANY_ID,
    geo: opts.geo === undefined ? NEAR_GEO : opts.geo,
    declaredOutletId: opts.declared ?? null,
  });
  return outlet;
}

describe("declared outlet", () => {
  it("wins outright over anything inferred", async () => {
    const r = await resolve("রহমান স্টোরে", { declared: "OUT-1182" });
    expect(r.declared).toBe(true);
    expect(r.candidates[0]!.outletId).toBe("OUT-1182");
    expect(r.margin).toBe(1);
  });

  it("still reports the distance from the recorded position", async () => {
    const r = await resolve("", { declared: "OUT-1182" });
    expect(r.candidates[0]!.distanceM).toBeGreaterThan(0);
  });

  it("falls back to inference when the declared id is stale", async () => {
    // A vanished outlet is stale data, not an authority.
    const r = await resolve("বিজয় স্টোরে", { declared: "OUT-DELETED" });
    expect(r.declared).toBe(false);
    expect(r.candidates[0]!.outletId).toBe("OUT-1182");
  });
});

describe("GPS filtering", () => {
  it("keeps only outlets inside the radius", async () => {
    const r = await resolve("");
    const ids = r.candidates.map((c) => c.outletId);
    expect(ids).not.toContain("OUT-9001"); // ~2.9 km away
  });

  it("excludes inactive outlets", async () => {
    const r = await resolve("");
    expect(r.candidates.map((c) => c.outletId)).not.toContain("OUT-9002");
  });

  it("reports how many outlets the radius admitted", async () => {
    const r = await resolve("");
    expect(r.gpsCandidateCount).toBe(3);
  });

  it("returns nothing without a position", async () => {
    const r = await resolve("বিজয় স্টোরে", { geo: null });
    expect(r.candidates).toHaveLength(0);
    expect(r.gpsCandidateCount).toBe(0);
  });

  it("returns nothing when the radius is empty", async () => {
    const r = await resolve("বিজয় স্টোরে", { geo: { lat: 20, lng: 88 } });
    expect(r.candidates).toHaveLength(0);
  });
});

describe("proximity only, no name spoken", () => {
  it("ranks by distance", async () => {
    const r = await resolve("আজকে অনেক ভিড়");
    const distances = r.candidates.map((c) => c.distanceM);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("leaves a thin margin between shops metres apart", async () => {
    // This is the whole problem: GPS alone cannot separate them, and the
    // output must say so rather than pick a winner confidently.
    const r = await resolve("আজকে অনেক ভিড়");
    expect(r.margin).toBeLessThan(0.15);
  });

  it("records no spoken name", async () => {
    const r = await resolve("আজকে অনেক ভিড়");
    expect(r.span).toBeNull();
    expect(r.raw).toBeNull();
  });
});

describe("name resolution", () => {
  it("picks the named shop out of the cluster", async () => {
    const r = await resolve("বিজয় স্টোরে দুই কার্টন লাগবে");
    expect(r.candidates[0]!.outletId).toBe("OUT-1182");
  });

  it("picks a different shop when a different name is spoken", async () => {
    const r = await resolve("রহমান স্টোরে দুই কার্টন লাগবে");
    expect(r.candidates[0]!.outletId).toBe("OUT-1183");
  });

  it("a spoken name widens the margin decisively", async () => {
    const anonymous = await resolve("দুই কার্টন লাগবে");
    const named = await resolve("বিজয় স্টোরে দুই কার্টন লাগবে");
    expect(named.margin).toBeGreaterThan(anonymous.margin);
    expect(named.margin).toBeGreaterThan(0.25);
  });

  it("records the span of the spoken name", async () => {
    const text = "বিজয় স্টোরে দুই কার্টন লাগবে";
    const r = await resolve(text);
    expect(r.raw).not.toBeNull();
    expect(text.slice(r.span![0], r.span![1])).toBe(r.raw);
    expect(r.raw).toContain("বিজয়");
  });

  it("survives the ASR dropping a vowel (স্টরে for স্টোরে)", async () => {
    const r = await resolve("বিজয় স্টরে দুই কার্টন");
    expect(r.candidates[0]!.outletId).toBe("OUT-1182");
  });

  it("matches an English-scripted outlet name spoken in Bangla", async () => {
    const r = await resolve("নিউ আলম এন্টারপ্রাইজ");
    expect(r.candidates[0]!.outletId).toBe("OUT-1184");
  });

  it("does not let a generic tail alone decide", async () => {
    // "স্টোর" is shared by two outlets; on its own it must not produce a
    // confident winner.
    const r = await resolve("স্টোরে গিয়েছিলাম");
    expect(r.margin).toBeLessThan(0.2);
  });

  it("scores nameScore for every candidate, not only the winner", async () => {
    const r = await resolve("বিজয় স্টোরে");
    expect(r.candidates.every((c) => typeof c.nameScore === "number")).toBe(true);
    const bijoy = r.candidates.find((c) => c.outletId === "OUT-1182")!;
    const rahman = r.candidates.find((c) => c.outletId === "OUT-1183")!;
    expect(bijoy.nameScore).toBeGreaterThan(rahman.nameScore);
  });
});

describe("output shape", () => {
  it("orders candidates by score", async () => {
    const r = await resolve("বিজয় স্টোরে");
    const scores = r.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("caps the candidate list", async () => {
    const narrow = new OutletResolverStage(repo, { maxCandidates: 2 });
    const { outlet } = await narrow.run({
      transcript: transcriptFromText("বিজয় স্টোরে"),
      companyId: COMPANY_ID,
      geo: NEAR_GEO,
      declaredOutletId: null,
    });
    expect(outlet.candidates.length).toBeLessThanOrEqual(2);
  });

  it("keeps all scores within 0..1", async () => {
    const r = await resolve("বিজয় স্টোরে");
    for (const c of r.candidates) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });

  it("honours a custom radius", async () => {
    const wide = new OutletResolverStage(repo, { radiusM: 5000 });
    const { outlet } = await wide.run({
      transcript: transcriptFromText(""),
      companyId: COMPANY_ID,
      geo: NEAR_GEO,
      declaredOutletId: null,
    });
    expect(outlet.gpsCandidateCount).toBe(4); // now includes Faraway Traders
  });
});

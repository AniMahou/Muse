/**
 * Put the demo tenant into a known, presentable state. One command.
 *
 *   npm run demo:reset
 *
 * Run it before a demo — and again five minutes before going on stage, because
 * rehearsing leaves recordings, alerts and answered prompts behind, and the
 * second run of a demo should look exactly like the first.
 *
 * It exists because the database drifts. Sign-up creates a new company every
 * time somebody tries the product, so a laptop that has been demoed on a few
 * times ends up with several tenants, the catalogue seeded into one of them
 * and the login belonging to another. The failure mode is logging in on stage
 * to an empty console.
 *
 * Everything written here is deterministic and dated relative to now, so the
 * dashboard always shows a plausible recent week rather than whenever the
 * fixtures happened to be written.
 */
import { randomUUID } from "node:crypto";
import { connectMongo, collections, ensureIndexes, closeMongo, toOutletDoc } from "@/db/client";
import { hashPassword } from "@/auth/password";
import type { User } from "@shared/auth.schema";
import type { Observation, Clip } from "@shared/observation.schema";
import type { Alert } from "@shared/alert.schema";
import type { Rep } from "@shared/catalog";
import {
  COMPANY_ID, TERRITORY_ID, company, territory, skus, aliases, outlets, repBase,
} from "./seed-data";

const OWNER = { email: "demo@muse.test", password: "demo12345", name: "Tabib Hassan" };
const REP = { email: "rahim@muse.test", password: "demo12345", name: "Rahim Uddin" };

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

/**
 * A week of field activity.
 *
 * Shaped rather than random. Three different outlets report the Wheel promo
 * inside a day, which is what the alert rule is looking for; the stock-out
 * sits at two outlets so it is visibly *below* threshold, which is how you
 * show that the rule is a rule and not a notification. The rest is texture —
 * an empty dashboard makes a working product look broken.
 */
interface Seed {
  mins: number;
  repId: string;
  type: Observation["type"];
  outletId: string;
  skuId?: string | null;
  competitorBrand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  priceDelta?: number | null;
  severity: Observation["severity"];
  bn: string;
  flagged?: string[];
}

const HISTORY: Seed[] = [
  // The alert: three distinct outlets, same competitor, inside the window.
  { mins: 190, repId: "REP-1", type: "competitor_promo", outletId: "OUT-1182", competitorBrand: "COMP-WHEEL", priceDelta: -5, severity: "high",
    bn: "বিজয় স্টোরে হুইল এর নতুন অফার দিছে, পাঁচ টাকা কম" },
  { mins: 140, repId: "REP-1", type: "competitor_promo", outletId: "OUT-1183", competitorBrand: "COMP-WHEEL", priceDelta: -5, severity: "high",
    bn: "রহমান স্টোরেও হুইল পাঁচ টাকা কমে দিতেছে" },
  { mins: 55,  repId: "REP-2", type: "competitor_promo", outletId: "OUT-1184", competitorBrand: "COMP-WHEEL", priceDelta: -6, severity: "high",
    bn: "নিউ আলম এ হুইল ছয় টাকা কম, অনেক মাল তুলছে" },

  // Deliberately two outlets only — below threshold, so nothing is raised.
  { mins: 320, repId: "REP-1", type: "stock_out", outletId: "OUT-1185", skuId: "SKU-502", severity: "high",
    bn: "শান্ত জেনারেল স্টোরে লাক্স সাবান শেষ" },
  { mins: 95,  repId: "REP-2", type: "stock_out", outletId: "OUT-1182", skuId: "SKU-502", severity: "high",
    bn: "বিজয় স্টোরে লাক্স সাবান নাই" },

  { mins: 30,   repId: "REP-1", type: "demand_signal", outletId: "OUT-1182", skuId: "SKU-404", quantity: 18, unit: "piece", severity: "medium",
    bn: "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে" },
  { mins: 75,   repId: "REP-1", type: "demand_signal", outletId: "OUT-1184", skuId: "SKU-504", quantity: 30, unit: "piece", severity: "medium",
    bn: "নিউ আলম এন্টারপ্রাইজে সানসিল্ক শ্যাম্পু আড়াই ডজন লাগবে" },
  { mins: 260,  repId: "REP-2", type: "demand_signal", outletId: "OUT-1185", skuId: "SKU-501", quantity: 2.75, unit: "carton", severity: "medium",
    bn: "শান্ত জেনারেল স্টোরে সার্ফ এক্সেল পৌনে তিন কার্টন লাগবে" },
  { mins: 400,  repId: "REP-1", type: "demand_signal", outletId: "OUT-1183", skuId: "SKU-505", quantity: 8, unit: "piece", severity: "low",
    bn: "রহমান স্টোরে ক্লিয়ার শ্যাম্পু দুই হালি লাগবে", flagged: ["quantity"] },
  { mins: 1500, repId: "REP-2", type: "price_change", outletId: "OUT-1185", skuId: "SKU-501", priceDelta: 10, severity: "medium",
    bn: "শান্ত জেনারেল স্টোরে সার্ফ এক্সেল এর দাম দশ টাকা বেড়ে গেছে" },
  { mins: 1600, repId: "REP-1", type: "retailer_complaint", outletId: "OUT-1182", skuId: "SKU-420", severity: "medium",
    bn: "বিজয় স্টোরের দোকানদার বলতেছে প্রাণ চানাচুরের প্যাকেট ভাঙা আসতেছে" },
  { mins: 2900, repId: "REP-1", type: "posm_issue", outletId: "OUT-1183", severity: "low",
    bn: "রহমান স্টোরে লাক্স এর পোস্টার ছিঁড়ে গেছে" },
  { mins: 3100, repId: "REP-2", type: "competitor_promo", outletId: "OUT-1185", competitorBrand: "COMP-RIN", priceDelta: -8, severity: "medium",
    bn: "শান্ত জেনারেল স্টোরে রিন আট টাকা কমে দিতেছে" },
  { mins: 4300, repId: "REP-1", type: "demand_signal", outletId: "OUT-1184", skuId: "SKU-502", quantity: 20, unit: "piece", severity: "medium",
    bn: "নিউ আলম এন্টারপ্রাইজে লাক্স সাবান কুড়ি পিস লাগবে" },
  { mins: 5800, repId: "REP-2", type: "stock_out", outletId: "OUT-1183", skuId: "SKU-410", severity: "medium",
    bn: "রহমান স্টোরে প্রাণ লিচি জুস শেষ" },
];

async function main(): Promise<void> {
  const db = await connectMongo();
  await ensureIndexes(db);
  const col = collections(db);
  const now = new Date().toISOString();

  // ---- catalogue --------------------------------------------------------
  await col.companies.updateOne({ companyId: COMPANY_ID }, { $set: company }, { upsert: true });
  await col.territories.updateOne({ territoryId: TERRITORY_ID }, { $set: territory }, { upsert: true });

  // Replaced rather than upserted: a CSV import during an earlier demo leaves
  // extra SKUs behind, and an unexpected near-neighbour changes what the
  // resolver does on stage.
  await col.skus.deleteMany({ companyId: COMPANY_ID });
  await col.skus.insertMany(skus.map((s) => ({ ...s })));
  await col.aliases.deleteMany({ companyId: COMPANY_ID });
  await col.aliases.insertMany(aliases.map((a) => ({ ...a })));
  await col.outlets.deleteMany({ companyId: COMPANY_ID });
  await col.outlets.insertMany(outlets.map(toOutletDoc));

  const reps: Rep[] = [
    repBase,
    { ...repBase, repId: "REP-2", name: "Karim Sheikh" },
  ];
  await col.reps.deleteMany({ companyId: COMPANY_ID });
  await col.reps.insertMany(reps.map((r) => ({ ...r, inviteToken: `demo-${r.repId}` })));

  // ---- accounts ---------------------------------------------------------
  // Email is globally unique, so an account left in an older tenant would
  // block the login and send the demo to the wrong company's console.
  await col.users.deleteMany({ email: { $in: [OWNER.email, REP.email] } });
  await col.users.deleteMany({ companyId: COMPANY_ID });

  const mkUser = async (
    e: typeof OWNER, role: User["role"], repId: string | null,
  ): Promise<User> => ({
    userId: `usr_${randomUUID()}`,
    companyId: COMPANY_ID,
    email: e.email,
    name: e.name,
    role,
    passwordHash: await hashPassword(e.password),
    repId,
    active: true,
    createdAt: now,
    lastLoginAt: null,
  });

  await col.users.insertMany([
    // The owner carries a rep record too, so one login can demonstrate both
    // applications without signing out.
    await mkUser(OWNER, "owner", "REP-1"),
    await mkUser(REP, "rep", "REP-1"),
  ]);

  // ---- field activity ---------------------------------------------------
  await col.observations.deleteMany({ companyId: COMPANY_ID });
  await col.clips.deleteMany({ companyId: COMPANY_ID });
  await col.alerts.deleteMany({ companyId: COMPANY_ID });
  await col.clarifications.deleteMany({ companyId: COMPANY_ID });
  await col.aliasCandidates.deleteMany({ companyId: COMPANY_ID });

  const clips: Clip[] = [];
  const observations: Observation[] = [];

  HISTORY.forEach((h, i) => {
    const at = ago(h.mins);
    const clipId = `clip_demo_${String(i + 1).padStart(2, "0")}`;
    clips.push({
      clipId, source: "voice",
      pipeline: {
        extractor: "groq", extractorModel: "whisper-large-v3",
        llmProvider: "groq", llmModel: "openai/gpt-oss-120b",
        timings: { transcribe: 780, annotate: 38, assemble: 1610 },
        extractionConfidence: 0.79, simulated: false,
      },
      companyId: COMPANY_ID, repId: h.repId, clientUuid: `demo-${i + 1}`,
      storageKey: `${COMPANY_ID}/demo-${i + 1}.webm`, mimeType: "audio/webm",
      durationSec: 9 + (i % 5), geo: { lat: 23.7806, lng: 90.4074 },
      declaredOutletId: null, status: "processed", error: null,
      transcriptText: h.bn, observationCount: 1,
      recordedAt: at, createdAt: at, updatedAt: at,
    });

    const flagged = h.flagged ?? [];
    observations.push({
      observationId: `obs_demo_${String(i + 1).padStart(2, "0")}`,
      clipId, companyId: COMPANY_ID, repId: h.repId,
      type: h.type, outletId: h.outletId,
      skuId: h.skuId ?? null, competitorBrand: h.competitorBrand ?? null,
      quantity: h.quantity ?? null, unit: h.unit ?? null, priceDelta: h.priceDelta ?? null,
      severity: h.severity, verbatimBn: h.bn,
      status: flagged.length ? "needs_clarification" : "confirmed",
      fieldConfidence: {
        type: 0.95, outletId: 0.91, skuId: 0.88,
        competitorBrand: 0.86, quantity: flagged.includes("quantity") ? 0.54 : 0.93,
        priceDelta: 0.9,
      },
      flaggedFields: flagged,
      recordedAt: at, createdAt: at, updatedAt: at,
    });
  });

  await col.clips.insertMany(clips);
  await col.observations.insertMany(observations);

  // ---- the open alert ---------------------------------------------------
  // Written directly rather than by replaying clips through the pipeline: this
  // must be identical every run, and it must not depend on a provider being
  // reachable from the venue's wifi.
  const promo = observations.filter((o) => o.competitorBrand === "COMP-WHEEL");
  const alert: Alert = {
    alertId: `alt_demo_${randomUUID().slice(0, 8)}`,
    companyId: COMPANY_ID,
    kind: "competitor_promo",
    key: "COMP-WHEEL",
    outletIds: [...new Set(promo.map((o) => o.outletId!))].sort(),
    observationIds: promo.map((o) => o.observationId),
    severity: "high",
    firstSeenAt: promo.reduce((m, o) => (o.recordedAt < m ? o.recordedAt : m), promo[0]!.recordedAt),
    raisedAt: ago(50),
    status: "open",
    acknowledgedAt: null, acknowledgedBy: null, note: null,
    createdAt: ago(50), updatedAt: ago(50),
  };
  await col.alerts.insertOne(alert);

  // One already answered, so the console can show a response time rather than
  // an empty statistic.
  // Built field by field rather than spread from the one above: the driver
  // stamps an _id onto the object it inserts, and reusing it would carry that
  // _id into the second write.
  const answered: Alert = {
    alertId: `alt_demo_${randomUUID().slice(0, 8)}`,
    companyId: COMPANY_ID,
    kind: "competitor_promo", key: "COMP-RIN",
    outletIds: ["OUT-1185"], observationIds: [],
    severity: "medium",
    firstSeenAt: ago(3200), raisedAt: ago(3100),
    status: "acknowledged",
    acknowledgedAt: ago(3010), acknowledgedBy: "Tabib Hassan",
    note: null, createdAt: ago(3100), updatedAt: ago(3010),
  };
  await col.alerts.insertOne(answered);

  // ---- pending prompts for the rep app ----------------------------------
  const flaggedObs = observations.find((o) => o.flaggedFields.length > 0)!;
  await col.clarifications.insertOne({
    clarificationId: `clr_demo_${randomUUID().slice(0, 8)}`,
    companyId: COMPANY_ID, repId: flaggedObs.repId, observationId: flaggedObs.observationId,
    clipId: flaggedObs.clipId, kind: "quantity",
    question: "ক্লিয়ার শ্যাম্পু কয়টা লাগবে?",
    options: [
      { value: "8", label: "৮ পিস (দুই হালি)" },
      { value: "4", label: "৪ পিস (এক হালি)" },
      { value: "12", label: "১২ পিস" },
    ],
    confidence: 0.54, status: "pending",
    answer: null, answeredAt: null,
    createdAt: ago(400), expiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  } as never);

  // ---- something to approve on the Teach screen -------------------------
  await col.aliasCandidates.insertOne({
    candidateId: `alc_demo_${randomUUID().slice(0, 8)}`,
    companyId: COMPANY_ID, surface: "হইল",
    suggestedSkuId: "COMP-WHEEL", suggestedName: "Wheel",
    score: 0.79, margin: 0.03, occurrences: 4,
    status: "pending", firstSeenAt: ago(2000), lastSeenAt: ago(140),
    clipIds: [clips[0]!.clipId],
  } as never);

  console.log(`\n  ${c.green("✓")} demo tenant ready — ${c.bold(COMPANY_ID)}\n`);
  console.log(`    ${c.bold("Console")}  ${c.cyan(OWNER.email)}  /  ${OWNER.password}`);
  console.log(`    ${c.bold("Field app")} ${c.cyan(REP.email)}  /  ${REP.password}`);
  console.log(c.dim(`\n    ${skus.length} SKUs · ${outlets.length} outlets · ${reps.length} reps`));
  console.log(c.dim(`    ${observations.length} observations over the last few days`));
  console.log(c.dim(`    1 OPEN alert (Wheel, 3 outlets) · 1 already answered`));
  console.log(c.dim(`    1 pending clarification · 1 alias awaiting approval`));
  console.log(c.dim(`\n    Stock-out sits at 2 outlets on purpose — below the 3-outlet`));
  console.log(c.dim(`    threshold, so you can show the rule declining to fire.\n`));

  await closeMongo();
}

main().catch(async (err) => {
  console.error(err);
  await closeMongo().catch(() => undefined);
  process.exit(1);
});

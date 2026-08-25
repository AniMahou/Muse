# Muse — engineering context

Handoff document. Enough to resume work in a fresh session without re-deriving
anything.

**Repo:** `github.com/AniMahou/Muse` · **Local:** `~/Documents/WEB DEVELOPMENT/hackathons/Muse`
**State:** 412 tests passing · 28 commits · ~13,650 LOC · backend + frontend complete
**Unrelated to** the NestJS/Prisma omnichannel messaging project. No shared code.

---

## 1. What this is

A Bangla voice- and photo-capture pipeline for FMCG field sales representatives.
A rep speaks fifteen seconds into a phone or photographs a handwritten order
note; the system produces validated, confidence-scored observations — outlet,
product, quantity, price movement, stock-out — for a brand manager's console.

**The thesis, and the reason every design decision looks the way it does:**

> Bangla speech recognition runs at ~34% word error rate on real field audio.
> The transcript does not need to be right. The **fields** need to be right.

Accuracy is recovered by a deterministic layer — a Bangla quantity grammar and
closed-catalogue phonetic matching — not by a better acoustic model. A language
model only does segmentation and semantics, constrained per-clip to candidates
the resolvers actually produced.

---

## 2. Stack

**Backend** Express · TypeScript · MongoDB (native driver) · Zod · Redis · BullMQ
**Frontend** React 19 · Vite · Tailwind · TanStack Query · Zustand · Socket.IO
**Models** Groq `whisper-large-v3` (ASR) · Groq `openai/gpt-oss-120b` (assembly)

Deliberately **not** used, and why:

| Rejected | Reason |
|---|---|
| NestJS / Prisma / RabbitMQ | Belong to a different project. Zero carryover. |
| Mongoose | Zod already owns the document shape; two sources of truth. |
| Monorepo tooling | Two package.jsons + a `shared/` folder + tsconfig paths. |
| A DI container | One `container.ts` composition root reads top to bottom. |
| A charting library | Four SVG chart types is less code than the config would be. |
| Embeddings for SKU matching | Phonetic + edit distance suffices at this catalogue size. |

---

## 3. Layout

```
Muse/
├── shared/                    Zod contracts, imported by BOTH sides via @shared/*
│   ├── observation.schema.ts  Observation, Clip, ClipSource, PipelineMeta
│   ├── stage-io.ts            inter-stage contracts + the two invariants
│   ├── catalog.ts             Sku, Outlet, Rep, Company, Alias
│   ├── clarification.schema.ts  Clarification, AliasCandidate
│   ├── auth.schema.ts         User, Role, JWT payload, homeFor()
│   └── label.schema.ts        ground truth for the eval harness
│
├── backend/
│   ├── src/
│   │   ├── pipeline/          NEVER imports adapters/ or db/ (eslint-enforced)
│   │   │   ├── ports/         IAsrProvider · ILlmProvider · IOcrProvider
│   │   │   │                  IStorage · ICatalogRepo · IOutletRepo
│   │   │   ├── stages/
│   │   │   │   ├── 01-transcribe/      thin; provider specifics live in adapters
│   │   │   │   ├── 02-normalize-numerals/  ⭐ Bangla quantity grammar + lexicon
│   │   │   │   ├── 03-resolve-sku/     ⭐ phonetic + brand + manufacturer routes
│   │   │   │   ├── 04-resolve-outlet/  GPS radius + spoken name ramp
│   │   │   │   ├── 05-assemble/        ⭐ per-clip enum lock (schema.ts, prompt.ts)
│   │   │   │   └── 06-confidence/      ⭐ derived, never self-reported
│   │   │   ├── orchestrator.ts  composes stages; 2/3/4 run CONCURRENTLY
│   │   │   ├── cache.ts         content-addressed on stage+version+input+model
│   │   │   └── trace.ts         per-clip stage I/O dumps
│   │   ├── adapters/          asr/ (groq, gemini, local-whisper, fake)
│   │   │                      llm/ (groq, gemini, fake) · ocr/ (mock)
│   │   │                      storage/ · catalog/ (mongo, in-memory)
│   │   ├── auth/              JWT, scrypt passwords, role middleware
│   │   ├── ingest/            POST /observations, Redis idempotency
│   │   ├── queue/             BullMQ queues + process-clip processor
│   │   ├── clarification/     builder (pure) + service + routes
│   │   ├── catalog/           CSV import, alias approval service
│   │   ├── admin/             console routes + admin auth
│   │   ├── analytics/         Mongo aggregations
│   │   ├── observations/      repository
│   │   ├── realtime/          Socket.IO, per-company rooms
│   │   ├── db/                client, collections, 20+ indexes
│   │   ├── common/            config, logger, errors, text, transcript,
│   │   │                      bangla-phonetic ⭐, geo, hash
│   │   ├── container.ts       the ONE place adapters are chosen
│   │   ├── server.ts          API entrypoint
│   │   └── worker.ts          BullMQ worker entrypoint (separate process)
│   ├── eval/                  metrics.ts + run.ts + report.ts (NOT tests)
│   ├── datasets/              clips/ labels/ catalog/  ← labels/ IS EMPTY
│   ├── tests/                 contract/ (live APIs) integration/ (fakes)
│   └── scripts/               seed-catalog.ts · try-clip.ts · record.sh
│
├── frontend/
│   ├── public/samples/        3 generated handwritten-note SVGs
│   └── src/
│       ├── pages/             Landing · Login · Register · AuthShell
│       ├── app/               FIELD REP (mobile-first, Bangla only)
│       │   ├── Record.tsx     ⭐ hold-or-tap, live waveform ring
│       │   ├── Photo.tsx      ⭐ photo capture, SIMULATED OCR
│       │   ├── Clarify.tsx    one-tap prompts
│       │   ├── MyDay.tsx
│       │   └── lib/           recorder.ts (MediaRecorder+Analyser) · queue.ts (IndexedDB)
│       ├── console/           ADMIN (desktop)
│       │   ├── Today · Intelligence · Review · Aliases · Catalog · Team
│       │   └── lib/           socket.ts · directory.ts (id→name)
│       └── shared/            ui/ (Charts, Confidence, ThemeToggle, Logo)
│                              lib/ (api, auth-store, theme)
└── docs/                      PRESENTATION_PLAN · SPEECH · QNA · CONTEXT
                               STITCH_PROMPTS · STITCH_FIXES · FRONTEND_PLAN
                               CODING_UPDATES · MANUAL_SETUP · report/
```

---

## 4. The pipeline

```
voice ──┐
        ├─→ ① EXTRACT ─→ ②③④ ANNOTATE ─→ ⑤ ASSEMBLE ─→ ⑥ CONFIDENCE ─→ observation
photo ──┘     [API]        (parallel)        [API]      (deterministic)
                              │
              ┌───────────────┼───────────────┐
        quantity grammar  SKU resolver  outlet resolver
```

### Two invariants — do not violate

1. **Stages annotate; they never rewrite the transcript.** Every annotation
   carries character spans into the original text. A stage that rewrote
   `দের ডজন` → `18` and got it wrong would destroy the evidence stage 6 needs.
2. **Stages 2, 3, 4 are independent.** All read the same transcript, emit
   disjoint annotations, run concurrently.

### Stage notes

| Stage | Key point |
|---|---|
| 01 extract | Voice → ASR, photo → OCR. **The only divergence point.** Adding photo touched 4 files. |
| 02 numerals | দেড়=1.5 আড়াই=2.5 সাড়ে=+0.5 সোয়া=+0.25 **পৌনে=−0.25** ডজন=×12 হালি=×4. Groups flush additively at thousands. |
| 03 sku | Three scoring routes: name, brand (cap 0.85), manufacturer (cap 0.70). Caps make ambiguity legible — bare "প্রাণ" collapses the margin to 0. |
| 04 outlet | GPS radius + spoken name on a **ramp**, not a gate. |
| 05 assemble | Response schema rebuilt per clip; identity fields are enums of resolver candidates. Numbers get a second guard. |
| 06 confidence | `asr_conf(span) × margin × grammar_hit`. Never self-reported. **Saves always**, sets status. |

---

## 5. Hard-won findings — do not re-derive

**Unicode composition exclusion.** `ড়` `ঢ়` `য়` are each TWO code points (base +
nukta U+09BC) and NFC will **never** compose them. A per-character walk read
`ড়` as /d/ when it is /r/, corrupting আড়াই. Nukta forms are folded before
anything walks the string. `common/bangla-phonetic.ts`.

**Strict vs lenient similarity are different tools.** সতেরো (17) and স্টোরে
("at the store") share the consonant skeleton `s-t-r` exactly. Skeleton
matching reads a shop as a number. Numerals use `phoneticKeySimilarity`
(vowels kept); product/outlet names use `phoneticSimilarity` (skeleton
fallback).

**Latin must fold into the same space.** Catalogues are English, reps speak
Bangla. Initial `wh` → `hu` or Wheel never matches হুইল. Post-vowel `w` is a
glide: "New" is নিউ, not `neb`.

**Outlet name matching is a ramp, not a gate.** A hard 0.85 threshold discarded
a legitimate 0.72 match on corrupted ASR and ranked the *nearer* shop first —
attributing observations to the wrong store while holding good evidence.

**Groq strict JSON-schema mode rejects three things:** `$ref`/`definitions`,
missing `additionalProperties:false` on **nested** objects, and
`anyOf:[enum,{type:"null"}]` — where the API accepts the schema, the model
emits valid output, and the API's own validator rejects its own generation.
Handled in `adapters/llm/json-schema.ts`.

**Port collision.** Mongo runs on **27018**, Redis on **6380**. 27017 was taken
by another project and pointing there silently writes into a stranger's DB.

**Frontend bugs already fixed** (don't reintroduce): `active:scale-95` +
`onPointerLeave` made the record button silently discard every clip; the console
root grew with content while `main` also declared `overflow-y:auto`, so nothing
scrolled.

---

## 6. Running it

```bash
npm run dev:infra      # Mongo 27018 + Redis 6380
npm run dev            # api + worker + web together
cd backend && npm run seed:catalog
```

http://localhost:5173 · owner `demo@muse.test` / `demo12345` · rep `rahim@muse.test` / `demo12345`

```bash
cd backend
npm test               # 412 tests, no network, no API key
npm run record         # record from mic and run the pipeline
npm run try -- f.m4a   # run any audio file, prints every stage
npm run eval           # metrics (needs labelled clips — none exist yet)
```

`.env` needs `GROQ_API_KEY` (free, no card, console.groq.com). Set
`ASR_PROVIDER=fake` and `LLM_PROVIDER=fake` for a fully offline demo.

**Testing tiers:** 0/1 unit+fixture (`stages/*/test.ts`), 2 contract (live APIs,
manual), 3 integration (fakes, CI), 4 **eval — metrics, not tests**. Keep 4
separate or you get a flaky CI that gets disabled.

---

## 7. Auth model

Sign-up creates a **company + owner**. Reps are **invited**, never
self-registered — no FMCG company lets anyone claiming to be a rep pull down
their SKU master and outlet coverage. Both roles use the same login form; the
JWT role decides the app. **Owners also get a Rep record** so they can record —
`requireRep` gates on *having a field record*, not on the role label.

---

## 8. What's real vs simulated

| Real | Simulated |
|---|---|
| Voice → ASR → pipeline (live Groq) | **Handwriting OCR** — canned text, labelled in the UI |
| All 6 stages, both modalities | |
| Confidence, clarification, alias learning | |
| Analytics, CSV import, auth | |

**No accuracy figure exists.** The eval harness is built and gated but
`datasets/labels/` is empty.

---

## 9. Next work, in order

1. **Collect ~100 labelled field clips** — everything measurable is blocked on
   this. Fieldwork, not code.
2. **Learned confidence model** — logistic regression / GBM over features
   already computed, labelled by "was this field correct". ~1 day, reuses the
   eval labels. Turns hand-tuned thresholds into a real ML artefact with a
   calibration curve.
3. **Real OCR** — replace `adapters/ocr/mock.adapter.ts`. Printed signage and
   price tags are feasible; handwritten Bangla is near research-grade.
4. **Domain-adapted ASR** — n-gram shallow fusion over the customer catalogue.
5. **Bounded resolution agent** — on low confidence, a tool-calling loop with
   4 tools (re-transcribe segment, relaxed catalogue query, outlet order
   history, rep's prior mentions) before escalating to a human.

**Known gap:** a surface form matching *nothing* produces no annotation, so it
can never become an alias candidate — precisely where an alias would help most.
Fixing it needs stage 3 to emit sub-threshold near-misses.

---

## 10. Business, in one paragraph

Bangladesh FMCG is ~$4B with **97% traditional trade** — small shops visited by
a person. SFA apps capture the order, never the reason. Buyer is a brand/category
manager at ACI, PRAN, Unilever, BAT. Modelled ROI: 8.3% out-of-stock rate × 58%
becoming lost sales = 4.8% of revenue; a 20% duration reduction on a ৳3B brand
recovers ~৳28.8M/yr against ~৳2.16M cost ≈ 13×. **The 20% is our assumption —
say so.** Moat: the Bangla resolution work, customer-specific alias learning
that compounds, and constrained decoding making it safe to connect to master
data. Expansion is the same architecture with a different catalogue — pharma
reps, microfinance officers, NGO surveys.

---

## 11. Conventions

- Zod owns every contract; `z.infer` for types, never hand-written duplicates.
- `pipeline/` imports only from `ports/` — eslint `no-restricted-imports`.
- Stages are plain classes with constructor-injected ports; tests do
  `new NumeralStage()` with no framework.
- Amber (`#F59E0B`), never red, for uncertainty. A flagged field is honesty.
- Confidence and margin are **opposite scales** — margin 0.3 is already decisive.
- Bangla set 15–20% larger than Latin; conjuncts vanish at Latin sizes.
- Load Hind Siliguri everywhere Bangla renders, or it falls back to Devanagari.

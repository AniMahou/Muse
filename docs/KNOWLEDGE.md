# Engineering knowledge

What to know to defend this system in a technical room. Every claim here is
checkable against the code, and the file is named where it matters.

Read §9 before you go on — that is the list of things you should refuse to
claim.

---

## 1 · The thesis, stated precisely

Bengali speech recognition benchmarks report 3–5% word error rate. Those
numbers come from clean, read, studio speech with general vocabulary. Field
audio is a rep in a market with traffic, a ceiling fan and a shopkeeper talking
over him — and the words that carry the meaning are **proper nouns**: brand
names, shop names, pack sizes. No general acoustic model has seen them.

So the design inverts the usual assumption:

> **The transcript does not need to be right. The fields need to be right.**

Accuracy is recovered by a deterministic layer — a Bangla quantity grammar and
closed-catalogue phonetic matching — not by hoping for a better acoustic model.
The language model never identifies anything; it selects from candidates the
deterministic stages have already produced.

If someone says *"so it's a wrapper around Whisper"*: the honest answer is that
Whisper is one of two API calls, and every part that decides what ends up in the
database is ours.

---

## 2 · How Whisper actually produces text

You will be asked this. Know the mechanism, not the marketing.

**Whisper is an encoder–decoder Transformer**, trained on ~680k hours of
weakly-supervised multilingual audio. The path from sound to text:

1. **Resample to 16 kHz mono.** This is why `npm run collect` and `npm run mic`
   normalise to exactly that — the model does it internally anyway, and doing it
   once up front means the same bytes are sent on every run, so a cached stage
   result stays valid.
2. **Log-Mel spectrogram.** 80 mel channels, 25 ms window, 10 ms hop. Audio
   becomes a 2-D image of frequency against time.
3. **Fixed 30-second window.** Anything shorter is zero-padded. Our clips are
   5–15 s, so most of the window is padding — which is fine, but it is why a
   3-second clip costs the same as a 25-second one.
4. **Encoder** — convolutional front end, then Transformer blocks with sinusoidal
   position encoding, producing a sequence of audio embeddings.
5. **Decoder** — an autoregressive Transformer that cross-attends to those
   embeddings and emits **BPE tokens** one at a time, conditioned on special
   tokens (`<|bn|>` for language, `<|transcribe|>` vs `<|translate|>`, and
   timestamp tokens).

**Two consequences that matter to us:**

**It is a language model as much as an acoustic one.** The decoder predicts the
next token given the audio *and everything it has already written*. So it emits
fluent, plausible Bangla — which is why our errors look like real words
(`সান্তো জিনেরল` for `শান্ত জেনারেল`) rather than gibberish. That is exactly the
failure mode a downstream LLM would confidently launder into a wrong answer, and
the reason our schema is locked to resolver output.

**Forcing the language beats auto-detection.** We pass `language=bn` explicitly
(`adapters/asr/groq.adapter.ts`). Auto-detect on short, noisy, code-mixed Bangla
frequently guesses Hindi or Urdu — related scripts, wrong phonology.

### Where per-word confidence comes from — and why it is honest

Whisper does **not** emit per-word confidence. It returns, per *segment*,
`avg_logprob`, `no_speech_prob` and `compression_ratio`. We derive from those,
in `adapters/asr/confidence.ts`:

```
segment_conf = clamp(exp(avg_logprob))        // mean token probability
             × (1 − no_speech_prob)           // silence should not lend confidence
             × (compression_ratio > 2.4 ? 0.5 : 1)   // decoder repetition loop
```

`exp(avg_logprob)` is the standard reading of mean token probability: ≈0.90 at
−0.1, 0.61 at −0.5, 0.37 at −1.0. Every word inside a segment inherits its
segment's value.

**Say the limitation out loud:** that is segment-level, not word-level, so it is
coarse. It is a real signal about a stretch of audio rather than an invented
per-word number, and any transcript carrying derived confidence is flagged
`confidenceDerived: true` so nothing downstream mistakes it for the real thing.

The `compression_ratio` guard is worth mentioning unprompted — a runaway ratio
means the decoder fell into a repetition loop and produced fluent text
corresponding to no audio at all. Catching that is the difference between
knowing your failure modes and hoping.

---

## 3 · The pipeline, stage by stage

```
voice ──┐
        ├─→ ① EXTRACT ─→ ②③④ ANNOTATE ─→ ⑤ ASSEMBLE ─→ ⑥ CONFIDENCE ─→ observation
photo ──┘     [API]        (parallel)       [API]       (deterministic)
                              │
              ┌───────────────┼───────────────┐
        quantity grammar  SKU resolver  outlet resolver
```

### Two invariants — know these by name

**1 · Stages annotate; they never rewrite the transcript.** Every annotation
carries **character spans** back into the original text. A stage that rewrote
`দের ডজন` → `18` and got it wrong would destroy the evidence stage 6 needs to
judge it. This is what makes per-field confidence possible at all.

**2 · Stages 2, 3 and 4 are independent** and run concurrently. They read the
same transcript and emit disjoint annotations — quantities do not depend on
products, products do not depend on outlets. Serialising them would add latency
for nothing, and a slow catalogue lookup cannot delay the numeral grammar.

### Stage 2 — the Bangla quantity grammar

`pipeline/stages/02-normalize-numerals/`. Three token classes carry arithmetic:

| Class | Behaviour | Examples |
|---|---|---|
| **Standalone fraction** | a complete value by itself | আধা = 0.5, দেড় = 1.5, আড়াই = 2.5 |
| **Prefix fraction** | modifies the *following* cardinal | সাড়ে X = X+0.5, সোয়া X = X+0.25, **পৌনে X = X−0.25** |
| **Count multiplier** | unit of count, not measure | ডজন ×12, হালি ×4, কুড়ি = 20 |

দেড় ডজন → 1.5 × 12 = **18**. পৌনে তিন কার্টন → 3 − 0.25 = **2.75**.

পৌনে is the one to name aloud: it *subtracts*, and anything doing naive keyword
matching gets it backwards. No general LLM handles it reliably, and getting a
quantity wrong is the most expensive extraction failure in this domain — an
order of 18 recorded as 1.5 is worse than no record at all.

Each entry carries spelling variants because ASR emits them constantly, with a
fuzzy fallback at threshold 0.85 for forms not in the table.

### Stage 3 — the phonetic SKU resolver

`common/bangla-phonetic.ts` + `pipeline/stages/03-resolve-sku/`.

**The core insight: Bangla orthography is many-to-one onto sound.** শ, ষ, স all
→ /s/. ণ, ন → /n/. র, ড়, ঢ় → /r/. Vowel length (ই/ঈ, উ/ঊ) is orthographic, not
phonemic, in modern speech. Aspiration (ক/খ, ত/থ) is routinely lost or invented
by ASR. So a transcript can be **wrong on the page and right in the ear**.

Both the heard text and the catalogue collapse into one phonetic key space, so
হইল matches হুইল matches "Wheel". **Latin folds into the same space**, because
the catalogue is English while reps speak Bangla — without that, no amount of
edit distance connects প্রাণ to PRAN.

Three war stories worth telling, because they are what a paper does not contain:

- **Unicode composition exclusion.** ড়, ঢ়, য় are each *two* code points — base
  plus nukta U+09BC — and NFC will **never** compose them. A naive per-character
  walk reads ড় as /d/ when it is /r/, silently corrupting every word containing
  one, আড়াই among them. Nukta forms are folded before anything walks the string.
- **Strict and lenient similarity are different tools.** সতেরো (17) and স্টোরে
  ("at the store") share the consonant skeleton `s-t-r` exactly. Skeleton
  matching reads a shop as a number. Numerals use `phoneticKeySimilarity`
  (vowels kept); names use `phoneticSimilarity` (skeleton fallback).
- **Initial `wh` → `hu`,** or Wheel never matches হুইল. Post-vowel `w` is a
  glide: "New" is নিউ, not `neb`.

Scoring has three routes with **deliberate caps** — name, brand (cap 0.85),
manufacturer (cap 0.70). The caps make ambiguity legible: a bare "প্রাণ"
collapses the top-1/top-2 margin to zero, which is the correct answer, because
the rep named a brand and not a product.

**It emits candidates, not decisions.**

### Stage 4 — outlet resolution

GPS radius **plus** spoken name, on a **ramp, not a gate**. A hard 0.85 threshold
discarded a legitimate 0.72 name match on corrupted ASR and ranked the *nearer*
shop first — attributing observations to the wrong store while holding good
evidence. The demo outlets sit within ~40 m of each other on purpose: GPS alone
cannot separate them, so the name has to decide.

### Stage 5 — constrained assembly (the architectural claim)

`pipeline/stages/05-assemble/schema.ts`. The response schema is **rebuilt for
every clip**. Identity fields are not free strings:

```ts
skuId: z.enum(["SKU-404", "SKU-407"]).nullable()   // ← from stage 3, this clip only
```

`vocabularyFrom(annotations)` collects the resolver's candidates; competitors go
into a separate `competitorBrand` enum from our own `skuId` enum. The same Zod
object generates **both** the runtime validator and the model's JSON response
schema (via `zod-to-json-schema`), so the two cannot drift.

**This makes a hallucinated product structurally inexpressible, not merely
discouraged.** A static schema with `skuId: string` plus "only use products from
the list" is a *request*. An enum is a *constraint*.

> Live evidence: our evaluation produced `COMP-ARIEL` on one clip. I checked
> whether the model had invented a SKU — it had not. Ariel was genuinely in the
> customer's catalogue via a CSV import. The guarantee held; the resolver simply
> picked the wrong detergent. That is a resolver error, which is measurable and
> fixable. A hallucination is neither.

Numbers get a **second guard**, because a JSON schema cannot bind a float: any
quantity the model returns is checked against what the grammar actually parsed.
This is also why `priceDelta` was 0/4 in our run — the grammar did not parse the
corrupted number word, so the model was not permitted to invent one. **The guard
worked; it cost us recall.** That trade is deliberate.

### Stage 6 — derived confidence

`pipeline/stages/06-confidence/index.ts`. Confidence is **derived from upstream
evidence and never self-reported**, because language models are badly calibrated
and will attach 0.95 to a value they invented — asking one how sure it is
measures fluency, not correctness.

```
field_conf = asr_conf(span) × margin_factor × grammar_hit × source_penalty
```

- `asr_conf(span)` — `confidenceOverSpan()` in `common/transcript.ts`, an
  **overlap-weighted mean** of word confidences across the exact characters the
  annotation covers. Not the clip average: how clearly was *this product name*
  heard.
- **`margin_factor`** — top-1 minus top-2 from the resolver, saturating at 0.3
  with a floor of 0.55. **This is the term that earns its place.** A resolver can
  return a high top score with a rival one point behind; the score alone says
  "confident", the margin says "two products sound identical and I guessed".
  Flagging on score alone would confirm exactly the cases most likely wrong.
- An **approved alias short-circuits the margin** — a human already decided that
  surface form means that product.
- Fields the model authors outright (`type`, `severity`, `verbatimBn`) take a
  flat 0.9 penalty and can never look better-evidenced than something traceable.
- A declared outlet (rep tapped the shop) scores **1**. Nothing to be unsure of.

**Confidence and margin are opposite scales** — a margin of 0.3 is already
decisive. Do not mix them up on stage.

**Low confidence never discards data. It sets a status.** A dropped observation
is unsellable into an enterprise; a flagged one is honest. Below threshold on a
*critical* field (outlet, sku, quantity, competitor) → `needs_clarification` →
a one-tap question to the rep, or HQ review.

---

## 4 · How accuracy is measured

`backend/eval/`. **This is an evaluation, not a test**, and the distinction is
deliberate: tests are deterministic and gate every commit; this is stochastic,
costs money, and produces metrics. Conflating them gives you a flaky CI that
someone eventually switches off.

### Two different metrics

**Word error rate** = (substitutions + insertions + deletions) / reference
words, via Levenshtein over tokens. Needs a **human reference transcript**.

**Field accuracy** does *not*. It scores against the expected observations,
which come from the recording scenario. Four outcomes per field:

| | meaning |
|---|---|
| `correct` | both present and equal |
| `wrong` | both present and different — **expensive** |
| `missed` | truth had it, we did not |
| `spurious` | we invented one — **expensive** |

Predictions are matched to truth **greedily by best field agreement, not by
position** — a clip yields an unordered set, and a model listing them in a
different order has not erred (`pairObservations` in `eval/metrics.ts`).

### Calibration — the number behind the number

Of the fields we passed at 0.9, how many were actually right? **Expected
calibration error 0.076** on our run. A system whose 0.9 means 0.6 is worse than
one with no confidence at all, because it suppresses exactly the prompts that
would have caught its errors.

### Our actual numbers, and their limits

| | |
|---|---|
| Field accuracy | **52.6%** (20 clips, live models) |
| Character error rate | **28.5%** |
| Word error rate | **77.8%** — an over-estimate |
| Expected calibration error | 0.076 |
| Deterministic layer | **~38 ms** of a ~2.4 s pipeline |

**Say the caveats before you are asked.** Twenty clips, one speaker, quiet room,
read from a script. The WER reference is that script rather than an independent
transcription, so every fumble counts as a machine error — the label schema
records this as `referenceSource: "script"` and the report refuses to print it
as an independent measurement.

**The WER/CER gap is the interesting part.** 77.8% word errors against 28.5%
character errors means most words are *nearly* right — শান্ত জেনারেল heard as
সান্তো জিনেরল. Bangla spelling drift makes word-level scoring brutal. Word-level
accuracy is ~22%; field accuracy is 52.6%. **We recover more than twice as many
structured fields as words.** That gap is the entire argument.

---

## 5 · Systems engineering

**Stack:** Express · TypeScript · MongoDB (native driver) · Zod · Redis · BullMQ ·
React + Vite PWA · Socket.IO.

Decisions worth defending:

- **BullMQ over RabbitMQ** — Redis-backed, so one fewer service. Retries,
  backoff and delayed jobs are built in, which makes the 24-hour clarification
  timeout a scheduling option rather than a cron job.
- **Native Mongo driver, not Mongoose** — Zod already owns the document shape; a
  second schema layer is a second source of truth.
- **Zod three times over** — static types via `z.infer`, the model's response
  schema via `zod-to-json-schema`, and runtime validation at every boundary.
- **No DI container** — one `container.ts` composition root you read top to
  bottom. `pipeline/` may only import from `ports/`, enforced by an eslint
  `no-restricted-imports` rule. Production wires real adapters, tests wire fakes.
- **Ports and adapters** — `IAsrProvider`, `ILlmProvider`, `IOcrProvider`,
  `IStorage`, `ICatalogRepo`, `IOutletRepo`. This is why the ASR can run fully
  local (`local-whisper.adapter.ts`) and **field data need never leave the
  customer's infrastructure** — the answer that gets you through a security
  review.

**Reliability details:**

- **Idempotency** — the *client* generates a UUID before upload; a unique index
  on `(companyId, clientUuid)` makes duplicate delivery impossible, with Redis
  as the fast path. Retrying an upload that actually succeeded is safe.
- **Offline first** — the recording goes to IndexedDB before anything else and
  uploads in the background. The rep never waits and never sees an error.
- **Tenancy** — Socket.IO rooms are per company. A socket that has not joined
  receives nothing.
- **Content-addressed stage cache** on stage + version + input + model, so
  re-running a clip does not re-bill the same call.
- **Per-clip tracing** — every stage's input and output dumped to
  `backend/traces/`. When a field comes out wrong the question is "which stage?"
  and the answer is one file.

**Testing — five tiers:** 0 unit, 1 stage-fixture, 2 contract (live APIs,
manual), 3 integration (fakes, CI), 4 **evaluation** (metrics, not tests).
**449 tests, full suite under two seconds.**

---

## 6 · The alert layer — why it is not a notification system

An observation is one rep saying one thing. An **alert is corroboration**: three
*distinct outlets* reporting the same `(kind, key)` within 24 hours.

The unit of evidence is a **shop, not a recording** — otherwise one talkative rep
revisiting one outlet four times raises an alert by himself, which is the false
positive that teaches people to ignore alerts.

Only market conditions several outlets can independently witness qualify:
competitor promo, stock-out, price change. A demand signal belongs to one shop;
a complaint is one retailer's opinion.

**Dedup rules:** one open alert per `(kind, key)`, later outlets joining it —
eleven outlets on one alert beats eleven alerts. Once answered it will not
re-raise unless enough outlets report *after* it closed, or acknowledging would
instantly re-raise from the evidence you just handled.

**Why it exists:** `acknowledgedAt − raisedAt`. The ROI model rests on
compressing how long a stock-out lasts, and the system could not observe that
quantity at all. Now both ends of the clock are inside the system.

---

## 7 · The OCR pipeline — what exists, and how you would build it

### Be unambiguous: it is simulated

`adapters/ocr/mock.adapter.ts` returns **one of four canned Bangla strings**,
selected by hashing the image bytes. It reads zero pixels. `simulated = true`
propagates onto the clip and every surface that displays it.

**Do not let anyone leave the room thinking otherwise.** But the framing is
strong and true:

> "The handwriting reading is simulated and it says so on the capture screen, on
> the result, and in the console analytics. What is *not* simulated is everything
> after it. That photo runs through the same quantity grammar, the same phonetic
> resolver, the same constrained assembly and the same confidence gate as speech.
> The port is `IOcrProvider`, it returns the identical `Transcript` type as ASR,
> and swapping in a real model touches one file. Adding a whole second modality
> touched four."

That is a genuine architectural claim: the stage boundary is at *extraction*, so
a photographed sign and a spoken sentence are both just text with per-token
confidence and character spans.

### The re-scope you should announce

Handwritten Bangla is near research-grade — cursive, high inter-writer variance,
no large annotated corpus. It was the wrong first target, and it duplicates what
voice already does.

**Printed capture is tractable today and worth more:**

| Target | Feasibility | Why it beats voice |
|---|---|---|
| Shelf price tags | printed, high contrast | the price, verified |
| Competitor promo signage | printed | **evidence**, not a claim |
| POSM / display compliance | visual | proves the display exists |
| Planogram / shelf share | visual | share of shelf, countable |

A rep can *claim* a competitor promo. A photographed shelf tag **proves** it,
GPS- and time-stamped. That is a different and stronger product than reading an
order pad — and it maps onto observation types you already have:
`competitor_promo`, `price_change`, `posm_issue`.

### How you would actually build it

**Stage A — detection.** Find text regions before reading them. A shelf photo is
mostly not text. **EAST** or **DBNet** for scene-text detection, or
PaddleOCR's bundled detector. Output: rotated bounding boxes.

**Stage B — rectification.** Shelf photos are taken at an angle. Perspective-warp
each box to a horizontal strip. This single step is usually worth more accuracy
than any recogniser change.

**Stage C — recognition.** A **CRNN + CTC** model (convolutional features →
BiLSTM → connectionist temporal classification) or a small transformer head, per
cropped strip. For Bangla:
- **PaddleOCR** has Bengali support and runs on CPU
- **Tesseract 5** with `ben` traineddata — weaker, but trivially deployable
- A **VLM** (Gemini/Qwen-VL) as a strong baseline to beat, not as the product

**Stage D — per-token confidence.** CTC gives you a per-character probability
path; average it per word. This is **not optional** — your entire confidence
architecture is built on `Transcript.words[].conf`, and an OCR adapter that
returns text without confidence would silently degrade stage 6 to a constant.
That is the integration detail that shows you have thought about it.

**Stage E — the adapter.** Implement `IOcrProvider`, return the same `Transcript`
shape with character spans. Nothing downstream changes.

**Why constrain the VLM too:** a vision-language model will confidently read a
product name that does not exist in the customer's catalogue. Same failure, same
fix — the resolved candidate set is what makes the output checkable. That answer
generalises your architecture rather than being a patch.

**Data plan, if asked:** ~500 photographed price tags and promo signs from real
outlets, boxes and text labelled. Fine-tune the recogniser on Bangla numerals and
the customer's brand vocabulary specifically — that is where a general model
fails and a domain one wins.

---

## 8 · What you would build next, in order

1. **A labelled set from real outlets.** Every number is blocked on this, and it
   is fieldwork rather than engineering.
2. **A learned confidence model** — logistic regression or GBM over features
   already computed, labelled by "was this field correct". About a day's work,
   reuses the eval labels, and turns hand-tuned thresholds into a real ML
   artefact with a calibration curve.
3. **Domain-adapted ASR** — n-gram shallow fusion over the customer's catalogue
   at decode time, biasing toward brand and outlet names. This directly attacks
   the proper-noun failure that dominates our errors.
4. **Real OCR** on printed shelf and price capture, per §7.
5. **A bounded resolution agent** — on low confidence, a tool-calling loop with
   four tools (re-transcribe segment, relaxed catalogue query, outlet order
   history, rep's prior mentions) before escalating to a human.

**A known gap, and volunteer it:** a surface form matching *nothing* produces no
annotation, so it can never become an alias candidate — precisely where an alias
would help most. Fixing it needs stage 3 to emit sub-threshold near-misses.

---

## 9 · What not to claim

- ❌ A measured accuracy on real Bangladeshi field audio. Ours is 20 clips, one
  speaker, read from a script in a quiet room.
- ❌ That handwriting recognition reads pixels. It does not.
- ❌ Any customer, pilot or user. There are none.
- ❌ That the 20% stock-out duration reduction is measured. It is an assumption,
  and every other line in that model is sourced.
- ❌ Word-level confidence from Whisper. It is segment-level, inherited by words.

**When you do not know:** *"I don't know. I'd have to measure it."* Then move on.
One honest admission buys credibility for everything else you claim — and this
room can tell the difference.

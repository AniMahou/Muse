# The engineering journey

Written to be studied, not skimmed. Every section names the concepts involved so
you can go and read about each one independently, explains why we chose what we
chose, and — where it happened — what broke and what the breakage taught.

Nothing here is theory we did not use. Every number is from our own runs.

---

# Part 0 · What we are actually building

A sales rep visits 30–50 shops a day. His company's app records his **orders**.
It records **the reason for nothing** — why a shop refused, what a competitor
did, what the shopkeeper complained about. Typing that at forty shops a day is
impossible, so nobody does.

Muse lets him **speak for fifteen seconds**, and turns that into structured rows.

## The one idea everything else follows from

Bangla speech recognition is bad at exactly the words that matter. General
models have heard millions of hours of ordinary Bangla and have never heard
"সার্ফ এক্সেল" or "বিজয় স্টোর". Brand names and shop names — **proper nouns** —
are where they fail.

So we inverted the usual assumption:

> **The transcript does not need to be right. The fields need to be right.**

Measured on our own data: the recogniser gets **72.5% of words wrong** and we
extract the correct shop, product and quantity **59.1%** of the time. Word-level
accuracy is ~27%; field accuracy is more than double it. **That gap is the
entire product.**

We get there by matching what was heard against a **closed set** — the
customer's own catalogue — instead of trusting the text.

---

# Part 1 · The architecture

## Concept: Ports and Adapters (Hexagonal Architecture)

**The idea.** Your core logic defines *interfaces* describing what it needs
("something that turns audio into text"). Those are **ports**. Concrete
implementations — Groq, Gemini, a local model, a fake for tests — are
**adapters**. The core never imports an adapter.

**In our code.** `backend/src/pipeline/ports/` holds `IAsrProvider`,
`ILlmProvider`, `IOcrProvider`, `IStorage`, `ICatalogRepo`, `IOutletRepo`.
An eslint rule (`no-restricted-imports`) makes it a build error for anything in
`pipeline/` to import a concrete adapter.

**Why it earned its place, concretely:**

- Swapping speech providers is a one-line change in `container.ts`
- Tests run the entire pipeline against fakes — no network, no API key, in under
  two seconds
- **The speech model can run entirely inside a customer's own network**
  (`local-whisper.adapter.ts`). That is not a technical nicety; it is the answer
  that gets you through an enterprise security review, and it exists only because
  the core never knew which provider it was talking to.

**Go read about:** hexagonal architecture, dependency inversion, the difference
between dependency injection and a DI container.

## Concept: schema-driven design (Zod)

**The idea.** Define the shape of your data **once**, and derive everything else
from it — TypeScript types, runtime validation, and API contracts.

**In our code.** `shared/observation.schema.ts` defines what an observation is.
From that single definition we get:

1. `z.infer<typeof ObservationSchema>` — the TypeScript type, free
2. Runtime validation at every boundary
3. The **JSON schema we hand the language model** (via `zod-to-json-schema`)

Point 3 is the interesting one and Part 2 explains why.

**Go read about:** Zod, JSON Schema, "parse, don't validate".

## Concept: job queues and idempotency

A recording is uploaded, then processed. Processing takes ~2.4 seconds and calls
two external APIs. You cannot make the phone wait.

**Queue (BullMQ over Redis).** The upload writes a job and returns immediately.
A separate worker process picks it up. Retries, exponential backoff and delayed
jobs come built in — which is why our 24-hour clarification timeout is a
scheduling option rather than a cron job.

**Idempotency.** Networks retry. If a phone uploads, times out, and retries, you
must not create two records. So **the client generates a UUID before uploading**,
and a unique database index on `(companyId, clientUuid)` makes a duplicate
*impossible* rather than unlikely. Redis is the fast path; the index is the
guarantee.

> The principle: when correctness matters, enforce it in the layer that cannot
> be bypassed. Checking in application code is a wish; a unique index is a fact.

**Go read about:** message queues, at-least-once delivery, idempotency keys.

---

# Part 2 · The voice pipeline, stage by stage

```
voice ──┐
        ├─→ ① EXTRACT ─→ ②③④ ANNOTATE ─→ ⑤ ASSEMBLE ─→ ⑥ CONFIDENCE
photo ──┘     [API]        (parallel)       [API]       (deterministic)
```

## Two invariants worth memorising

**1 · Stages annotate; they never rewrite the transcript.** Every annotation
carries **character spans** back into the original text. If stage 2 rewrote
`দের ডজন` → `18` and got it wrong, the evidence stage 6 needs would be gone.
This is what makes per-field confidence possible at all.

**2 · Stages 2, 3 and 4 are independent** and run concurrently. Quantities do
not depend on products; products do not depend on shops.

That second one has a consequence you can demonstrate. Say a product that is not
in the catalogue:

```
transcript      : বিজয় স্টোরে হরলিক্স মল্ট চার ডজন লাগবে
SKU annotations : NONE — nothing matched
OUTLET resolved : OUT-1182 Bijoy Store | nameScore 0.96
```

The unknown product does not damage the shop or the quantity. That is
independence paying off, not luck.

## Stage 1 · How Whisper turns sound into text

This is the part most people wave at. Know the mechanism.

**Whisper is an encoder–decoder Transformer** trained on ~680,000 hours of audio.

1. **Resample to 16 kHz mono.** Why we normalise up front: the model does it
   internally anyway, and doing it once means identical bytes every run — so a
   cached result stays valid.
2. **Log-Mel spectrogram.** 80 frequency channels, 25 ms window, 10 ms hop.
   Audio becomes a 2-D image of frequency against time. *Mel* is a frequency
   scale spaced the way human hearing is: fine detail low, coarse high.
3. **Fixed 30-second window**, zero-padded. Our clips are 5–15s, so most of the
   window is padding — which is why a 3-second clip costs the same as a 25-second
   one.
4. **Encoder** — convolutions then Transformer blocks, producing audio embeddings.
5. **Decoder** — an autoregressive Transformer that emits **BPE tokens** one at a
   time, conditioned on special tokens (`<|bn|>` for language).

### The consequence that shapes our whole design

**Whisper is a language model as much as an acoustic one.** The decoder predicts
the next token given the audio *and everything it has already written*. So it
emits fluent, plausible Bangla. Our errors look like this:

```
said  : শান্ত জেনারেল স্টোরে সার্ফ এক্সেল
heard : সান্তো জিনেরল স্টোরে সার্ফেক্সেলে
```

Those are real words, wrongly. **That is the dangerous failure mode** — a
downstream language model would happily accept them and produce a confident
wrong answer. It is precisely why stage 5 is locked down the way it is.

**Go read about:** Transformers, attention, spectrograms, mel scale, BPE
tokenisation, autoregressive decoding, beam search.

### Where per-word confidence comes from

Whisper does **not** emit per-word confidence. It gives, per *segment*,
`avg_logprob`, `no_speech_prob` and `compression_ratio`. We derive:

```
segment_conf = exp(avg_logprob)                    # mean token probability
             × (1 − no_speech_prob)                # silence lends no confidence
             × (compression_ratio > 2.4 ? 0.5 : 1) # decoder repetition loop
```

`exp(avg_logprob)` is the standard reading of mean token probability: ≈0.90 at
−0.1, 0.61 at −0.5, 0.37 at −1.0.

The compression-ratio guard is worth understanding: when a decoder falls into a
**repetition loop** it produces fluent text that corresponds to no audio at all.
A suspiciously high compression ratio catches it.

**Every transcript carrying derived confidence is flagged `confidenceDerived:
true`**, so nothing downstream mistakes it for a real per-word measurement.

> The principle: when you compute a number that looks like a measurement, record
> that you computed it.

## Stage 2 · The Bangla quantity grammar

Three token classes carry arithmetic:

| class | behaviour | examples |
|---|---|---|
| standalone fraction | complete value alone | আধা 0.5, দেড় 1.5, আড়াই 2.5 |
| prefix fraction | modifies the *next* number | সাড়ে X = X+0.5, সোয়া X = X+0.25, **পৌনে X = X−0.25** |
| count multiplier | unit of count | ডজন ×12, হালি ×4, কুড়ি 20 |

দেড় ডজন → 1.5 × 12 = **18**. পৌনে তিন কার্টন → **2.75**.

**পৌনে subtracts.** Anything doing naive keyword matching gets it backwards, and
no general model handles it reliably. Getting a quantity wrong is the most
expensive failure in this domain — an order of 18 recorded as 1.5 is worse than
no record at all.

## Stage 3 · Phonetic matching — the heart of the system

### Concept: many-to-one orthography

**Bangla spelling maps many written forms onto one sound.**

- শ, ষ, স → all /s/
- ণ, ন → both /n/
- র, ড়, ঢ় → all /r/
- Vowel length (ই/ঈ, উ/ঊ) is orthographic, not phonemic in modern speech
- Aspiration (ক/খ, ত/থ) is routinely lost or invented by ASR

So **a transcript can be wrong on the page and right in the ear.**

We collapse both the heard text *and* the catalogue into a common phonetic key.
হইল, হুইল and "Wheel" all reduce to the same key. **Latin folds into the same
space** — the catalogue is English, the speech is Bangla, and without a shared
space no amount of edit distance connects প্রাণ to PRAN.

### Concept: edit distance

**Levenshtein distance** is the minimum number of single-character insertions,
deletions or substitutions to turn one string into another. Divide by length and
you get a similarity score.

Raw edit distance on Bangla fails: তীন and তিন differ by one character in three
— a score of 0.67, rejected — but they are the same word. **Collapsing to
phonetic keys first is what makes the distance meaningful.**

### 💥 Breakage: Unicode composition exclusion

ড়, ঢ় and য় are each **two code points** — a base letter plus the *nukta* mark
U+09BC — and Unicode's composition-exclusion table means NFC normalisation will
**never** join them into single characters.

A naive per-character walk therefore sees only ড and reads it as /d/ when it is
/r/. That silently corrupted every word containing one — আড়াই (2.5) among them.

**The fix:** fold nukta sequences to their precomposed forms *before* anything
walks the string.

**The lesson:** normalising Unicode is not a formality. In a non-Latin script,
"one character" and "one code point" are different things, and the difference
produces wrong answers rather than errors.

**Go read about:** Unicode normalisation forms (NFC/NFD/NFKC), grapheme
clusters, composition exclusions, combining marks.

### 💥 Breakage: one similarity function was not enough

সতেরো (seventeen) and স্টোরে ("at the store") share the consonant skeleton
`s-t-r` **exactly**. A skeleton-based matcher reads a shop as a number.

**The fix:** two functions. Numerals use `phoneticKeySimilarity` (vowels kept);
product and shop names use `phoneticSimilarity` (skeleton fallback allowed).

**The lesson:** a similarity metric is not universal. It encodes an assumption
about what may safely be ignored, and that assumption differs by field.

### Concept: scoring with deliberate caps

Matching runs three routes with different ceilings: name, brand (cap 0.85),
manufacturer (cap 0.70).

The caps make ambiguity **legible**. A bare "প্রাণ" cannot score above 0.85, so
the gap between the best and second-best candidate collapses to near zero — which
is the correct answer, because the rep named a brand, not a product.

**Stage 3 emits candidates, not decisions.**

## Stage 4 · Outlet resolution

GPS radius **plus** spoken name, combined on a **ramp, not a gate**.

### 💥 Breakage: a hard threshold attributed data to the wrong shop

A 0.85 cut-off discarded a legitimate 0.72 name match on corrupted audio, and
then ranked the *geographically nearer* shop first — attributing observations to
the wrong store while holding perfectly good evidence.

**The lesson:** a threshold throws information away. A weighted ramp keeps weak
evidence as weak evidence, which is nearly always what you want when a later
stage can still use it.

## Stage 5 · Constrained decoding — the strongest idea in the codebase

### Concept: constraining a model's output space

The usual way to stop a model inventing things is to ask it not to:

```
"Only use products from this list."     ← a request
```

The model may comply. It may not. You find out in production.

**We do it differently.** The response schema is **rebuilt for every single
recording**, with identity fields as enums of exactly what the resolvers found:

```ts
skuId: z.enum(["SKU-404", "SKU-407"]).nullable()  // ← from stage 3, this clip only
```

The same Zod object generates **both** the runtime validator **and** the JSON
schema sent to the model, so they cannot drift apart.

> A product the resolver never found is **inexpressible** — there is no token in
> the model's grammar that would say it. That is a constraint, not a request.

### The moment this got tested for real

Our evaluation produced `COMP-ARIEL` on one clip. Ariel is not in
`seed-data.ts`, and for a few minutes it looked like the guarantee had failed.

It had not. Ariel was genuinely in the customer's database, added by an earlier
CSV import. **The resolver picked the wrong detergent — a resolver error, which
is measurable and fixable. A hallucination is neither.**

**Go read about:** constrained decoding, grammar-based sampling, structured
output / function calling, JSON Schema.

### The second guard

A JSON schema cannot constrain a *number* to a set. So any quantity the model
returns is checked against what the grammar actually parsed.

This is why `priceDelta` scored **0 out of 4** in one evaluation: the grammar
failed to parse a corrupted number word, so the model was **not permitted** to
invent one. The guard worked; it cost us recall. That trade is deliberate.

## Stage 6 · Confidence that is derived, never self-reported

### Concept: models are badly calibrated

If you ask a language model how confident it is, it tells you about **fluency**,
not correctness. It will attach 0.95 to something it invented.

So we never ask. Confidence is computed from upstream evidence:

```
field_conf = asr_conf(span) × margin_factor × grammar_hit × source_penalty
```

- **`asr_conf(span)`** — an overlap-weighted mean of word confidences across the
  *exact characters* the annotation covers. Not the clip average: how clearly was
  **this product name** heard.
- **`margin_factor`** — the gap between the best and second-best candidate.

### Concept: margin, and why it matters more than score

This is the subtlest idea in the pipeline.

A resolver can return a **high top score** with a rival sitting one point
behind. The score alone says *"confident"*. The margin says *"two products sound
identical and I guessed"*.

> Flagging on score alone would confirm precisely the cases most likely to be
> wrong.

**Confidence and margin are opposite scales.** A margin of 0.3 is already
decisive; a confidence of 0.3 is terrible. Do not mix them up.

### The rule that makes it sellable

**Low confidence never discards data. It sets a status.**

A dropped observation is unsellable into an enterprise — you cannot audit what
is not there. A flagged one is merely honest. Below threshold on a critical
field → `needs_clarification` → a one-tap question back to the rep.

---

# Part 3 · Measurement — how we know anything

Everything above is a claim until measured. This part is what separates
engineering from assertion.

## Concept: tests vs evaluations

They are different things and conflating them is a classic mistake.

| | tests | evaluation |
|---|---|---|
| deterministic? | yes | no |
| costs money? | no | yes — real API calls |
| runs when? | every save | before changing prompts, code or catalogue |
| answers | "is it broken?" | "is it better?" |

We have **455 tests** (run in ~2 seconds, no network) and a separate `eval/`
that is **not** a test. Mixing them gives you a flaky CI that someone eventually
switches off.

## Concept: word error rate vs field accuracy

**WER** = (substitutions + insertions + deletions) / reference words, computed
with Levenshtein over tokens. It needs a human reference transcript.

**Field accuracy** does not. It scores against the *expected observations*, which
come from the recording scenario. Four outcomes per field:

| | meaning |
|---|---|
| correct | both present and equal |
| wrong | both present and different — **expensive** |
| missed | truth had it, we did not |
| spurious | we invented one — **expensive** |

That distinction matters: a system that stays silent when unsure is very
different from one that guesses. Our `skuId` scored **12 correct, 0 wrong** —
100% precision. It declines rather than lies. So the work is *recall*, which is a
much easier problem.

### 💥 Breakage: comparing against the wrong row

The field tally matched predictions to truth **greedily by best agreement**, not
by position — correct, because a clip yields an unordered set.

The confidence calibration did its own pairing and compared **every** prediction
against `truth[0]`. On any clip with two or three observations — exactly the
clips we over-sampled — it scored predictions against the wrong reference.

**The fix:** extract the matching into one function both use.

**The lesson:** when two pieces of code answer the same question, they will
eventually disagree. One implementation, two callers.

## Concept: calibration

If a system says 0.9, is it right 90% of the time?

**Expected Calibration Error (ECE)** bins predictions by claimed confidence and
measures the gap between claimed and observed accuracy. Ours: **0.076**.

> A system whose 0.9 means 0.6 is **worse than one with no confidence at all** —
> it suppresses exactly the prompts that would have caught its errors.

**Go read about:** calibration curves / reliability diagrams, ECE, Brier score,
Platt scaling, isotonic regression.

## Concept: the held-out test set

**The single most important discipline in applied ML.**

Once you have looked at how a change performs on a clip, that clip can no longer
tell you whether the change **generalises**. You have started fitting to it, even
if only through which experiments you chose to keep.

So you freeze a slice **before** you start tuning, and you do not look at it.

Our split: 14 dev cards, **6 test cards frozen and untouched**.

Two details worth copying:

- **Split by card, not by clip.** Two takes of card 7 are the same sentence, same
  products, same shop. Splitting them puts the answer on both sides.
- **The tool refuses to redraw it.** A set you can regenerate when the numbers
  disappoint is not held out.

**Go read about:** train/validation/test splits, data leakage, overfitting,
cross-validation.

### 💥 Breakage: `--no-cache` never worked

The eval had a stage cache so repeated runs did not re-bill the same API call.
The `--no-cache` flag was parsed, **written into the report as
`cacheDisabled: true`, and never applied.**

So every run after the first replayed cached transcripts. Three A/B comparisons
of the recogniser all returned **WER 80.5%, identical to the decimal** — because
I was comparing a change against itself while the report claimed otherwise.

**The lesson:** a flag that lies is worse than a missing flag. And *identical*
results across supposedly different conditions is a signal to investigate, not a
finding to report.

### 💥 Breakage: a failed run became the baseline

The eval writes a snapshot each run and gates the next one against it. A run
where 17 of 20 clips died on rate limits still wrote its snapshot — computed from
the 3 survivors. The next full run then reported a **REGRESSION from 80% to 54%**,
comparing 20 clips against 3.

**The fix:** only complete runs write a baseline, and the gate only fires against
a baseline of comparable size.

**The lesson:** the worst measurement failure is not an error. It is a plausible
number computed from the wrong thing.

---

# Part 4 · Making the recogniser better

## Concept: decode-time biasing

Whisper's decoder is autoregressive and conditions on a **prompt prefix**. Seed
it with words that are about to be said and their token probabilities rise.

Our errors are concentrated in proper nouns. So we pass the customer's catalogue.

**Measured, dev split, cache genuinely bypassed:**

| | off | on | |
|---|---|---|---|
| Word error rate | 80.5% | **72.5%** | **−8.0** |
| Field accuracy | 50.7% | **59.1%** | **+8.4** |
| Character error rate | 29.6% | 27.2% | −2.4 |

### 💥 Breakage: the script matters more than the words

The first version biased with the **English** catalogue and moved nothing. The
decoder is emitting Bengali tokens; a Latin prompt primes the wrong ones.

One clip, three prompts:

| prompt | transcript |
|---|---|
| none | সার্ফ**েক্সেলে** |
| Latin catalogue | সার্ফ **একসেলে** |
| **Bangla forms** | সার্ফ **এক্সেলে** ← exact |

**The fix:** lead the prompt with the **approved alias table** — the only
Bangla-script product vocabulary the system owns — then the numeral lexicon's
canonical forms, then Latin names.

**Why this is more than a fix:** the alias table now compounds twice. Every form
an admin approves improves the **resolver** on the next clip *and* the
**transcript** that feeds it. The learning loop got one layer deeper.

### 💥 Breakage: characters are not bytes

The prompt has a length limit. I capped it at 880 **characters**. The API counts
**UTF-8 bytes**, and Bengali sits in the 3-byte range — so a 525-character list
is 1123 bytes on the wire. Every request returned HTTP 400.

**The lesson:** `string.length` in most languages counts UTF-16 code units, not
bytes and not characters. In a Latin-only system you never notice. **Budget in
the unit the other side counts.**

**Go read about:** UTF-8 encoding, code points vs code units vs grapheme
clusters.

---

# Part 5 · The OCR track

The photo path returned four canned strings from the day it was built. This is
replacing it — **without needing a single photograph** to get started.

## Concept: why synthetic data works here

Most scene-text recognisers are **pretrained on synthetic corpora** and
fine-tuned on a small real set. That is standard practice, not a shortcut.

And ours is unusually well-suited: **we know the vocabulary in advance.** The
text on a tag a rep photographs is the customer's own catalogue. A general model
has never seen "সার্ফ এক্সেল"; ours sees it ten thousand times.

## 💥 Breakage: Bengali needs real text shaping

**Concept: text shaping.** Turning a string into positioned glyphs is not a
lookup. Scripts require **substitution** (ক + virama + ষ → the single conjunct
ক্ষ) and **repositioning** (ি is written *before* the consonant it is pronounced
after). Fonts carry tables for this — **GSUB** for substitution, **GPOS** for
positioning — and a shaping engine applies them.

Pillow's default layout does none of it. It draws glyphs in logical order.

I rendered a test sheet before assuming, and Bengali came out visibly wrong: the
two-part matras (ো, ৌ) appeared as **detached dotted circles** — Unicode's
"unattached combining mark" placeholder — and nukta never joined its base.

Pillow can delegate to **Raqm**, but Raqm is a build-time dependency missing from
most wheels. Relying on it would make the corpus silently correct on one machine
and wrong on another.

**The fix — done explicitly:**

```
HarfBuzz   text → positioned glyph ids   (applies GSUB/GPOS)
FreeType   glyph id → bitmap
compose    bitmaps onto a canvas at those positions
```

That is the same two-step every real text renderer performs.

**The lesson, and it is the scariest one here:** the broken output *still looked
like Bengali* to someone who does not read Bengali. Some failures are invisible
unless you check specifically.

**Go read about:** HarfBuzz, OpenType GSUB/GPOS, complex text layout, FreeType.

## 💥 Breakage: you cannot detect font support by rendering

I wrote a check that rendered Bengali text and looked for pixels. It reported
**324 usable Bengali fonts on a machine that has 10.** Wingdings was on the list.

**Why:** FreeType and Pillow draw a `.notdef` box for a missing glyph. A font
with zero Bengali produces a confident row of tofu.

**The fix:** read the font's **cmap** — the table mapping characters to glyphs —
and ask whether Bengali code points are genuinely present.

**The lesson:** "did something happen" is not the same question as "did the right
thing happen".

## Concept: augmentation, applied in physical order

A recogniser trained on crisp renders learns crisp renders, then meets a phone
photo of a laminated tag under a fluorescent tube and collapses — and validation
on held-out *synthetic* data never reveals it.

So we degrade in the order the world does:

| step | simulates |
|---|---|
| erode/dilate | ink gain, under-inking |
| lighting gradient + specular blob | uneven light, glare on plastic |
| perspective warp | the camera is never square |
| Gaussian / motion blur | a moving hand |
| Gaussian + salt-pepper noise | sensor, low light |
| JPEG at quality 30–92 | phones save JPEG |

**Go read about:** data augmentation, domain gap, sim-to-real transfer.

## Concept: CRNN + CTC

**The architecture:**

```
CNN     image → a sequence of features along the WIDTH axis
BiLSTM  context along that sequence, both directions
Linear  one logit per character, plus a blank
```

**Why bidirectional matters here specifically:** ি is written before the
consonant it follows phonetically, so a left-to-right-only model would be
guessing.

**Concept: CTC (Connectionist Temporal Classification).** The problem: you have
64 timesteps and a 12-character label, and you do not know which timestep
produced which character. Labelling 50,000 images with character boxes would cost
more than the model is worth.

CTC solves it by **summing probability over every possible alignment** of
timesteps to the target string. So `(image, "প্রাণ")` is a complete training
example.

The **blank** token is what allows genuine double letters: without a blank
between them, two identical frames collapse to one character.

**Decoding (greedy / best path):** take the argmax at each timestep, drop
repeats, drop blanks.

**Why width is pooled less than height:** height collapses to 1, width only
halves twice. Squeeze width further and neighbouring characters merge into a
single timestep — and CTC cannot emit two labels from one frame.

**Go read about:** CTC loss, CRNN, BiLSTM, beam search decoding, attention-based
OCR as the alternative.

## Concept: per-token confidence from CTC

The network emits a probability distribution over the alphabet at **every**
timestep. So the confidence of a character is the probability the model actually
assigned to it, and a word's confidence is the mean over its timesteps.

**This is required, not decorative.** Stage 6 scores fields on
`asr_conf(span) × margin × grammar_hit`. An OCR adapter returning bare text would
flatten that term to a constant — the pipeline would still run, flagging would
stop discriminating, and **nothing would say so**.

## Training results

50,000 samples, 8.2M parameters, Apple Silicon GPU:

| epoch | loss | synthetic CER | exact match |
|---|---|---|---|
| 1 | 5.113 | 0.831 | 0.0% |
| 2 | 1.380 | 0.305 | 21.5% |
| 3 | 0.323 | 0.059 | 78.2% |
| 5 | 0.021 | 0.009 | 94.8% |
| 7 | 0.008 | **0.007** | **97.0%** |

### 💥 Breakage: CTC has no MPS kernel

Apple's GPU backend has not implemented `aten::_ctc_loss`.

**The fix:** compute *only the loss* on CPU while convolutions and the LSTM stay
on GPU. Autograd carries gradients across the device boundary, and the loss is
cheap next to the conv stack. Done explicitly rather than via
`PYTORCH_ENABLE_MPS_FALLBACK` so behaviour does not depend on an environment
variable someone forgot to set.

### ⚠️ What that 97% is and is not

**It is synthetic validation.** Both halves came from the same renderer. It says
"the model learned our generator", which is a necessary milestone and not an
accuracy figure.

**A real number needs photographs.** Even 150. Until then, 97% is a training
diagnostic, and describing it as accuracy would be the kind of claim that does
not survive one good question.

**Go read about:** the difference between validation and test sets, domain shift,
sim-to-real evaluation.

---

# Part 6 · Smaller breakages, and what each taught

| what broke | the lesson |
|---|---|
| ASR adapter hardcoded `.webm` as the upload filename | APIs infer format from filenames too. A wav sent as webm is rejected, and it looks like a pipeline fault. |
| `str.replace` in a patch script hit two places | Python's `str.replace` replaces **all** occurrences. Broke config in a second, invisible location. |
| Demo data had identical confidence on every row | Fixtures must look like real output. A row of matching 90s is the tell that stops an audience believing the screen. |
| A hash without avalanche produced identical values | `h * 31 + c` then shifting out a byte means adjacent inputs differ only in low bits. Mix on the way out. |
| Reused an object after `insertOne` | The Mongo driver stamps `_id` onto the object you pass it. Spreading it into a second insert carries the id. |
| Rate limits recorded as clip failures | A batch job needs its own retry. The eval computed a field accuracy from 3 surviving clips out of 20 — and still produced a number. |

**The pattern across all of them:** the dangerous failures were not crashes.
They were **plausible wrong answers**. A crash tells you. A number does not.

---

# Part 7 · What comes next

## Immediately buildable

**The `IOcrProvider` adapter.** Load the checkpoint, run CTC decoding, emit a
`Transcript` with per-word confidence and character spans. Then delete
`mock.adapter.ts`. This is the step that turns a trained model into part of the
product.

**A numeral corruption model.** `priceDelta` scored 0/4 because দাস→দশ measures
0.667 against a 0.85 threshold. Training pairs can be **generated** from the
phonetic confusion patterns we already encode — aspiration loss, retroflex/dental
collapse, vowel-length drift — so it needs no field data at all.

## Blocked on data

**A learned confidence model.** Replace `asr_conf × margin × grammar_hit` with a
calibrated classifier over features we already compute. Start with logistic
regression (you can read the coefficients and argue with them), then gradient
boosting. Add **isotonic regression** or **Platt scaling** so 0.9 means 0.9.

We have ~100 labelled fields. This needs ~500. *Go read about: logistic
regression, gradient boosted trees, probability calibration.*

**Retrieve-then-rerank for SKU matching.** The standard two-stage information
retrieval pattern: phonetic keys retrieve top-20 (high recall, fast), then a
learned model reranks using phonetic distance, ASR confidence, the rep's brand
portfolio, **the outlet's purchase history**, and co-occurrence with other
products in the clip. *Go read about: learning to rank, siamese networks,
triplet loss, two-stage retrieval.*

## Bigger swings

**n-gram shallow fusion.** Interpolate a small language model over the customer's
vocabulary into the decoder's beam search: `log P(y) = log P_asr(y) + λ log
P_lm(y)`. Stronger than prompt biasing because it acts at every decoding step.
Requires local decoding, which our `local-whisper` adapter already allows.

**LoRA fine-tuning of Whisper.** **Low-Rank Adaptation** trains small additional
matrices instead of the full model — a fraction of the parameters, so it fits on
modest hardware and produces a small artefact. *Go read about: LoRA, PEFT,
catastrophic forgetting.*

**Text detection.** Recognition reads a crop; **detection** finds the crops. DBNet
or EAST produce a per-pixel text probability map, then boxes. This is the stage
synthetic data serves *worst* — synthetic scene composition looks synthetic — so
it is where real photos matter most.

**Shelf-share estimation.** Detect product facings in a planogram photo, count
them, compute share of shelf. A data product voice cannot produce at all.

**The active learning flywheel.** Every clarification a rep answers and every
correction an admin makes is a **free label**. Capture → label store → scheduled
retrain → offline eval gate → shadow deploy → promote. *Go read about: active
learning, human-in-the-loop ML, champion-challenger deployment, drift detection.*

---

# The through-line

If you take one thing from all of this:

> **The failures that cost us most were never crashes. They were plausible
> numbers computed from the wrong thing.**

A cached transcript that made an A/B compare a change with itself. A baseline
drawn from three surviving clips. A calibration curve paired against the wrong
row. A font check that found 324 Bengali fonts on a machine with ten. Rendering
that looked like Bengali and was not.

Every one produced output that looked fine.

Which is why so much of this system is built to make wrongness **visible**:
confidence derived from evidence rather than self-reported, provenance recorded
on every derived number, a held-out set that refuses to be redrawn, a report that
prints "not measured" instead of a zero, and fixtures that are labelled as
fixtures.

That instinct — *how would I know if this were wrong?* — is the thing worth
taking to the next project.

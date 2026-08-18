# Coding updates

Running log of what has been built, and — more usefully — the decisions and
surprises behind it. Newest first.

---

## Status

| | |
|---|---|
| **Tests** | 299 passing, ~0.6 s |
| **Pipeline** | complete, stages 1–6, end-to-end green |
| **API + worker** | complete, runnable |
| **Remaining** | clarification loop, admin surfaces, eval harness |

```bash
cd backend
npm test            # 299 tests, no network, no API key
npm run typecheck
npm run lint
```

---

## 2026-08-17 — Offline demo mode, and a port collision

Two problems surfaced the first time the stack was actually run rather than
tested.

**Port collision, and it was the dangerous kind.** Host port 27017 was already
held by another project's MongoDB, so `muse-mongo` came up with NO published
port — and `mongodb://localhost:27017` would have connected Muse to that
unrelated database and written into it. Nothing would have errored. Muse now
uses 27018 and 6380, documented as deliberate.

**`fake` mode could not demonstrate anything.** The fakes throw on an
unregistered clip, which is correct for tests — a test must never silently run
against invented input — but it meant a fresh clone with no API key could
start the server and then fail on every upload.

Fixed by making demo mode real rather than relaxing the test guarantee:
`FakeAsrProvider` takes an OPT-IN `fallbackText` (tests never set it), and
`DemoLlmProvider` assembles from the candidate lists it finds in the rendered
prompt — so stages 3 and 4 still genuinely decide the output; swap the
catalogue and the result changes.

The canned transcript is the ASR-corrupted reference clip, not a clean one. A
demo that only works on perfect input proves nothing. Verified end to end:

    POST /api/observations -> 202 queued
    worker -> 2 observations, 26 ms total
    SKU-404 / 18 piece / OUT-1182  and  COMP-WHEEL / priceDelta -5
    both needs_clarification, flagged on outletId + skuId

That flagging is correct, not a bug: at 0.78 ASR confidence the derived field
confidences land at 0.74-0.78, just under the 0.80 threshold. The system
declining to be certain about a deliberately corrupted recording is the
behaviour, demonstrated.

This doubles as the exhibition's offline backup, which BrainChild requires.

---

## 2026-08-17 — API, persistence, worker

Mongo layer, ingest endpoint, BullMQ worker, composition root, seed script.

**Idempotency is enforced in two places on purpose.** Redis `SET NX` answers
in under a millisecond on the hot path; the UNIQUE index on
`(companyId, clientUuid)` is the actual guarantee. The PWA queues offline and
retries, and BullMQ is at-least-once, so duplicates are certain rather than
hypothetical. `createClip` honours whoever wins a race instead of erroring.

**Upload takes base64 JSON, not multipart.** Clips are tens of kilobytes, so
the ~33% encoding overhead is a few KB — and in exchange the offline queue
stores and retries a plain JSON object with no multipart body to reconstruct.
Revisit if clips ever get long.

**`POST /observations` returns 202.** The clip is accepted and queued, never
processed inline: a rep in a shop must hand off a recording in under a second
whatever the queue is doing. A repeated `clientUuid` returns **200** with the
original clip, because a duplicate upload is normal operation, not an error.

**Reps are provisioned, never self-registered.** No FMCG company will let
anyone claiming to be a rep sign up and pull down their SKU master, outlet
list and territory coverage — that is competitive intelligence.

**API and worker are separate processes** sharing one container builder, so
transcription load can never make the upload endpoint unresponsive.

The clip processor distinguishes retryable from terminal failures and only
marks a clip `failed` once no attempt remains, so a transient Groq 429 never
surfaces on the dashboard as a failure.

---

## 2026-08-17 — Stage 6 and the orchestrator

**Confidence is derived, never self-reported.** Language models are badly
calibrated and will attach 0.95 to a value they invented, so asking one how
sure it is measures fluency rather than correctness. Every field is traced
back to the annotation that produced it and scored on three things: ASR
confidence over exactly those characters, the resolver margin, and the
grammar's own confidence.

**The margin term is the one that earns its place.** A resolver can return a
high top score while a rival sits one point behind it — the score says
"confident", the margin says "two products sound identical and I guessed".
Gating on score alone would confirm precisely the cases most likely to be
wrong. Test: `flags a SKU whose rival is one point behind, despite a high top
score`.

**Low confidence never discards data.** It sets a status. A dropped
observation is unsellable into an enterprise; a flagged one is honest.

Stages 2, 3 and 4 run **concurrently** — they read the same transcript and
emit disjoint annotations, so a slow catalogue lookup cannot delay the numeral
grammar.

`trace.ts` dumps per-clip, per-stage I/O with binary redacted to a size
marker, so "which stage broke?" is one file rather than a re-run with logs.
Traces are written on failure too. `cache.ts` is content-addressed on stage +
version + input + **provider/model** — omit the provider and you switch ASR,
get a cache hit from the old one, and score stale results believing the new
provider produced them.

---

## 2026-08-17 — Stages 1 and 5

Stage 1 is deliberately thin; provider specifics live in adapters so swapping
ASR is a container change.

**`confidence.ts` documents how per-word confidence is derived** when a
provider does not report it: `exp(avg_logprob)`, discounted by
`no_speech_prob` and by a runaway compression ratio. Stage 6 multiplies this
into a decision to interrupt a rep, so where it came from is written down
rather than assumed.

**Stage 5 rebuilds its response schema for every clip.** Identity fields are
enums whose members are exactly the candidates stages 3 and 4 produced. A
product that was never resolved is **not expressible** — a hallucinated SKU
cannot parse. That is a constraint, not a request. A static
`skuId: string` plus "only use products from the list" would be a request.

**Numbers needed a second guard.** A schema cannot pin a float the way it pins
an identifier, so any quantity or price the model returns is checked against
what the grammar actually parsed and dropped otherwise. This catches a model
that converts 18 pieces back into "1.5 dozen", or invents a plausible number
for a field nobody spoke. Stage 2 stays the single source of truth for every
number in the system.

---

## 2026-08-17 — Stage 4, outlet resolution

Ranks by proximity until some candidate matches a spoken name confidently
(≥0.85); only then does the name take over at 65% weight. A weak name signal
blended into every candidate would shift the ranking without justifying it.

Generic tails — Store, Enterprise, Traders, স্টোর — are weighted at 0.3, since
every shop on the street shares them.

**Found by the fixtures:** Latin `w` after a vowel is a glide, not a
consonant. "New" is নিউ, not `neb`. Only initial `w` takes the ওয়া/ভ reading.

---

## 2026-08-17 — Stage 3, SKU resolver

Two scoring routes, better one wins.

**The brand route was not in the original design and had to be added.**
`হারপিক` matched only 1 of 3 tokens in "Harpic Toilet Cleaner" and scored
0.33 — below threshold, discarded. Catalogue names are formal SKU descriptions
while speech is colloquial; a rep says the brand. The route is capped at 0.85
so a fuller mention still outranks it.

**The cap is what makes ambiguity legible.** A bare "প্রাণ" scores every PRAN
product identically and the margin collapses to zero — which is the correct
reading, not a failure. Stage 6 turns that into a one-tap question.

Approved aliases are checked separately and boosted above similarity: an alias
is a human decision, which is what makes review-queue approvals actually
change resolver behaviour.

---

## 2026-08-17 — Stage 2, quantity grammar and phonetics

দেড় ডজন = 18. পৌনে **subtracts** — the case naive keyword matching gets wrong.

### Two findings worth keeping

**Unicode composition exclusion.** `ড়`, `ঢ়` and `য়` are each TWO code points
(base + nukta U+09BC), and `NFC` will **never** join them into the precomposed
forms — they are in Unicode's composition-exclusion table. A per-character
walk saw only the base letter and read `ড়` as /d/ when it is /r/, corrupting
আড়াই among others. Nukta forms are now folded before anything walks the
string. This was invisible until a fixture happened to contain বিজয়.

**Strict and lenient similarity are different tools.** সতেরো (17) and স্টোরে
("at the store") share the consonant skeleton `s-t-r` exactly, so
skeleton-based matching reads a shop as the number seventeen. Numerals use the
strict full-key comparison where vowels discriminate; product and outlet names
use the lenient one where vowels are transliteration noise. One function
serving both was the bug.

Latin folds into the same key space as Bangla — initial `wh` → `hu`, so
"Wheel" meets হুইল — because the catalogue is English while reps speak Bangla.

---

## 2026-08-17 — Foundation

Express + TypeScript + MongoDB + Zod + Redis + BullMQ. Stages are plain
classes taking ports; a test does `new NumeralStage()` with no framework
boilerplate, which is what keeps the suite in the millisecond range.

An eslint `no-restricted-imports` rule enforces the one architectural
constraint that matters: **`pipeline/` may import only from `ports/`**, never
from `adapters/` or `db/`.

**`shared/` needed zod at the repo root.** It sits outside `backend/`, so Node
resolution cannot reach `backend/node_modules`. One root dependency, no
workspace tooling.

---

## Deliberately NOT built

| | Why |
|---|---|
| `S3Storage` | Throws rather than half-working. The demo runs on local disk; the right driver depends on where a customer hosts. The port makes it a one-file swap. |
| Embeddings for SKU matching | Phonetic + edit distance is enough at ~200 SKUs. Territory scoping, not embeddings, is the answer at 2,000. |
| Cron sweeper for stale clarifications | A per-record BullMQ delayed job solves it by construction. |
| Auto-eval on HQ corrections | Causally confused. Corrections fix production records; they do not change the pipeline, so scores cannot move. Worse, auto-promoting corrected clips drifts the eval set toward hard cases and scores decline for reasons unrelated to quality. |
| Full entity CRUD | Muse is not the system of record. Master data is imported; the only table it owns is `Alias`. |

---

## Next

1. **Clarification loop** — batched one-tap prompts, BullMQ delayed
   auto-resolve, and the edge case that will bite: a rep answering *after*
   auto-resolution must still patch and re-emit.
2. **Admin** — CSV import, alias approvals (the flywheel made visible),
   territory assignment, analytics.
3. **Eval harness** — per-stage metrics, WER vs field-accuracy, calibration
   curve. Blocked on the labelled clips, which is a human task, not a coding
   one.

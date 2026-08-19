# Coding updates

Running log of what has been built, and — more usefully — the decisions and
surprises behind it. Newest first.

---

## Status

| | |
|---|---|
| **Tests** | **399 passing** (~0.9 s; 31 need Docker and skip without it) |
| **Pipeline** | complete, stages 1–6, verified on live Groq |
| **API + worker** | complete, runnable |
| **Clarification** | complete, incl. the late-answer edge case |
| **Admin** | catalogue import, alias approvals, reps, analytics |
| **Eval harness** | complete — **blocked on labelled clips, not on code** |
| **Frontend** | not started, by instruction |

```bash
cd backend
npm test            # 299 tests, no network, no API key
npm run typecheck
npm run lint
```

---

## 2026-08-19 — Clarification, admin surfaces, analytics, eval harness

The backend is complete. Everything from the original plan is built, tested
and exercised against the live API key.

### Clarification

Flagged fields become one-tap Bangla questions. Never a re-recording: by the
time a prompt lands the rep is between outlets, and asking him to record again
means he never answers.

Each prompt schedules its **own** BullMQ delayed job at creation. That is why
there is no sweeper anywhere in this codebase — a prompt cannot pile up
unresolved, because its resolution was scheduled the moment it existed.

The edge case worth naming: an answer arriving **after** auto-resolution still
applies and re-emits. The record had already been confirmed with a guess and
pushed to a dashboard; discarding the correction as stale would leave a known
wrong value on a manager's screen. Covered by an integration test.

A question with fewer than two options is not asked at all. That is not a
question, and it belongs in HQ review instead.

### Catalogue import

A hand-written CSV reader rather than a dependency, because the failure modes
here are specific and each one corrupts master data *silently*: Bangla names
with commas inside quotes, Excel's UTF-8 BOM, CRLF endings.

Rows are validated individually and bad ones reported. A 2,000-row outlet
master with three malformed rows imports 1,997 and tells you about the three —
rejecting the file would be worse.

### Alias approvals — the learning loop

Uncertain matches are harvested as surface forms with an occurrence count. An
admin approves once and the resolver stops being uncertain about that word,
permanently, for every rep in the company.

Approval can **override** the suggestion, which is the entire point of putting
a human here: they can say "that word means this OTHER product", which no
amount of phonetic similarity would ever find.

**Known limitation, worth stating plainly.** A form that matches *nothing*
produces no annotation at all, so it can never become a candidate — and that is
exactly the case where an alias would help most (`ভিল` for Wheel, from the
earlier live run). Catching those needs stage 3 to emit sub-threshold
near-misses, which changes its output contract. Deliberately not done under
deadline; recorded here rather than quietly left.

### Analytics

Share of voice counts distinct **outlets** alongside raw mentions — one
talkative rep repeating himself is not a market movement. Plus the stock-out
grid, price erosion, rep coverage and type breakdown.

Records awaiting clarification are included on purpose. "12 shops, 3
unconfirmed" is useful; silently dropping uncertain data makes the numbers
quietly wrong, which is worse than showing them with a caveat.

### Eval harness

**Not a test.** Tests are deterministic and gate every commit; this is
stochastic, costs money, and produces metrics. Conflating the two produces a
flaky CI that eventually gets switched off.

Reports WER beside field accuracy — *the gap is the argument* — per-field
precision and recall separating `wrong` from `spurious`, a calibration diagram
with ECE, and gate effectiveness (flag N% of fields, catch M% of errors). Fails
the run on a >2pp accuracy regression, so a prompt change cannot quietly make
things worse.

It runs today and produces nothing, because there are no labelled clips. That
is the honest state: **the harness is blocked on data collection, not on code.**

### Two real bugs found by running it

**Router-wide auth leak.** `app.use("/api", ingestRoutes)` meant that router's
`repAuth` guard also ran for `/api/admin/*`, so every admin request 401'd
before the admin router was ever reached. The symptom looked like a bad token.
Auth is now attached per-route rather than depending on mount ordering.

**Silently skipped integration tests.** `describe.skipIf` is evaluated during
collection, *before* `beforeAll` runs, so the Mongo availability probe always
read `false` and all 31 integration tests reported as skipped while looking
perfectly green. Probe moved to module scope. Worth remembering — a suite that
skips is far more dangerous than one that fails.

### Verified live against the API key

    CSV import       4 rows parsed, 3 imported, 1 malformed row reported
    Bangla outlets   "নিউ মার্কেট স্টোর, ঢাকা" imported with the comma intact
    Auth boundary    rep token on an admin route -> 401
    Clarification    "কোন দোকান?" with 3 ranked options -> answered ->
                     confidence 1, flag cleared, status confirmed
    Analytics        all six endpoints returning real aggregates

---

## 2026-08-17 — First live run against real providers

Ran the stack with real Groq keys and real speech audio (macOS Hindi TTS
reading the reference sentence in Devanagari — not Bangla field audio, but
real speech, which is what was needed to exercise the adapter contract).

Whisper returned, verbatim:

    বজোই স্তোর মে প্রান মাঙ্গো জুস দের দর্জন লগেগা ঔর ভিল কা নযা আফ্যর দিযা হে পাঁচ তকা কম

Corrupted in exactly the ways the design predicts: বজোই for বিজয়, স্তোর for
স্টোর, প্রান for প্রাণ, তকা for টাকা.

**The thesis held.** `প্রান মাঙ্গো জুস` resolved to SKU-404 at 0.98 with a
0.39 margin, on genuinely wrong ASR output. That is the whole argument,
demonstrated outside the fixtures.

### Four things only a live run could find

**Groq's model catalogue moved.** `llama-3.3-70b-versatile` no longer exists.
Now on `openai/gpt-oss-120b`.

**Strict JSON-schema mode rejected our schema three ways.** Documented in
`adapters/llm/json-schema.ts`, all found by calling the API rather than reading
a spec. The third is the nasty one: with `anyOf: [{enum}, {type:"null"}]` the
API accepts the schema, the model generates *perfectly valid* output, and then
the API's own validator rejects its own generation. Null has to be folded into
the type array AND the enum list.

**A real bug in stage 4.** Whisper heard "বজোই স্তোর", which scored 0.72
against Bijoy Store — a good match for a heavily corrupted name. The hard gate
at 0.85 discarded that signal *entirely* and fell back to proximity, ranking
the nearer Rahman Store first. Observations were being attributed to the wrong
shop while the system held good evidence it had chosen to ignore.

Replaced with a ramp: name influence now scales with match quality between a
noise floor (0.45) and full confidence (0.85). Bijoy now ranks first at 0.793
against Rahman's 0.604, despite being five metres further away. Four
regression tests added.

**দর্জন.** The Hindi/Urdu-influenced form of ডজন, genuinely used in
Bangladesh, sits at 0.75 phonetic similarity — below the fuzzy floor. Without
it, "দের দর্জন" parsed as **1.5 instead of 18**: a wrong but entirely
plausible number, which is the most expensive failure this system can produce.
Now listed explicitly.

### Honest limitations of this run

`ভিল` (Whisper's rendering of the Hindi "व्हील") did not resolve to Wheel —
0.50 similarity, correctly below threshold. Real Bangla হুইল matches at 1.00
and is covered by tests. This is a TTS artifact, not a system fault, and
lowering the threshold to catch it would buy false positives. The consequence
was visible though: the competitor observation was lost and the model folded
the −5 price delta onto the PRAN product instead, mislabelling the whole thing
`price_change`.

**That is the argument for real field audio, not a reason to tune thresholds.**
Nothing here substitutes for the 100 labelled clips.

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

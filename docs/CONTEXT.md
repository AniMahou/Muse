# Context — read this first

Handoff for a fresh session. Enough to resume without re-deriving anything.

**Repo:** `github.com/AniMahou/Muse` · **Branch:** `main`
**Local:** `~/Documents/WEB DEVELOPMENT/hackathons/Muse`

---

## 1 · What this is

Bangla voice → structured field intelligence for FMCG sales reps in Bangladesh.
A rep speaks 15 seconds into a phone; the system produces validated,
confidence-scored observations — outlet, product, quantity, price move,
stock-out — for a brand manager's console.

**The thesis, and the reason every design decision looks the way it does:**

> Bangla ASR gets most words wrong on real field audio. The transcript does not
> need to be right. The **fields** need to be right.

Accuracy is recovered by a deterministic layer — a Bangla quantity grammar and
closed-catalogue phonetic matching — not by a better acoustic model. The LLM
only does segmentation and semantics, constrained per-clip to candidates the
resolvers actually produced.

**There was an Intelligent Machines presentation on 30 Aug. It was cancelled.**
The project is now in "make it industry-grade" mode, not demo mode.

For depth: [JOURNEY.md](JOURNEY.md) is the full engineering narrative with every
concept explained. [KNOWLEDGE.md](KNOWLEDGE.md) is the technical defence.

---

## 2 · Current state

| | |
|---|---|
| Code | ~15,000 LOC TS + ~1,000 Python |
| Tests | **455**, full suite <2s, no network |
| Voice data | **120 clips** across 65 cards, 2 speakers |
| Labels | 120 built · 110 with script-derived transcripts, 10 without |
| Catalogue | 25 SKUs + 7 competitors + 19 outlets |
| Last measured | WER **72.5%**, field accuracy **59.1%** (20 clips, pre-expansion) |
| OCR recogniser | trained — **99.5% exact, CER 0.001** on *synthetic* validation |
| Fonts | **137** in `ml/fonts/` (was 10) |

### ⚠️ In flight right now

An eval run was launched on the expanded dev split (~100 clips) and had **not
finished** when the previous session ended:

```bash
cd backend && npm run eval -- --split dev --no-cache
```

Check `backend/eval/report/<today>.md`. The 59.1% figure above is from the old
20-clip set and **will change**. Re-run if the log looks incomplete.

---

## 3 · Layout

```
Muse/
├── shared/           Zod contracts, imported by both sides
├── backend/
│   ├── src/pipeline/ stages 01-06, ports/, orchestrator
│   ├── src/alerts/   corroboration rule + service + rep impact
│   ├── eval/         metrics, runner, report — NOT tests
│   ├── datasets/     clips/ labels/ raw/ CRIB.md split.json
│   └── scripts/      see §5
├── frontend/         React PWA (rep) + console (admin)
├── ml/               Python: synthetic OCR data + CRNN training
│   ├── synth/        shape.py fonts.py corpus.py augment.py generate.py
│   ├── ocr/          charset.py model.py data.py decode.py train.py
│   ├── fonts/        137 Bangla faces (gitignored)
│   └── .venv/        python3 -m venv .venv && pip install -r requirements.txt
└── docs/             this file, JOURNEY, KNOWLEDGE, PILOT, DEMO, jarif, CARDS*
```

---

## 4 · The pipeline

```
voice ──┐
        ├─→ ① EXTRACT ─→ ②③④ ANNOTATE ─→ ⑤ ASSEMBLE ─→ ⑥ CONFIDENCE
photo ──┘     [API]        (parallel)       [API]      (deterministic)
```

**Two invariants — do not violate:**

1. **Stages annotate; they never rewrite the transcript.** Annotations carry
   character spans back into the original. A stage that rewrote `দের ডজন` → `18`
   and got it wrong would destroy the evidence stage 6 needs.
2. **Stages 2, 3, 4 are independent** and run concurrently. An unknown product
   cannot damage outlet or quantity extraction — verified empirically.

| stage | key point |
|---|---|
| 01 extract | voice→ASR, photo→OCR. The only divergence point. Also builds the **decode-time bias prompt**. |
| 02 numerals | দেড়=1.5 আড়াই=2.5 সাড়ে=+0.5 সোয়া=+0.25 **পৌনে=−0.25** ডজন=×12 হালি=×4 |
| 03 sku | phonetic key space; Latin folds in; three routes with caps (name, brand 0.85, mfr 0.70) |
| 04 outlet | GPS radius + spoken name on a **ramp, not a gate** |
| 05 assemble | response schema **rebuilt per clip**; identity fields are enums of resolver candidates |
| 06 confidence | `asr_conf(span) × margin × grammar_hit`. Derived, never self-reported. Saves always, sets status. |

**Alert layer** (`src/alerts/`): an alert is **corroboration**, not an event —
≥3 *distinct outlets* on the same `(kind,key)` within 24h. One open alert per
key; later outlets join it. `acknowledgedAt − raisedAt` is the operational
metric the pilot would be scored on.

---

## 5 · Commands

```bash
npm run dev:infra          # Mongo 27018 + Redis 6380 (needs Docker running)
npm run dev                # api + worker + web
```

From `backend/`:

| | |
|---|---|
| `npm test` | 455 tests, no network |
| `npm run demo:reset` | rebuild the demo tenant — **run before any demo** |
| `npm run crib` | regenerate `datasets/CRIB.md` from seed-data |
| `npm run catalog:export` | write `ml/data/catalog.json` for the ML tooling |
| `npm run mic` | record clips interactively |
| `npm run collect -- <dir> [--shift]` | ingest a folder; `--shift` keeps both speakers on name clash |
| `npm run clips` | audit audio — length, **peak loudness**, missing cards |
| `npm run labels:scaffold` | add a CSV row per recording |
| `npm run transcribe [-- --from-cards]` | type transcripts, or reuse the read script |
| `npm run labels:check` / `labels:build` | validate / write `datasets/labels/*.json` |
| `npm run split` | show the frozen held-out set |
| `npm run eval -- --split dev --no-cache` | the evaluation |

From `ml/` (use `./.venv/bin/python`):

```bash
python -m synth.fonts                                   # list usable Bengali faces
python -m synth.generate --count 50000 --out data/synth # ~320 samples/sec
python -m ocr.train --data data/synth --epochs 12
```

**Login:** owner `demo@muse.test` / `demo12345` · rep `rahim@muse.test` / same.
`demo:reset` recreates accounts, so it **signs you out** — log in again after.

---

## 6 · Hard-won findings — do not re-derive

**Unicode composition exclusion.** ড় ঢ় য় are each TWO code points (base +
nukta U+09BC) and NFC will **never** compose them. A per-character walk read ড়
as /d/ when it is /r/, corrupting আড়াই. Folded before anything walks the string.
`common/bangla-phonetic.ts`.

**Strict vs lenient similarity are different tools.** সতেরো (17) and স্টোরে
("at the store") share the consonant skeleton `s-t-r` exactly. Numerals use
`phoneticKeySimilarity` (vowels kept); names use `phoneticSimilarity`.

**Latin must fold into the same space.** Catalogues are English, reps speak
Bangla. Initial `wh` → `hu` or Wheel never matches হুইল.

**Outlet matching is a ramp, not a gate.** A hard 0.85 threshold discarded a
good 0.72 match and attributed observations to the wrong shop.

**ASR biasing works, but only in Bengali script.** Measured **WER −8.0, field
accuracy +8.4**. A Latin prompt moved সার্ফেক্সেলে → সার্ফ একসেলে; the Bangla form
recovered সার্ফ এক্সেলে exactly. So the **alias table leads the prompt** — every
approved alias now improves the resolver *and* the transcript feeding it.

**Prompt budget is UTF-8 BYTES, not characters.** Bengali is 3 bytes/char; a
525-char list is 1123 bytes and Groq's limit is 896. Every request 400'd.

**`--no-cache` used to be a lie.** Parsed, written into the snapshot as
`cacheDisabled`, never applied — so three A/B runs compared a change with itself
and returned identical WER. Fixed via `buildContainer(db, {cacheEnabled})`.

**A partial run must not become a baseline.** A rate-limited run wrote a
snapshot from 3 surviving clips; the next full run reported a false REGRESSION.
Only complete dev runs write snapshots now.

**Bengali needs real text shaping.** Pillow's basic layout renders two-part
matras (ো, ৌ) as detached dotted circles. `ml/synth/shape.py` does HarfBuzz
(GSUB/GPOS) → FreeType explicitly, not via Raqm, which is missing from most wheels.

**Font support cannot be detected by rendering.** FreeType draws `.notdef` boxes
for missing glyphs — probing that way reported 324 Bengali fonts on a machine
with 10, Wingdings included. `ml/synth/fonts.py` reads the cmap.

**CTC loss has no MPS kernel.** Computed on CPU while conv+LSTM stay on GPU,
explicitly rather than via `PYTORCH_ENABLE_MPS_FALLBACK`.

**Port collision.** Mongo **27018**, Redis **6380** — 27017 is taken by another
project on this machine.

---

## 7 · The data, and how it got here

**Round 1 (Tabib):** 20 clips, cards 1–20, one speaker, read from `docs/CARDS.md`
in a quiet room.

**Round 2 (Jarif):** 100 clips, delivered as a zip via Discord.

Three things about round 2 that a future session must know:

1. **Clips 01–35 are our cards** (`CARDS.md` 1–25, `jarif.md` 26–35);
   **clips 36–65 are his** (`CARDS-2.md`). Cards 36–45 existed in both — this was
   settled by running the audio through Whisper, not by guessing.
2. **He wrote his cards against a completely different catalogue** — real
   Bangladeshi brands (Ispahani, Radhuni, Parachute, Mojo, Cocola…) and 15 new
   shops. Rather than discard 100 clips, the catalogue was **expanded** to
   include them. This is an improvement: 13 SKUs was toy-sized, and the new set
   brings genuine near-neighbours (three noodle brands, two teas, two toothpastes).
3. **All 120 clip filenames collided** (both used `clip-NN-a`). `npm run collect
   -- <dir> --shift` moves the incoming clip to the next free take letter, so
   both speakers survive. `clip-01-a` is Tabib, `clip-01-b` is Jarif.

**Transcripts:** 110 of 120 are `reference=script` — reused from the card the
speaker read, which **over-estimates WER** because any fumble counts as a machine
error. The report prints a warning block saying so. Cards 26–35 were spontaneous
(no script) so those 10 have **no transcript** and are excluded from WER only;
field accuracy is unaffected because it scores against expected observations.

**Held-out split** (`datasets/split.json`): cards **02 03 04 08 13 19** are test,
frozen, never tuned against. Assignment is **by card, not clip**, so two takes of
one sentence cannot straddle the split. New cards (21–65) default to dev. The
tool refuses to redraw. `npm run eval` defaults to `--split dev`.

---

## 8 · What is real vs simulated

| real | simulated / absent |
|---|---|
| Voice → live Groq Whisper → full pipeline | **Photo path still returns canned text** — the trained model is NOT wired in |
| All 6 stages, alerts, clarification, alias learning | No measured OCR accuracy on real photos |
| Analytics, CSV import, auth, demo reset | No customer, no pilot, no users |
| ASR biasing (measured) | |
| CRNN recogniser (trained, synthetic-validated) | |

---

## 9 · Next tasks, in order

**1 · Finish the eval that is in flight** and record the new numbers. Field
accuracy on 120 clips with a 32-SKU catalogue is the first figure with a
defensible sample behind it.

**2 · Regenerate the OCR corpus with 137 fonts and retrain.** The current model
saw 10 faces from 3 families. This is a one-command rerun and the tenth font is
worth more than the ten-thousandth sample:

```bash
cd backend && npm run catalog:export
cd ../ml && ./.venv/bin/python -m synth.generate --count 50000 --out data/synth
./.venv/bin/python -m ocr.train --data data/synth --epochs 12
```

**3 · Wire the recogniser into the product.** Write a real `IOcrProvider` that
loads `ml/checkpoints/recogniser.pt`, runs `ocr/decode.py:greedy`, and returns a
`Transcript` with per-word confidence and character spans. Then delete
`adapters/ocr/mock.adapter.ts`. **Per-token confidence is not optional** —
stage 6 reads `Transcript.words[].conf`, and an adapter returning bare text would
flatten that term to a constant and silently stop flagging from discriminating.

**4 · Numeral corruption model.** `priceDelta` scored 0/4 because দাস→দশ measures
0.667 against a 0.85 fuzzy threshold. Training pairs can be **generated** from
the phonetic confusion patterns already encoded — no field data needed.

**5 · Segmentation.** Multi-observation clips lose observations (clips 17, 19, 20
in round 1). Now measurable across 40 multi-observation clips.

**6 · Learned confidence model.** Replace `asr_conf × margin × grammar_hit` with
a calibrated classifier over features already computed. Was blocked at ~100
labelled fields; **120 clips × 93 observations may now be enough** — check after
task 1.

**Still blocked on data:** real photographs (~150) for an OCR test set and for
detection fine-tuning. Deliberately paused — see [jarif.md](jarif.md) for the
collection brief.

---

## 10 · Working conventions

- Zod owns every contract; `z.infer` for types, never hand-written duplicates.
- `pipeline/` imports only from `ports/` — eslint `no-restricted-imports`.
- Amber (`#F59E0B`), never red, for uncertainty. A flagged field is honesty.
- Confidence and margin are **opposite scales** — margin 0.3 is already decisive.
- Bangla text needs ~15–20% larger type than Latin; load Hind Siliguri or it
  falls back to Devanagari.
- **Commits are authored as the user.** No AI co-author trailers — this was asked
  for explicitly.
- Work happens in a git worktree; `main` is the integration branch. Audio and
  fonts are gitignored and travel by Drive, not git.

---

## 11 · The instinct worth keeping

Almost every expensive failure in this project produced a **plausible number**
rather than a crash: a cached transcript that made an A/B compare a change with
itself, a baseline drawn from three surviving clips, a calibration curve paired
against the wrong row, a font check that found 324 Bengali fonts on a machine
with ten, rendering that looked like Bengali and was not.

Which is why so much of the system exists to make wrongness **visible** —
confidence derived from evidence rather than self-reported, provenance recorded
on every derived number, a held-out set that refuses to be redrawn, a report that
prints "not measured" instead of a zero, fixtures labelled as fixtures.

When adding to this codebase, keep asking: *how would I know if this were wrong?*

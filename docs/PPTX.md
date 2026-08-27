# Presentation plan — IM officers

**Format:** ~14 slides, 10 minutes of talking, 5 minutes of live demo, then Q&A.
The demo sits in the *middle*, not at the end — you want them watching software
work before they start reasoning about whether it could.

**What this room is deciding:** whether to introduce you to a customer. Not
whether the tech is clever. Every slide should serve *"can we put this in front
of a client without it embarrassing us."*

Companion files: [DEMO.md](DEMO.md) for the runbook, [KNOWLEDGE.md](KNOWLEDGE.md)
for the engineering answers, [PILOT.md](PILOT.md) for the ask.

---

## Before you walk in

- [ ] `npm run dev:infra` → `cd backend && npm run demo:reset` → `npm run dev`
- [ ] **Log in again** — reset signs you out
- [ ] Two browser tabs open: console on **Today**, field app on **Record**
- [ ] Phone or laptop mic tested once, at the distance you will actually use
- [ ] `.env` has `ASR_PROVIDER=groq` — and you know the fake-provider fallback
- [ ] Zoom the browser to ~110% so the back row can read the field labels

---

## The deck

### 1 · Title

**Muse — Bangla voice becomes field intelligence.**
Your name, IUT, the date. Nothing else. Say the one-liner over it:

> "A rep speaks fifteen seconds of Bangla. Speech recognition gets most of the
> words wrong, and we still get the shop, the product and the quantity right."

### 2 · The problem — 60 seconds, no product yet

FMCG field forces visit 30–50 outlets a day. Their SFA app captures **the
order**. It captures **the reason for nothing**.

> "A rep in Mirpur sees a competitor promo in twelve shops on a Tuesday. The
> brand manager finds out in October, from a sales dip. Typing three sentences
> of context at forty outlets a day is impossible, so nobody does it — and the
> most valuable data in the field dies on the road."

**Do not show the product yet.** Let the problem sit.

### 3 · Why nobody has solved it

A table, because this is the "why doesn't X already do this" slide:

| | captures | misses |
|---|---|---|
| SFA / DMS apps | orders, GPS check-in | every unstructured observation |
| Retail audits (Nielsen) | rigorous, comparable | **sample-based, monthly** |
| WhatsApp groups | photos, ad-hoc text | unsearchable, dies in scroll |
| More reps | more visits | same capture problem, multiplied |
| Otter / Google STT | a transcript | no SKU resolution, no confidence, no Bangla numerals |

> "A transcript is not data."

### 4 · The technical problem, honestly

> "Published Bengali ASR benchmarks say 3–5% word error rate. Those are clean,
> read, studio recordings with everyday vocabulary. Our words are brand names
> and shop names no general model has ever seen."

Then the inversion, as one line on the slide:

> **The transcript does not need to be right. The fields need to be right.**

### 5 · How — the pipeline diagram

The six stages. Spend your time on **three points only**:

1. Stages 2, 3, 4 run **in parallel** and only **annotate** — they never rewrite
   the transcript, so the evidence survives for confidence scoring.
2. The LLM's schema is **rebuilt per clip**, with product fields as enums of what
   the resolver actually found.
3. Confidence is **derived**, never self-reported.

### 6 · The worked example — your strongest slide

Left: the corrupted ASR output. Right: the structured rows.

```
heard:  বিজেয় স্টোরে প্রান্মেহিঙ্গ জুজ দের ডাজন লাগবে
        আর ঵িলে নুখ্তুন অফার দিশে পাছ ডাগা কাম
```

```json
[{ "type":"demand_signal", "outlet":"OUT-1182",
   "sku":"SKU-404", "quantity":18, "unit":"piece" },
 { "type":"competitor_promo", "outlet":"OUT-1182",
   "competitor":"COMP-WHEEL", "priceDelta":-5 }]
```

> "That transcript is close to unreadable. দের ডাজন isn't even spelled right —
> and it resolves to eighteen, because দেড় is one and a half and ডজন is twelve.
> One recording, two unrelated observations, a shop resolved from GPS plus a
> spoken name, a product matched against a closed catalogue."

**This is a real trace from our evaluation.** Say so.

### 7 · Why a hallucinated product is impossible

One code block:

```ts
skuId: z.enum(["SKU-404", "SKU-407"]).nullable()  // built from THIS clip's candidates
```

> "The model never identifies anything. Its response schema is rebuilt per
> recording with the product field restricted to exactly what the resolvers
> found. An unresolvable product is *inexpressible*, not discouraged. The same
> Zod object generates the validator and the model's schema, so they cannot
> drift."

### 8 · 🔴 LIVE DEMO — 5 minutes

Follow [DEMO.md](DEMO.md). Sequence:

1. **Console → Today.** A week of real activity.
2. **Field app → record 15s of Bangla.** While it processes (5–15s), explain
   IndexedDB-first upload — *never* watch a spinner in silence.
3. **Back to Today.** It appears live. Point at the resolved fields.
4. **Review.** One flagged record, transcript shaded by confidence.
   > "Low confidence never discards data. It sets a status."
5. **The alert.** Three outlets, same promo. Click **Acknowledge**, watch median
   response move.
6. **Field app → My Day.** What the rep's reports became.

**If the recording is slow:** keep talking, then say *"that one's still in the
queue — here's one from this morning"* and use seeded data. Never reload in
front of them.

### 9 · The alert is the product

> "One rep reporting a competitor promo is an anecdote — he might have misheard.
> Three shops independently inside a day is a campaign. Muse only interrupts a
> human for the second one."

Then the line that matters to a pilot:

> "We don't fix the stock-out — that's the distributor's job. We compress how
> long it takes anyone to *know*. Both ends of that clock are inside the system,
> which is why it's something a pilot can be scored on."

### 10 · What we measured — and its limits

| | |
|---|---|
| Field accuracy | **52.6%** |
| Character error rate | **28.5%** |
| Word error rate | 77.8% *(over-estimated)* |
| Calibration error | 0.076 |
| Deterministic layer | **38 ms** of a 2.4 s pipeline |

**Lead with the caveat. Do not let them find it.**

> "Twenty clips, one speaker, read from a script in a quiet room. The word error
> rate is an over-estimate because the reference is that script, not an
> independent transcription — our own harness marks it as such and refuses to
> print it as a real measurement. It's a thin set and I'm not presenting it as
> more than it is."

Then the point:

> "Word-level accuracy is about 22%. Field accuracy is 52.6%. We recover more
> than twice as many structured fields as words. That gap is the whole argument,
> and it's why we're improving the resolver rather than shopping for a better
> acoustic model."

Finish with the roadmap line — **this is where the WER story goes**:

> "Next: a labelled set from real outlets, a learned confidence model on data we
> already compute, and n-gram shallow fusion biasing the recogniser toward the
> customer's own catalogue. That last one attacks the proper-noun failure
> directly."

### 11 · What is real and what is not

A two-column slide. **Volunteering this is the highest-credibility move in the deck.**

| Real | Simulated / absent |
|---|---|
| Voice → live Groq Whisper → full pipeline | **Handwriting OCR — canned, labelled in the UI** |
| All six stages, both modalities | No measured accuracy on real field audio |
| Confidence, clarification, alias learning | No customer, no pilot, no users |
| Alerts, analytics, CSV import, auth, 449 tests | |

> "The handwriting reading is simulated and the product says so on screen. What
> isn't simulated is everything after it — that photo goes through the same
> grammar, the same resolver, the same confidence gate. Swapping in real OCR is
> one file. And the honest version of the next step is printed shelf tags and
> promo signage, not handwriting: printed text is tractable today, and a
> photographed price tag is *evidence* where a spoken claim is not."

### 12 · The moat

> "Today this is a feature with a hard technical moat, not yet a platform — and
> I'd rather say that than pretend."

Three things:
1. **The Bangla resolution layer** — a constructed phonetic space, not fuzzy
   matching. Nukta composition-exclusion, শ/ষ/স collapse, সতেরো vs স্টোরে.
2. **Alias learning that compounds** — after six months it knows how *their* reps
   say *their* products. A switching cost the customer builds for themselves.
3. **Constrained decoding** — what makes it safe to connect to master data.

### 13 · The ask — [PILOT.md](PILOT.md)

> "One distributor. One territory. Thirty reps. Ninety days. Free."

**What we need:** three CSVs (SKU master, outlet master, rep roster), one
field-ops champion, two hours of rep training.

**Scored on:** rep daily-active ≥60%, median time-to-acknowledge <24h,
count of competitor promos your existing reporting never caught.

**What would make us stop** — say all three out loud:
- rep daily-active below 40% at week 6 → the adoption model is wrong
- median response above 72h at week 8 → we built an archive, not an alert
- fewer than ten genuinely new findings by week 8 → you already knew everything

> "We'd rather have a clear negative in ninety days than an ambiguous maybe in a
> year."

**And the security answer, unprompted:** the speech model can run entirely inside
their infrastructure. No audio, no outlet coverage, no SKU master leaves their
network. Already built.

### 14 · Close

> "Fifteen seconds of voice becomes data a brand manager can act on the same day.
> The technology is built and tested. What it doesn't have yet is evidence from a
> real field force — and that's exactly what I'm asking for."

---

## Q&A — the five that decide the room

**"Where's the AI? That's two API calls and string matching."**
> "Two model calls, deliberately. A language model handed a 78%-wrong transcript
> produces a plausible wrong answer with high confidence — that's the failure
> that makes it undeployable. So the model never identifies anything; its schema
> is rebuilt per clip from resolver output, which makes an unresolvable product
> inexpressible. And confidence comes from evidence, never from asking the model.
> I'd rather have two calls I can defend than six I can't."

**"What stops us building this in three weeks?"**
> "Nothing stops you building the pipeline — you'd have it in three weeks and it
> would be about 70% right. The last 30% is unglamorous: পৌনে subtracts; ড় is two
> code points and NFC will never compose them, so a naive walk reads /r/ as /d/
> and corrupts আড়াই; সতেরো and স্টোরে share a consonant skeleton so one similarity
> function had to become two. None of that is in a paper. It's a data-collection
> cost more than an engineering one."

**"What happens when Google ships Bangla ASR at 5%?"**
> "It makes us better, not obsolete. Our value isn't transcription, it's
> resolution. Even with a perfect transcript you still have to map 'PRAN mango
> juice' to one SKU out of two thousand, decide whether দেড় ডজন is 18 or 1.5,
> know which of three shops within twenty metres he's standing in, and decide
> whether you're confident enough to put it on a dashboard. Better ASR raises our
> floor — the architecture doesn't change."

**"Labour is cheap here. Why not hire three more people?"**
> "You're right that this can't be a labour-replacement pitch — a rep costs
> twelve to twenty thousand taka a month. This is revenue protection. Three more
> people still can't correlate complaints across a region, still can't tell you on
> Tuesday that a competitor promo started in twelve shops, and still won't type
> context at forty outlets a day. We're not capturing data more cheaply. We're
> capturing data that currently doesn't exist at any price."

**"The handwriting is fake. Why trust anything else?"**
> "Because we labelled it rather than hid it — it says simulated on the capture
> screen, on every result, and in the analytics. And the mock is only the reading
> step; the photo runs through the same grammar, resolver and confidence gate as
> speech. We built it that way so swapping in a real model is one file, and in the
> meantime it proves the pipeline is genuinely modality-agnostic."

### If you get stuck

- **You don't know:** *"I don't know. I'd have to measure it."* Then stop.
- **They're right:** *"That's fair, and I hadn't considered it."* Concede cleanly.
- **Hostile framing:** answer the technical content, ignore the framing.
- **Past where you've built:** *"That's beyond what we've built. Here's how I'd
  approach it —"* then **one** sentence, not five.

### Ask them something

If the floor opens, having a question ready changes the dynamic from examination
to conversation:

- "Where have you seen field-data capture fail before? I'd rather know the
  failure mode than guess at it."
- "Selling into an account you already have — what's the first objection you'd
  expect from their field operations head?"
- "Is the licensed-component path more realistic here than a standalone product?"

---

## Timing

| | |
|---|---|
| Slides 1–7 | 5 min |
| **Live demo** | 5 min |
| Slides 9–14 | 5 min |
| Q&A | the rest |

If you are running long, **cut slide 3 and slide 12** — the alternatives table
and the moat. Never cut the demo, the measurement caveat, or the ask.

# Muse — deck plan v2

Full specification for the slide deck. Light theme, ~22 slides, 9–11 minutes
plus demo. Built for BrainChild 2.0 and the Intelligent Machines workshop.

**Companion file:** `SPEECH.md` — what to actually say, slide by slide.

---

## 0. Data integrity — read before building

Judges at a technical fest test numbers. One unverifiable figure makes them
doubt the real ones. Every statistic below is tagged:

- **[VERIFIED]** — external source, cite it on the slide
- **[MEASURED]** — we measured it in our own system
- **[MODELLED]** — arithmetic from stated assumptions; **show the working**

Never present a **[MODELLED]** figure as fact. Say *"on these assumptions"*
out loud. A judge who can check your arithmetic trusts you more than one who
is handed a confident round number.

### The verified set

| Figure | Source |
|---|---|
| Bangladesh FMCG market ≈ **$4B**, ~10% CAGR over the last decade | The Business Standard / FICCI |
| **97%** of Bangladesh FMCG trade is traditional — small shops, rural outlets | The Business Standard / FICCI |
| Global average retail out-of-stock rate ≈ **8.3%**; world-class is ≤3–4% | IHL Group / NIQ |
| **58%** of shoppers who hit a stock-out become a *lost sale* | Zebra Global Shopper Study |
| CPG loses ≈ **$130B/year** globally to out-of-stocks | IHL Group |
| Global retail inventory distortion ≈ **$1.73T**, of which **$1.2T** is out-of-stocks | IHL Group |
| Bengali ASR: ~3–5% WER on clean read benchmarks, **~34% on real long-form audio** | FLEURS / Common Voice / Bengali long-form evaluations |

### The measured set — ours

| Figure | Where it comes from |
|---|---|
| **412** automated tests, full suite in under 1 second | `npm test` |
| Real ASR output `প্রান মাঙ্গো জুস` → **SKU-404 at 0.98**, margin 0.39 | live Groq run, in the repo traces |
| Stage latency: extraction ~450–1250 ms, annotate **~40 ms**, assembly ~1.9 s | console → Intelligence → Stage latency |
| Deterministic layer (grammar + resolvers + confidence) is **~40 ms of a ~2.4 s pipeline** | same |
| Adding a whole second input modality touched **4 files** | git history |

**Do not invent:** total retail outlet count in Bangladesh, FMCG field-force
headcount, SFA adoption %, or retail-audit pricing. I could not verify any of
them from a primary source.

---

## 1. The money slide — build the model on stage

This is what "how much are we saving" should look like. It is **[MODELLED]**,
and its credibility comes from showing every step.

### Assumptions, stated on the slide

```
A mid-size Bangladeshi FMCG brand
  covered outlets                     10,000
  average monthly sell-through/outlet   ৳25,000
  annual revenue through those outlets  ৳3,000,000,000   (~$25M)
```

### The arithmetic

```
Out-of-stock rate (global avg)                    8.3%   [VERIFIED]
Share of stock-outs that become lost sales        58%    [VERIFIED]
                                                  ─────
Revenue lost to stock-outs        8.3% × 58%  =   4.8%

4.8% of ৳3.0B                                =   ৳144,000,000 / year
```

### The lever

Muse does not eliminate stock-outs. It **compresses how long they last** —
from "discovered at the next audit" to "reported the same afternoon".

```
Conservative reduction in stock-out duration       20%
৳144M × 20%                                 =  ৳28,800,000 / year recovered

Cost of Muse   150 reps × ৳1,200/rep/month  =   ৳2,160,000 / year
                                                ─────────────
Return                                            ~13×
```

**Say this out loud:** *"That 20% is our assumption, not a measured result.
Everything else on this slide is sourced. If you halve it, it is still a
six-fold return."*

Halving it and saying so is far more persuasive than defending a big number.

### The second lever — do not try to price it

Competitive response speed. A rep sees a competitor promo on Tuesday; today
the brand manager learns from a sales dip weeks later. Muse makes that same-day.

Present the **mechanism**, not a figure — you cannot honestly price it without
customer data, and a judge will know that.

---

## 2. Why alternatives cannot do this

A full slide. This is the question that decides whether they believe you have
a business.

| Alternative | What it captures | What it misses |
|---|---|---|
| **SFA / DMS apps** (the incumbent) | orders, GPS check-in, route compliance | every unstructured observation — *why* a shop refused, what the competitor did, what the retailer complained about |
| **Retail audits** (Nielsen, Kantar) | rigorous, comparable, trusted | **sample-based and monthly** — you learn about last month, from some shops |
| **WhatsApp groups** | photos, ad-hoc text | unstructured, unsearchable, dies in scroll, no aggregation |
| **Hiring more reps** | more visits | the same capture problem, multiplied. Three more people still cannot correlate complaints across a region |
| **Generic voice-to-text** (Otter, Google) | a transcript | no SKU resolution, no confidence, no Bangla numeral grammar. A transcript is not data |

### Then the three-line moat

**1. The hard part is not the speech recognition.**
Anyone can call Whisper. The difficulty is that Bangla ASR returns ~34% word
error rate on real field audio, and turning that into correct structured data
needs a Bangla quantity grammar and closed-catalogue phonetic matching. That is
domain work, not an API key.

**2. The learning is customer-specific and compounding.**
Every correction an admin approves teaches the resolver *that company's*
vocabulary. After six months the system knows how their reps say their SKUs.
A competitor starting fresh starts that learning over.

**3. The architecture is what makes it deployable.**
Constrained decoding means a product that was never resolved is not
expressible. In an enterprise, a confidently wrong SKU is worse than no data —
this is the difference between a demo and something a brand will actually
connect to their master data.

---

## 3. Design system

Unchanged from v1 — reproduced here so the deck can be built from one file.

```
INK          #14161F   headlines
INK-SOFT     #4A4F5E   body
INK-MUTED    #8A90A0   captions, axis labels
PAPER        #FBFAF7   background — WARM off-white, never pure white
PAPER-RAISED #FFFFFF   cards
RULE         #E6E4DE   hairlines

INDIGO       #4F46E5   primary accent (same as the product)
VIOLET       #7C5CFF   gradient partner
CONFIDENT    #0E9F6E   confirmed
UNCERTAIN    #D97706   flagged — amber, NEVER red
CRITICAL     #DC2626   at most twice in the whole deck
```

- **Pure white glares under projection.** Use `#FBFAF7`.
- **One accent per slide.** Two accents means two slides.
- **Saturation = certainty**, carried through charts, screenshots and diagrams.
- **Bangla set 15–20% larger than Latin** — conjuncts carry more detail per
  glyph and vanish at Latin sizes. Hind Siliguri, embedded or outlined.

```
Display  Space Grotesk Bold    48–72pt
Heading  Space Grotesk Medium  28–36pt
Body     Inter Regular         18–22pt   never below 18
Bangla   Hind Siliguri         24–40pt
Mono     JetBrains Mono        16–18pt
Numbers  tabular figures       64–120pt

Canvas 1920×1080 · margins 120/90 · 12 cols · 8px baseline · radius 16
```

---

## 4. Slide-by-slide

Seven acts. **Problem before product, product before architecture, evidence
before business.** A deck that opens with technology loses the room.

| Act | Slides | Time |
|---|---|---|
| 1 · The loss | 1–4 | 1:30 |
| 2 · The insight | 5–7 | 1:15 |
| 3 · The product | 8–10 | 1:15 |
| — **LIVE DEMO** — | | 3:00 |
| 4 · The engineering | 11–15 | 2:15 |
| 5 · The evidence | 16–17 | 1:00 |
| 6 · The business | 18–20 | 1:45 |
| 7 · The future | 21–22 | 0:45 |

---

### 1 · Title
Centred, vast whitespace. `মিউজ` in Hind Siliguri 96pt, `MUSE` beneath in
Space Grotesk 40pt with 0.3em tracking, INDIGO. A single enormous waveform at
6% opacity bleeding off both edges.
**Build:** waveform draws L→R over 1.2s, then the wordmark fades up.

### 2 · The scene
Full-bleed photograph of a Dhaka grocery shop, INK overlay 55%, text
bottom-left.
> Tuesday, 11 a.m. Mirpur.
> A distribution rep sees a competitor's promo running in twelve shops.

**Transition in:** hard cut. Abruptness is the point.

### 3 · The loss ⭐
A horizontal timeline the full width of the slide.
```
Tuesday ●────────────────────────────────● October
   the rep knows                  the brand manager finds out
                    ↑ from a sales dip
```
`19 weeks` in INK-MUTED 20pt beneath.
**Build:** left dot → line draws *slowly* over 1.6s → right dot → "19 weeks".
The slowness is the message.

### 4 · Why it happens
Two columns, 6/6.

| What the SFA captures | What it doesn't |
|---|---|
| ✓ Order quantity | ✗ Why the shop refused |
| ✓ SKU code | ✗ What the competitor is doing |
| ✓ Outlet ID | ✗ Why stock isn't moving |
| ✓ Timestamp | ✗ What the retailer complained about |

Full-width beneath, INK 32pt:
> Typing three sentences across forty outlets a day is impossible. So nobody does.

Right column crosses in **INK-MUTED, not red** — this is a structural limit,
not a failure. **Build:** left column at once → pause 600ms → right staggered.

### 🔵 DIVIDER — "There is one thing a rep will always do."

### 5 · The insight
Centred, single statement, Space Grotesk 72pt.
> Fifteen seconds of voice is not impossible.

`voice` in INDIGO. Whole line fades as one unit — no stagger.

### 6 · But the language is the hard part
Chart left (7 cols), text right (5 cols).

**CHART 1 — horizontal bars.** [VERIFIED]
```
Bengali ASR, FLEURS benchmark          ███ 3.1%
Bengali ASR, Common Voice              ████ 5.5%
Bengali ASR, REAL long-form audio      ██████████████████████ ~34%
```
First two INK-MUTED; third CRITICAL — one of only two reds in the deck.
**Build:** top two grow → pause 800ms → third grows slowly, overshooting.

> Published benchmarks are read, clean, studio speech.
> Our user is in a market. Traffic. A ceiling fan. A shopkeeper talking over him.
> **We designed for 34%, not 3%.**

### 7 · The thesis ⭐ the most important slide
```
The transcript doesn't need to be right.      ← strikethrough animates across
The fields need to be right.                  ← INK 56pt, "fields" in INDIGO
```
Say it, then stop talking for two full seconds.

### 8 · What it looks like ⭐ real output
Three bands.

**Band 1 — actual Whisper output** (from the repo traces), Hind Siliguri 30pt:
```
বজোই স্তোর মে প্রান মাঙ্গো জুস দের দর্জন লগেগা ঔর ভিল কা নযা আফ্যর দিযা হে পাঁচ তকা কম
```
Highlight `বজোই` `স্তোর` `প্রান` `দের দর্জন` in UNCERTAIN amber, with the
correct form annotated beneath each in INK-MUTED 14pt.

**Band 2 —** large INDIGO downward arrow, animated.

**Band 3 —** PAPER-RAISED card:
```
OUTLET     Bijoy Store (OUT-1182)      ●  0.79
PRODUCT    PRAN Mango Juice 250ml      ●  0.98
QUANTITY   18 piece                    ●  0.85
                                  দেড় ডজন = 1.5 × 12
```
**Build:** transcript → errors highlight one by one (400ms apart) → arrow draws
→ card slides up → confidence dots fill last.

### 9 · Two surfaces
Phone screenshot left (tilted 3°), desktop console right, floating on PAPER
with deep shadows. Captions: *The rep · 15 seconds* / *The brand manager ·
Monday morning*.

### 10 · Two ways in, one pipeline
```
   🎙 voice ──┐
              ├──→ SAME grammar · resolver · assembly · confidence
   📷 photo ──┘
```
Small honest footnote: *photo text extraction is currently simulated;
everything after it is the production pipeline.*

**This slide sets up the demo. Go to the demo straight after it.**

---

## ▶ LIVE DEMO — 3 minutes (see `SPEECH.md` for the script)

---

### 🔵 DIVIDER — "How it survives a 34% error rate."

### 11 · The pipeline
Full-width horizontal flow.
```
 voice/photo → ① EXTRACT → ②③④ ANNOTATE → ⑤ ASSEMBLE → ⑥ CONFIDENCE → data
                  [API]      (parallel)      [API]     (deterministic)
                                 │
              ┌──────────────────┼──────────────────┐
        quantity grammar    SKU resolver      outlet resolver
```
Stages 1 and 5 in INK-MUTED marked `third-party API`; 2, 3, 4, 6 in **INDIGO**
marked `ours`. **Build:** left to right, 300ms apart — but 2/3/4 appear
*simultaneously*, making the parallelism visible without a word.

> Two API calls. Everything that makes it work is ours.

### 12 · The deterministic layer
Two cards.

**A — Bangla quantity grammar**
```
দেড়    1.5      ডজন   ×12
আড়াই  2.5      হালি  ×4
সাড়ে X X+0.5    কুড়ি  ×20
সোয়া X X+0.25
পৌনে X X−0.25   ← subtracts
```
`পৌনে` highlighted amber, callout: *"No general model gets this right."*

**B — phonetic collapse**
```
শ ষ স → s        ই ঈ → i
ণ ন   → n        ট ত → t
র ড় ঢ় → r        aspiration dropped

হইল  →  huil  ←  Wheel
```
That last line in INDIGO 32pt. It is the whole idea in one line.

### 13 · Hallucination is structurally impossible
```ts
// Rebuilt for EVERY clip
skuId: z.enum(["SKU-404", "SKU-407"]).nullable()
              ↑ produced by the resolver, this clip only
```
> A product that was never resolved is not expressible.
> **That is a constraint, not a prompt instruction.**

Your strongest differentiator against every "we told the LLM not to
hallucinate" project in the room.

### 14 · Confidence is derived, never self-reported
```
field_confidence = asr_conf(span) × resolver_margin × grammar_hit
```
Three chips beneath: *how clearly was it heard* · *was the choice actually
decisive* · *canonical or recovered*.

Then in UNCERTAIN amber:
> We never ask the model how confident it is. Models are badly calibrated —
> they will attach 0.95 to something they invented.

### 15 · It learns from one correction
```
resolver unsure  →  admin approves once  →  never asks again
```
Screenshot of the Teach screen. Note beneath: *this is why the moat compounds
— the system learns each customer's own vocabulary.*

---

### 🔵 DIVIDER — "Does it actually work?"

### 16 · Evidence ⭐
Three stat blocks across the slide. **[MEASURED]**
```
      412                    ~40 ms                    4
AUTOMATED TESTS        DETERMINISTIC LAYER        FILES TOUCHED
full suite <1s         of a ~2.4s pipeline     to add a second modality
```
Beneath, the real worked example from slide 8 restated in one line:
> Four words mis-transcribed. Every field correct.

⚠️ **If the eval harness has run on labelled clips by then**, replace the
middle block with WER vs field accuracy — that is the stronger chart. If it
has not, use this and say so; *"one verified case, harness ready"* beats a
number you cannot defend.

### 17 · It knows when it doesn't know
**CHART 2 — calibration curve** if you have eval data, otherwise the live
confidence-distribution histogram from the console (real, and on screen).

Beside it:
```
        15%
FLAGGED FOR REVIEW
which contain 80% of all errors
```
Mark **[MODELLED]** unless the harness has produced it.

---

### 🔵 DIVIDER — "Who pays for this."

### 18 · The market
**CHART 3 — deliberately lopsided donut.** [VERIFIED]
```
97%  traditional trade — small shops, rural outlets
      ← every one visited by a human
 3%  modern retail
```
Three stat blocks: `~$4B` FMCG MARKET · `~10%` CAGR · `97%` TRADITIONAL TRADE.
Source line: *The Business Standard / FICCI.*

> Ninety-seven percent of this market is served by a person walking into a
> small shop. Every one of those visits generates intelligence, and almost
> none of it is captured.

### 19 · The money ⭐⭐
The model from §1, built on screen line by line. Assumptions box in
INK-MUTED, arithmetic in INK, the two results in INDIGO.

**Build:** assumptions → OOS rate → lost-sale share → the 4.8% → ৳144M →
pause → the lever → ৳28.8M → cost → **~13×**.

Then say the halving line.

### 20 · Why nobody else can just do this
The comparison table from §2, then the three-line moat.
**Build:** table rows one at a time, then the moat lines.

---

### 🔵 DIVIDER — "Where this goes."

### 21 · Roadmap
Three tiers expanding rightward.
```
NOW                    NEXT                      LATER
Voice → data           Real OCR (printed         Predictive stock-out
Photo → data             signage, price tags)    Cross-region anomaly
Confidence gating      Domain-tuned Bangla ASR   Other field forces:
Alias learning         Learned confidence          pharma reps, microfinance
Bangla                   model                     officers, NGO surveys
```
NOW in CONFIDENT green, NEXT in INDIGO, LATER in INK-MUTED.

The last line is the business expansion: *the same architecture, a different
catalogue and schema.* FMCG is the beachhead, not the ceiling.

### 22 · Close
Back to slide 1's composition; the waveform returns.
> Every fifteen seconds of voice becomes something a company can act on.

QR to the repo.

---

## 5. Charts

| # | Chart | Slide | Data |
|---|---|---|---|
| 1 | ASR benchmark gap, horizontal bars | 6 | [VERIFIED] |
| 2 | Calibration curve *or* confidence histogram | 17 | eval run / live console |
| 3 | Traditional-trade donut | 18 | [VERIFIED] |
| 4 | ROI waterfall | 19 | [MODELLED] — show the arithmetic |

**Rules.** No gridlines unless a value must be read precisely — label bars
directly. No legends; label in place. Tabular figures always. **Never a 3D
chart; never a pie with more than three segments.** Every chart animates in the
direction it is read.

Build them as SVG in code, so they re-render instantly when numbers change.

---

## 6. Transitions

- **Within an act:** cut, or a 200ms cross-fade. Nothing else.
- **Into a divider:** INDIGO→VIOLET gradient wipes from the left, 400ms. The
  only slide-level motion in the deck, which is why it reads as a section break.
- **Out of a divider:** cut.

```
element fade-up   300ms cubic-bezier(0.22,1,0.36,1), 12px rise
stagger           120ms
dramatic pause    800–1000ms   (slides 4, 6, 7, 19)
bar/line draw     1200ms ease-out
number count-up   800ms
```

**Never:** spin, bounce, cube, zoom, page-curl. One flashy transition costs
more credibility than it buys.

---

## 7. Delivery

- **Build in** Figma Slides or Google Slides. Avoid Gamma-style generators —
  they impose a visual language and it is not this one.
- **Export** PDF *and* a 1080p video of the full build. Venue laptops fail.
- **Embed or outline the fonts.** Hind Siliguri missing on the venue machine
  means every Bangla slide renders as boxes — the exact failure that hit the
  first design pass, at a much worse moment.
- **Test on a projector, not a monitor.** Check slides 6, 17 and 19.
- **Rehearse the pauses.** Slides 3, 5, 7 and 19 each contain a silence. In
  rehearsal they feel unbearable; from the audience they read as confidence.

## 8. Build order

1. Design system + master slides + dividers
2. Slides 7, 8, 19 — the three that carry the argument
3. The four charts, in code
4. Everything else
5. Transitions and build order
6. **Rehearse against a clock**

Short on time? Cut 4, 12 and 21 before touching anything else.

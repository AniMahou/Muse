# Muse — presentation plan

Everything needed to build the deck: design system, slide-by-slide layout,
copy, charts with real data, transitions, and delivery notes.

**Target:** BrainChild 2.0 (30 Aug) and the Intelligent Machines AI Builders
workshop. ~20 slides, 8–10 minutes, plus Q&A.

---

## 0. Why the deck is LIGHT while the product is DARK

You asked for a light theme. That is correct, and for three reasons worth
knowing rather than just complying with:

1. **Projectors destroy dark decks.** A hall projector in daylight turns
   `#0A0E1A` into muddy grey and kills every low-contrast detail. Light decks
   survive bad projection; dark ones do not.
2. **The dark product screenshots become the hero.** On a warm off-white slide,
   a dark glassmorphic UI screenshot pops like a photograph in a gallery. Put
   a dark UI on a dark slide and it disappears into the background.
3. **Light reads as editorial and considered; dark reads as developer.** For a
   judging panel of industry and academics, the first is worth more.

So: **light deck, dark product.** The contrast is the design.

---

## 1. Design system

### Palette

```
INK          #14161F   headlines, primary text
INK-SOFT     #4A4F5E   body text
INK-MUTED    #8A90A0   captions, axis labels
PAPER        #FBFAF7   slide background — WARM off-white, never pure white
PAPER-RAISED #FFFFFF   cards sitting on paper
RULE         #E6E4DE   hairlines, dividers

INDIGO       #4F46E5   primary accent — same as the product
VIOLET       #7C5CFF   gradient partner
CONFIDENT    #0E9F6E   confirmed / high confidence
UNCERTAIN    #D97706   flagged / needs review  (amber, NEVER red)
CRITICAL     #DC2626   used at most twice in the whole deck
```

**Pure white (`#FFFFFF`) as a background is a mistake under projection** — it
glares and fatigues. The warm off-white `#FBFAF7` reads as paper and makes the
indigo sing.

**One accent per slide.** If a slide needs two, it is two slides.

### The through-line: saturation = certainty

The same rule that governs the product governs the deck. Anywhere confidence
appears — charts, screenshots, diagrams — use:

```
confirmed data      CONFIDENT green, full saturation
uncertain data      UNCERTAIN amber
raw/unjudged        INK-MUTED, desaturated
```

A judge who sees the same colour language in your logo, your charts and your
live demo reads that as design maturity without being told.

### Typography

```
Display    Space Grotesk Bold      48–72pt   headlines
Heading    Space Grotesk Medium    28–36pt   slide titles
Body       Inter Regular           18–22pt   never below 18pt
Caption    Inter Medium            14–16pt   labels, sources
Bangla     Hind Siliguri           24–40pt   set LARGER than Latin
Mono       JetBrains Mono          16–18pt   code, metrics
Numbers    tabular figures         64–120pt  the big stat moments
```

**Bangla must be set 15–20% larger than equivalent Latin.** Bengali conjuncts
(যুক্তাক্ষর) carry more visual detail per glyph and disappear at Latin sizes.
This is the single most common mistake in Bangladeshi decks.

### Grid & spacing

```
Canvas       1920×1080 (16:9)
Margins      120px left/right, 90px top/bottom
Columns      12, 40px gutter
Baseline     8px — every vertical measure is a multiple
Card radius  16px
Shadow       0 2px 8px rgba(20,22,31,0.06)  — one level only, never stacked
```

### Component specs

**Stat block** (the hero number)
```
Number    Space Grotesk Bold, 120pt, INDIGO, tabular
Label     Inter Medium, 16pt, INK-MUTED, letter-spacing 0.08em, UPPERCASE
Context   Inter Regular, 18pt, INK-SOFT, one line under
Rule      2px INDIGO, 64px wide, sitting above the number
```

**Quote card** (rep verbatim — use these often, they are your texture)
```
Card      PAPER-RAISED, radius 16, 40px padding, one soft shadow
Bangla    Hind Siliguri, 32pt, INK
Latin     Inter Italic, 18pt, INK-MUTED, directly beneath as translation
Mark      A 64pt INDIGO opening quote, 20% opacity, behind the text
```

**Screenshot frame**
```
Device    Rounded rect, 24px radius, 12px PAPER-RAISED border
Shadow    0 24px 60px rgba(20,22,31,0.14) — deeper than cards, it floats
Tilt      Optional 3° rotation for depth; never more
Callout   INDIGO circle + number, 32px, with a 1.5px leader line
```

**Section divider** (between acts)
```
Full-bleed INDIGO→VIOLET gradient, white Space Grotesk 56pt centred.
Six of these in the deck. They are the breathing room.
```

---

## 2. Narrative arc

Seven acts. The order is deliberate: **problem before product, product before
architecture, evidence before business.** Judges disengage when a deck opens
with technology.

| Act | Slides | Purpose | Time |
|---|---|---|---|
| 1 · The loss | 1–4 | Make them feel the problem | 1:30 |
| 2 · The insight | 5–6 | The idea that makes it possible | 1:00 |
| 3 · The product | 7–9 | What it actually is | 1:30 |
| 4 · The engineering | 10–13 | Why it works | 2:00 |
| 5 · The evidence | 14–15 | Proof, honestly stated | 1:00 |
| 6 · The business | 16–18 | Who pays, and why | 1:30 |
| 7 · The future | 19–20 | Where it goes | 0:30 |

---

## 3. Slide by slide

### SLIDE 1 — Title

**Layout:** centred, vast whitespace, nothing else on the slide.

```
                     মিউজ
                     MUSE

        Bangla voice → structured field intelligence

              [name] · [name] · [name]
                  BrainChild 2.0
```

- `মিউজ` in Hind Siliguri 96pt INK, `MUSE` beneath in Space Grotesk 40pt with
  0.3em letter-spacing, INDIGO
- Behind, at 6% opacity, a single enormous waveform in the INDIGO→VIOLET
  gradient, bleeding off both edges
- **Build:** waveform draws left→right over 1.2s, then the wordmark fades up

**Say:** nothing for three seconds. Let it sit.

---

### SLIDE 2 — The scene

**Layout:** full-bleed photograph (a Dhaka grocery shop, a rep with a phone),
INK overlay at 55%, text bottom-left in the third column.

```
Tuesday, 11 a.m. Mirpur.

A distribution rep sees a competitor's promo
running in twelve shops.
```

- Body Inter 28pt, PAPER
- **Build:** photo fades in, then the two lines rise 12px and fade, staggered
  200ms
- **Transition in:** cut. No animation on entry — abruptness is the point.

---

### SLIDE 3 — The loss ⭐ the emotional core

**Layout:** a horizontal timeline across the full slide width.

```
Tuesday ●────────────────────────────────────────────● October
   the rep knows                              the brand manager
                                                finds out
                          ↑
                  from a sales dip
```

- Line: 3px, INK-MUTED, with INDIGO dots at each end
- Between them, in INK-MUTED 20pt: `19 weeks`
- **Build:** left dot appears → line draws left-to-right over 1.6s (make it
  feel *slow*, the delay is the message) → right dot → `19 weeks` fades in
- **Speaker note:** "Nineteen weeks. And nobody did anything wrong."

---

### SLIDE 4 — Why it happens

**Layout:** two columns, 6/6.

```
LEFT                          RIGHT
What the SFA captures         What it doesn't

✓ Order quantity              ✗ Why the shop refused
✓ SKU code                    ✗ What the competitor is doing
✓ Outlet ID                   ✗ Why stock isn't moving
✓ Timestamp                   ✗ What the retailer complained about
```

Beneath, full width, INK 32pt:

```
Typing three sentences across forty outlets a day is impossible.
So nobody does.
```

- Left ticks CONFIDENT green; right crosses INK-MUTED (**not** red — this is
  not a failure, it is a structural limit)
- **Build:** left column all at once, pause 600ms, then right column staggered
  120ms each. The pause is what sells it.

---

### 🔵 DIVIDER — "There is one thing a rep will always do."

---

### SLIDE 5 — The insight

**Layout:** centred, single line, enormous.

```
Fifteen seconds of voice
is not impossible.
```

Space Grotesk 72pt, INK, with `voice` in INDIGO.

- **Build:** whole line fades up as one unit. No stagger. Let it land.

---

### SLIDE 6 — But Bangla speech recognition is hard

**Layout:** chart left (7 cols), text right (5 cols).

**CHART 1 — the honesty chart.** Horizontal bars.

```
Bengali ASR, published benchmark (FLEURS)     ███ 3.1%
Bengali ASR, published benchmark (CommonVoice)████ 5.5%
Bengali ASR, REAL long-form audio             ██████████████████████████ ~34%
```

- First two bars INK-MUTED; the third CRITICAL red — one of only two reds in
  the deck
- **Build:** top two bars grow, pause 800ms, third bar grows *slowly* and
  overshoots the others dramatically

Right column:

```
Published benchmarks are read, clean, studio speech.

Our user is in a market. Traffic. A ceiling fan.
A shopkeeper talking over him.

We designed for 34%, not 3%.
```

**Source line, bottom, 14pt INK-MUTED:** *FLEURS / Common Voice benchmarks;
long-form figure from published Bangla ASR evaluations.*

---

### 🔵 DIVIDER — "So we stopped trying to fix the transcript."

---

### SLIDE 7 — The thesis ⭐ the single most important slide

**Layout:** centred, two stacked statements.

```
The transcript doesn't need to be right.

The fields need to be right.
```

- Line 1 in INK-MUTED 44pt, with a strikethrough animating across it
- Line 2 in INK 56pt, `fields` in INDIGO
- **Build:** line 1 appears → 800ms → strikethrough draws across it → line 2
  fades up bold beneath

**Speaker note:** this is the sentence they should remember tomorrow. Say it,
then stop talking for two full seconds.

---

### SLIDE 8 — What it looks like ⭐ live worked example

**Layout:** three horizontal bands, top to bottom.

**Band 1 — what Whisper actually returned** (use your real output):

```
বজোই স্তোর মে প্রান মাঙ্গো জুস দের দর্জন লগেগা ঔর ভিল কা নযা আফ্যর দিযা হে পাঁচ তকা কম
```

Hind Siliguri 30pt. Highlight the wrong words in UNCERTAIN amber:
`বজোই` `স্তোর` `প্রান` `দের দর্জন` — with tiny INK-MUTED annotations under
each showing the correct form.

**Band 2 — a large INDIGO downward arrow, animated**

**Band 3 — the structured result**, in a PAPER-RAISED card:

```
OUTLET     Bijoy Store (OUT-1182)      ●  0.79
PRODUCT    PRAN Mango Juice 250ml      ●  0.98
QUANTITY   18 piece                    ●  0.85
                                  দেড় ডজন = 1.5 × 12
```

- **Build:** transcript appears → errors highlight amber one by one (400ms
  apart) → arrow draws → result card slides up with the confidence dots
  filling last

**Speaker note:** "Four words wrong. Every field right."

---

### SLIDE 9 — The two surfaces

**Layout:** phone screenshot left (5 cols, tilted 3°), desktop screenshot right
(7 cols), both floating on PAPER with deep shadows.

Caption under each: `The rep · 15 seconds` / `The brand manager · Monday morning`

- **Build:** phone slides in from left, desktop from right, 150ms apart
- Use your actual Stitch screens — this is where the dark UI earns its keep

---

### 🔵 DIVIDER — "How it survives a 34% error rate."

---

### SLIDE 10 — The pipeline ⭐ architecture hero

**Layout:** full-width horizontal flow diagram.

```
  🎙        ①            ②③④              ⑤             ⑥
 voice → TRANSCRIBE → ANNOTATE → ASSEMBLE → CONFIDENCE → data
           [API]      (parallel)   [API]    (deterministic)
                          │
        ┌─────────────────┼─────────────────┐
   quantity grammar   SKU resolver    outlet resolver
```

- Stages 1 and 5 in INK-MUTED boxes labelled `third-party API`
- Stages 2, 3, 4, 6 in **INDIGO** boxes labelled `ours`
- **Build:** left to right, one stage at a time, 300ms apart. When 2/3/4
  appear, they appear *simultaneously* — visually making the parallelism point
  without a word.

**Say:** "Two API calls. Everything that makes it work is ours."

---

### SLIDE 11 — The deterministic layer

**Layout:** two cards side by side.

**CARD A — Bangla quantity grammar**
```
দেড়     1.5        ডজন    ×12
আড়াই   2.5        হালি   ×4
সাড়ে X  X+0.5      কুড়ি   ×20
সোয়া X  X+0.25
পৌনে X  X−0.25   ← subtracts
```
Highlight `পৌনে` in UNCERTAIN amber with a callout: *"No general model gets
this right."*

**CARD B — phonetic collapse**
```
শ ষ স → s        ই ঈ → i
ণ ন   → n        ট ত → t
র ড় ঢ় → r        aspiration dropped

হইল  →  huil  ←  Wheel
```
The `হইল → huil ← Wheel` line in INDIGO, 32pt — it is the whole idea in one
line.

- **Build:** card A, then card B, then the হইল line last with a soft glow pulse

---

### SLIDE 12 — Hallucination is structurally impossible

**Layout:** code block centred, generous whitespace either side.

```ts
// Rebuilt for EVERY clip
skuId: z.enum(["SKU-404", "SKU-407"]).nullable()
              ↑ produced by the resolver, this clip only
```

Beneath, INK 28pt:

```
A product that was never resolved
is not expressible.

That is a constraint, not a prompt instruction.
```

- **Build:** code appears → the arrow and annotation draw → the statement fades
  up

**Speaker note:** the strongest technical differentiator against every "we told
the LLM not to hallucinate" project in the room.

---

### SLIDE 13 — Confidence is derived, never self-reported

**Layout:** formula centred, then three evidence chips beneath.

```
field_confidence  =  asr_conf(span) × resolver_margin × grammar_hit
```

```
[ how clearly    ]  [ was the choice ]  [ canonical or ]
[ was it heard   ]  [ actually       ]  [ recovered    ]
[                ]  [ decisive       ]  [              ]
```

Then, in UNCERTAIN amber:

```
We never ask the model how confident it is.
Models are badly calibrated — they will attach 0.95 to something they invented.
```

- **Build:** formula assembles term by term, each with its chip appearing below

---

### 🔵 DIVIDER — "Does it actually work?"

---

### SLIDE 14 — The money chart ⭐⭐ the most important visual

**CHART 2 — WER vs Field Accuracy.** Two enormous vertical bars, side by side,
nothing else on the slide.

```
     Word error rate          Field accuracy
          ████                    ████████████████
          ████                    ████████████████
          [XX%]                        [YY%]
       CRITICAL red               CONFIDENT green
```

Beneath, INK 28pt centred:

```
The transcript is wrong. The data is right.
```

- **Build:** left bar grows fast → pause 1s → right bar grows *slowly* to full
  height, overshooting dramatically
- ⚠️ **Fill these numbers from your eval run.** Do not invent them. If the
  harness has not run on labelled clips by then, replace this slide with the
  single verified example from slide 8 and say so plainly — a judge respects
  "one verified case, harness ready" far more than a number you cannot defend.

---

### SLIDE 15 — It knows when it doesn't know

**CHART 3 — calibration reliability curve.**

```
observed  1.0│                              ╱ perfect
accuracy     │                          ╱ ·
          0.8│                      ╱ ●
             │                  ╱ ●
          0.6│              ╱ ●
             │          ╱
          0.4│      ╱
             └──────────────────────────────
              0.4   0.6   0.8   1.0
                  claimed confidence
```

- Diagonal in INK-MUTED dashed = perfect calibration
- Our line in INDIGO with dots sized by sample count

Beside it, a stat block:

```
        15%
FLAGGED FOR REVIEW
which contain 80% of all errors
```

- **Build:** axes → diagonal → our curve draws left to right → stat counts up

**Say:** "It flags fifteen percent, and those fifteen percent contain eighty
percent of the mistakes. That is a gate doing real work."

---

### 🔵 DIVIDER — "Who pays for this."

---

### SLIDE 16 — The market

**CHART 4 — donut, deliberately lopsided.**

```
        Bangladesh FMCG trade

   ╭─────────────╮
   │   ███████   │   97%  traditional trade
   │  █████████  │        small shops, rural outlets
   │  █████████  │        ← every one visited by a human
   │   ███████   │
   ╰─────────────╯    3%  modern retail
```

- 97% arc in INDIGO, 3% in RULE grey
- Three stat blocks beneath:

```
   ~$4B              ~10%              97%
FMCG MARKET      CAGR, LAST      TRADITIONAL
   SIZE            DECADE           TRADE
```

**Source line:** *The Business Standard / FICCI, 2023–24.*

**Say:** "Ninety-seven percent of this market is served by a person walking
into a small shop. Every one of those visits generates intelligence, and
almost none of it is captured."

---

### SLIDE 17 — Who signs the cheque

**Layout:** three persona cards.

```
BRAND MANAGER          FIELD OPS HEAD         THE COMPANY
buys it                operates it            ACI · BAT
                                              Unilever · PRAN

"I find out about      "I can't review        Field forces of
 competitor moves       every recording"       hundreds. Thousands
 from a sales dip"                             of outlets.
```

- **Build:** cards appear left to right, 200ms apart
- Company names in INDIGO — **naming real targets is what makes this concrete**

**Speaker note (for the IM workshop specifically):** "Unilever and BAT are
already your clients. This sells through relationships you own."

---

### SLIDE 18 — Why not just hire more people

**Layout:** a single objection, answered.

```
"Why not hire three more people?"
```
(INK-MUTED 36pt, in quotation marks)

```
Because three more people still can't
correlate complaints across a region,
and still can't be there on Tuesday.
```
(INK 32pt)

Then, small, INK-MUTED:
```
Cost per field report: ৳X · p95 latency: Xs
```

- **Build:** objection appears → 1s pause → answer fades up

**Speaker note:** raise the strongest objection yourself, before the CEO does.
It is the single most credible move available in the whole talk.

---

### 🔵 DIVIDER — "Where this goes."

---

### SLIDE 19 — The roadmap

**Layout:** three horizontal tiers, expanding rightward.

```
NOW              NEXT                    LATER
─────            ────                    ─────
Voice → data     Domain-tuned ASR        Predictive stock-out
Confidence       (n-gram fusion on       Cross-region anomaly
  gating          our own catalogue)      detection
Alias learning   Learned confidence      Multi-language
                  model                   (Hindi, Urdu — same
Bangla           Field-ops analytics       architecture)
```

- NOW in CONFIDENT green, NEXT in INDIGO, LATER in INK-MUTED
- **Build:** tier by tier, each expanding wider than the last

---

### SLIDE 20 — Close

**Layout:** back to slide 1's composition. The waveform returns.

```
                     মিউজ

       Every fifteen seconds of voice
       becomes something a company can act on.

                   [ QR to repo ]
```

- **Build:** waveform draws, then the line, then the QR

---

## 4. Charts — build specs

| # | Chart | Slide | Data source |
|---|---|---|---|
| 1 | ASR benchmark gap (horizontal bars) | 6 | Published benchmarks; cite them |
| 2 | **WER vs field accuracy** (2 bars) | 14 | **Your eval run** |
| 3 | Calibration reliability curve | 15 | **Your eval run** |
| 4 | Traditional trade donut | 16 | TBS / FICCI |

**Rules for every chart:**

- No gridlines unless a value must be read precisely. Label the bars directly.
- No legends — label in place.
- Tabular figures always, so numbers do not shift during a count-up animation.
- **Never a 3D chart. Never a pie with more than three segments.**
- Axis labels in INK-MUTED 14pt; values in INK 20pt.
- Every chart animates *in the direction it is read* — bars grow from their
  baseline, lines draw left to right.

**Build them in code, not by hand.** You already have a design system; render
them as SVG so they are crisp on a projector and trivially re-rendered when the
eval numbers change.

---

## 5. Transitions

**Between slides within an act:** cut, or a 200ms cross-fade. Nothing else.

**Into a divider:** the INDIGO→VIOLET gradient wipes in from the left over
400ms. This is the only slide-level motion in the deck, which is exactly why it
signals "new section".

**Out of a divider:** cut.

**Within a slide:** build order carries meaning. Reveal in the order you want
the argument understood, never all at once. Standard timings:

```
element fade-up      300ms, cubic-bezier(0.22, 1, 0.36, 1), 12px rise
stagger between      120ms
dramatic pause       800–1000ms  (slides 4, 6, 7, 14 — the pause IS the point)
bar/line draw        1200ms ease-out
number count-up      800ms
```

**Never use:** spin, bounce, cube, zoom, page-curl, or anything that draws
attention to the transition rather than the content. One flashy transition
costs more credibility than it buys.

---

## 6. Data integrity — read this before you build

Judges at a technical fest ask about numbers. Getting caught with an invented
figure is far worse than having fewer figures.

**Solid, cite the source on the slide:**
- Bangladesh FMCG market ~$4B, ~10% CAGR *(TBS / FICCI)*
- ~97% of FMCG trade is traditional *(TBS / FICCI)*
- Bengali ASR benchmark figures *(FLEURS, Common Voice)*

**Yours, and therefore the strongest — you measured them:**
- The corrupted-transcript worked example on slide 8
- 399 automated tests
- Pipeline stage timings
- Whatever the eval harness produces on labelled clips

**⚠️ Verify before quoting, or cut:**
- Total retail outlet count in Bangladesh (~1M is commonly repeated; I could
  not confirm it from a primary source)
- FMCG field-rep headcount
- SFA adoption percentage

If a number is not verified, **do not put it on a slide.** Say "we estimate"
out loud instead, or leave it out. One unverifiable statistic invites the panel
to doubt the ones that are real.

---

## 7. Delivery

**Build in:** Figma Slides or Google Slides. Avoid Gamma and similar generators
— they impose a visual language and it is not this one.

**Export:** PDF *and* a 1080p video of the full build sequence as backup.
Venue laptops fail; a video always plays.

**Fonts:** embed or outline them. Hind Siliguri absent on the venue machine
means every Bangla slide renders as boxes — the same failure that hit your
Stitch screens, at a much worse moment.

**Test on a projector, not a monitor.** Contrast that looks generous on a
laptop collapses under projection. Check slides 6, 14 and 15 specifically.

**Rehearse the pauses.** Slides 3, 5, 7 and 14 each have a silence in them. In
rehearsal they feel unbearably long; from the audience they read as confidence.

**The live demo goes between slides 9 and 10** — after they know what it is,
before you explain how. If the demo fails, slide 8 already showed a real
verified result, so you keep moving.

---

## 8. Build order

1. Design system + master slides (palette, type, dividers)
2. Slides 7, 8, 14 — the three that carry the argument
3. The four charts, in code
4. Everything else
5. Transitions and build order
6. **Rehearse against a clock**

If you run out of time, cut slides 4, 11 and 19 before touching anything else.

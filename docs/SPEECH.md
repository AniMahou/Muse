# Muse — speaking script

What to actually say. Slide-by-slide, then both demos.

**Total: 9–11 minutes** including a 3-minute live demo.
Companion file: `PRESENTATION_PLAN.md` for what is on each slide.

---

## Before you start

**Three rules that matter more than the words.**

1. **The pauses are written in. Take them.** Slides 3, 5, 7 and 19 each have a
   silence marked `[PAUSE]`. In rehearsal they feel unbearably long. From the
   audience they read as someone who is not nervous.
2. **Never read the slide aloud.** The slide is the evidence; you are the
   argument. If a sentence is on screen, say a different one.
3. **Say "we don't know" when you don't.** Every modelled number below has a
   line attached admitting what is assumed. Those lines are not weakness —
   they are the reason the rest of your numbers get believed.

**Setup checklist before you walk up**
- API, worker and web running · log in as `demo@muse.test`
- Console open on **Today**, field app open on the phone
- **Airplane mode test done** — know what breaks without network
- Backup video queued in another tab

---

## ACT 1 — The loss  (1:30)

### Slide 1 — Title

> *[Say nothing for three seconds. Let the waveform finish drawing.]*

"This is Muse. It turns a Bangladeshi field representative's voice into data
his company can act on. I'll show you it working in about four minutes — but
first I want to tell you what it's for."

### Slide 2 — The scene

"Tuesday morning, eleven o'clock, Mirpur. A distribution rep walks into a
grocery shop, and he notices a competitor is running a promotion. Not in one
shop — in twelve shops on his route."

"He knows this on Tuesday."

### Slide 3 — The loss

> *[Let the timeline finish drawing before you speak.]*

"His brand manager finds out in October. From a sales dip."

**[PAUSE — two full seconds]**

"Nineteen weeks. And nobody did anything wrong."

### Slide 4 — Why it happens

"Because the tools capture the order and not the reason."

> *[Left column]* "Every sales-force app in this market records the quantity,
> the SKU, the outlet, the timestamp. That part is solved."

> *[Right column, after the pause]* "None of them records why the shop refused
> the order. Or what the competitor is doing. Or what the retailer complained
> about."

"And it isn't a software failure. Ask a rep to type three sentences of context
at forty outlets a day and he will not do it. Nobody would."

---

## ACT 2 — The insight  (1:15)

### Slide 5 — The insight

"But there's one thing he will always do."

**[PAUSE]**

"Fifteen seconds of voice is not impossible."

### Slide 6 — The language is the hard part

"So — speech recognition. Solved problem, you'd think. Bengali benchmarks
report three to five percent word error rate."

> *[After the third bar lands]*

"Those benchmarks are read speech. Studio microphone, scripted sentences,
someone sitting still. On real long-form Bangla audio, published evaluations
put word error rate around thirty-four percent."

"Our user is standing in a market. There's traffic. There's a ceiling fan.
There's a shopkeeper talking over him."

"So we designed for thirty-four percent, not three."

### Slide 7 — The thesis ⭐

"Which meant giving up on something."

> *[Line one appears, strikethrough draws]*

"The transcript does not need to be right."

> *[Line two]*

"The **fields** need to be right."

**[PAUSE — two full seconds. This is the sentence you want them to remember.]**

---

## ACT 3 — The product  (1:15)

### Slide 8 — Real output

"Here's a real recording, and this is verbatim what the speech model gave us
back."

> *[As the amber highlights appear, name them]*

"Bijoy Store came back as *bojoi stor*. প্রাণ — the brand PRAN — came back
spelled wrong. 'Dozen' came back as the Hindi word."

"Four words wrong in one sentence."

> *[After the card slides up]*

"And every field is correct. The right shop, the right product, eighteen
pieces — because দেড় ডজন is one and a half dozen, and something in our system
knows that."

### Slide 9 — Two surfaces

"Two people use this. A rep, for fifteen seconds, forty times a day. And a
brand manager, on Monday morning, who has never opened it before and shouldn't
need training."

### Slide 10 — Two ways in

"And there are two ways in. He can speak, or he can photograph the order note
he already writes by hand."

"One honest caveat: reading handwriting is simulated in what I'm about to show
you. Everything *after* the reading — the grammar, the product matching, the
confidence scoring — is the real pipeline. Same code as voice."

"Let me show you."

---

## ▶ DEMO — 3 minutes

> **Golden rule: narrate what you are about to do BEFORE you click.** If
> something fails, the audience already knows what should have happened, and
> you can keep talking while you recover.

### Demo 1 — Voice  (90 seconds)

**Setup line, phone in hand:**
"This is the rep's app. Bangla only — no language toggle, because he isn't
switching."

**Press and hold, and speak clearly:**
> বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে, আর হুইল এর নতুন অফার দিছে, পাঁচ টাকা কম

**While it uploads:**
"That's about eight seconds. Notice he doesn't wait for anything — the clip
goes to local storage first and uploads in the background. On a field
connection that drops between shops, waiting isn't an option."

**Switch to the console, Today:**
"And it appears here, on the brand manager's screen."

**Point at one card:**
"Shop. Product. Eighteen pieces. And this —"

> *[point at the amber ring / flagged field]*

"— this is the part I actually care about. It has flagged that it isn't sure
which shop. It heard the name, but there are three shops within twenty metres
and GPS can't separate them. So rather than guess, it says so."

**If the recording fails or the room is loud:**
> "The microphone isn't cooperating — that's a demo problem, not a system
> problem. Here's a clip from earlier that shows the same thing." *[Click an
> existing observation. Keep moving. Do not retry the recording.]*

### Demo 2 — Photo  (60 seconds)

**Field app → ছবি tab:**
"Second way in. This is what a rep's order pad actually looks like."

**Tap a sample note:**
"He photographs it."

**While the scan animation runs:**
"Reading handwriting is the simulated part — that badge says so, and it says so
on every result too. What is not simulated is everything after."

**When the text and result appear:**
"It read the note, and then the same Bangla number grammar parsed the
quantities, the same phonetic matcher found the products in the catalogue, and
the same confidence gate scored every field. Two observations, from a photo,
through the pipeline built for speech."

**Then the payoff line:**
"Adding a second way in touched four files. That's the architecture doing its
job."

### Demo 3 — The console  (30 seconds, only if time allows)

**Teach screen:**
"When it's repeatedly unsure about a word, it asks once. An admin approves it —
and it never asks again. That's how it learns each company's own vocabulary."

**Intelligence, scroll:**
"And this is what a brand manager opens on Monday. Which competitors are being
mentioned, where prices are moving, and how confident the system is in its own
output."

**Return to slides.**

---

## ACT 4 — The engineering  (2:15)

### Slide 11 — The pipeline

"So how does it survive a thirty-four percent error rate?"

"Six stages. Two of them are API calls — the speech model and one language
model call. The other four are ours."

> *[As 2, 3 and 4 appear together]*

"And these three run at the same time, because they don't depend on each
other. Quantities don't need products; products don't need shops."

"Two API calls. Everything that makes it work is ours."

### Slide 12 — The deterministic layer

"This is the part I'd point at if you asked me what's actually hard here."

> *[Card A]*

"Bangla numbers. দেড় is one and a half. আড়াই is two and a half. সাড়ে adds a
half; সোয়া adds a quarter; পৌনে **subtracts** a quarter."

"No general-purpose model gets পৌনে right reliably. We wrote the grammar."

> *[Card B]*

"And Bangla spelling is many-to-one onto sound. Three different letters are all
/s/. Vowel length is orthographic, not phonemic. Speech recognition loses
aspiration constantly."

"So we collapse both the heard word and the catalogue into the same phonetic
space. Which is how হইল — a mis-transcription — reaches the brand Wheel."

### Slide 13 — Hallucination

"The other question you should be asking is: what stops the language model
inventing a product that doesn't exist?"

"We rebuild the response schema for every single clip. The product field isn't
a string — it's a list of exactly the candidates the resolver found in *this*
recording."

"A product that was never resolved is not expressible. That's a constraint,
not a prompt instruction."

### Slide 14 — Confidence

"And we never ask the model how confident it is."

"Language models are badly calibrated. They will attach point-nine-five to
something they invented. So confidence here is derived — from how clearly the
audio was heard over those exact characters, from how decisively the resolver
won, and from whether the grammar matched cleanly or recovered a misspelling."

### Slide 15 — Learning

"And when it's unsure repeatedly about the same word, a human answers once and
it stops asking. Permanently, for every rep in that company."

---

## ACT 5 — The evidence  (1:00)

### Slide 16 — Evidence

"Four hundred and twelve automated tests. The whole suite runs in under a
second, with no network and no API key."

"The deterministic layer — the grammar, both resolvers, the confidence scoring
— is about forty milliseconds of a two-and-a-half second pipeline. Almost all
the latency is the two API calls."

"And adding photo capture, a completely different input, touched four files."

> *[If you have eval numbers, swap in:]*
> "On our labelled set, word error rate is X percent and field-level accuracy
> is Y. That gap is the entire argument."

> *[If you do not:]*
> "Our evaluation harness is built and gated. What it needs is a hundred
> labelled field recordings, and collecting those is this week's work — so
> today I'm showing you one verified case rather than a number I can't defend."

### Slide 17 — Calibration

"This is the system's opinion of its own reliability."

"It flags a minority of fields, and those flagged fields contain most of the
errors. That's a gate doing real work rather than choosing at random."

> **Say the assumption:** "That split is from our current sample, not a
> published result."

---

## ACT 6 — The business  (1:45)

### Slide 18 — The market

"Bangladesh's FMCG market is roughly four billion dollars, growing around ten
percent a year."

"And ninety-seven percent of that trade is traditional — small shops, rural
outlets."

"Which means almost the entire market is served by a person physically walking
into a shop. Every one of those visits produces intelligence. Almost none of
it is captured."

### Slide 19 — The money ⭐⭐

"Let me build the number rather than assert it."

> *[Follow the build. Say each line as it appears.]*

"Take a mid-size brand: ten thousand outlets, twenty-five thousand taka a month
through each. Three billion taka a year."

"The global average out-of-stock rate is eight point three percent. Fifty-eight
percent of shoppers who hit a stock-out don't wait — that's a lost sale. Both
of those are published figures."

"So roughly four point eight percent of revenue is lost to stock-outs. On three
billion taka, that's a hundred and forty-four million."

**[PAUSE]**

"Muse doesn't eliminate stock-outs. It compresses how long they last — from
'discovered at the next audit' to 'reported this afternoon'."

"If that cuts the loss by twenty percent, you recover about twenty-nine million
taka a year. At a hundred and fifty reps, this costs about two point one
million."

"Roughly thirteen times."

**Then — and do not skip this:**

"That twenty percent is our assumption. It is not a measured result.
Everything else on this slide is sourced. If you halve our assumption, it's
still a six-fold return."

### Slide 20 — Why alternatives can't

"You'll be wondering why the sales-force apps don't just add this."

> *[Table, row by row]*

"Sales-force apps capture the order, not the reason. Retail audits are
rigorous, but they're sample-based and monthly — you learn about last month
from some shops. WhatsApp groups are unstructured and unsearchable. And hiring
three more reps gives you the same capture problem, multiplied — three more
people still can't correlate complaints across a region."

"And generic voice-to-text gives you a transcript. A transcript is not data."

> *[The moat]*

"Three things make this hard to copy. First — the difficulty isn't the speech
model, it's turning thirty-four percent error into correct fields, and that's
domain work, not an API key. Second — the learning is customer-specific, so
after six months it knows how *their* reps say *their* products, and a
competitor starts that over. Third — the architecture is what makes it
deployable at all. In an enterprise a confidently wrong SKU is worse than no
data."

---

## ACT 7 — The future  (0:45)

### Slide 21 — Roadmap

"Next is real handwriting recognition, a Bangla speech model tuned to our own
catalogue, and a learned confidence model trained on our own errors."

"And further out — this is the same architecture with a different catalogue.
Pharmaceutical reps writing doctor call notes. Microfinance officers writing
borrower visits. NGO field surveys. Every one of them is a Bangla-speaking
field worker whose observations currently die on paper."

"FMCG is the beachhead, not the ceiling."

### Slide 22 — Close

"Every fifteen seconds of voice becomes something a company can act on."

"Thank you."

---

## Questions you should expect

**"How much of this is AI versus rules?"**
> "Two model calls — speech recognition and one constrained generation call.
> Deliberately. The interesting part is that the deterministic layer around
> them is what makes the models *safe* to use: the schema is rebuilt per clip
> so the model can't invent a product, and confidence comes from evidence
> rather than from asking the model. I'd rather have two model calls I can
> defend than six I can't."

**"Why not just use ChatGPT / a vision model on the whole thing?"**
> "We tried the naive version. The problem isn't understanding — it's that a
> model handed a 34%-wrong transcript produces a plausible wrong answer with
> high confidence. The catalogue constraint is what turns a plausible answer
> into a checkable one."

**"What's your accuracy?"**
> "On word error rate, roughly what the published Bangla numbers say — around a
> third. On field-level accuracy, which is what actually matters, I can show
> you verified individual cases today, and the evaluation harness is built and
> gated. What it needs is the labelled set, which is this week's work. I'd
> rather show you the harness than quote a number I can't defend."

**"Does this work in Chittagonian / Sylheti?"**
> "No, and we scoped it out deliberately. Those are effectively different
> languages for a speech model. Version one targets Dhaka-standard Bangla, and
> we say so rather than discovering it in production."

**"Who's your customer, exactly?"**
> "The buyer is a brand or category manager at a company like ACI, PRAN,
> Unilever or BAT — someone who currently learns about competitor moves from a
> sales dip. The operator is field operations. They're different people, and we
> built two different applications for that reason."

**"What happens when they add fifty new products?"**
> "They import the new catalogue, and the resolver picks them up immediately —
> matching is against the catalogue, not a trained model. The alias learning
> layer then adapts to how reps actually pronounce the new names, over the
> first few weeks."

**"Isn't the handwriting part fake?"**
> "The reading is, yes — and it's labelled in the product, not just in this
> talk. Everything after the reading is the production pipeline. We built it
> that way on purpose: it means swapping in a real OCR model is one file, and
> it proves the pipeline is genuinely modality-agnostic rather than us claiming
> it is."

---

## If something goes wrong

| Failure | Say this, then keep moving |
|---|---|
| Microphone doesn't work | "That's a demo problem, not a system problem — here's one from earlier." Click an existing observation. **Do not retry.** |
| Network dies | "Convenient — this is exactly what a field connection does." Show the offline queue, then use the backup video. |
| A page is slow | Keep talking about what it's doing. Never watch a spinner in silence. |
| A number looks wrong on screen | "That doesn't look right — I'll check it after." Do not improvise an explanation. |
| You run out of time | Skip Act 4 entirely. Go slide 10 → demo → slide 19 → 20 → close. The business case matters more than the architecture. |

---

## Timing card — keep this in your pocket

```
0:00  Title
0:20  The loss                    ← pause on "nineteen weeks"
1:30  "Fifteen seconds of voice"  ← pause
2:00  The thesis                  ← TWO SECOND PAUSE
2:45  Real output
3:30  ▶ DEMO — voice
5:00  ▶ DEMO — photo
6:00  Pipeline / grammar / constraint / confidence
8:15  Evidence
9:15  Market → the money          ← pause before the lever
10:15 Why alternatives can't
11:00 Roadmap → close
```

If you hit 6:00 and you're still in the demo, **skip Act 4 and go straight to
the market.** Nobody has ever lost a pitch for saying too little about their
architecture.

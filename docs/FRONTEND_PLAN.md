# Frontend plan

Planning document for the Muse frontend. Written to be handed to a designer
(Figma / Stitch) **and** to be implemented from afterwards.

Nothing here is built yet. `frontend/` is an empty scaffold by instruction.

---

## 1. The one thing to get right

Two apps live in this repo, and they have almost nothing in common.

| | **Field app** | **Admin console** |
|---|---|---|
| Who | Distribution rep, on a motorbike | Brand manager / field ops, at a desk |
| Device | Cheap Android, cracked screen, glare | 1440px laptop |
| Connectivity | 3G that drops between shops | Office wifi |
| Session | 15 seconds, forty times a day | 20 minutes, twice a week |
| Language | **Bangla only** | Bangla + English |
| Success | Recording sent without thinking | Understanding what the field is telling them |

Designing them as one product with a shared shell would harm both. They share
a colour language and a Zod contract; nothing else.

---

## 2. Design constraints that come from the field, not from taste

These are not preferences. Each one comes from a real condition:

- **Bangla-first, not Bangla-optional.** No language toggle in the field app.
  English appears only where the catalogue itself is English (SKU names).
- **One-handed, thumb-reachable.** He is holding a bag and a phone. Every
  primary action sits in the bottom third of the screen.
- **Sunlight-readable.** High contrast, large type, no thin greys on white.
  Assume outdoors at midday.
- **Never blocks on network.** No spinner ever prevents the next recording.
  Everything queues.
- **Low-literacy tolerant.** Icons carry meaning alongside text. The core
  interaction is voice precisely because typing is the barrier.
- **Battery-aware.** No polling loops, no animation left running.

---

## 3. Screen inventory

### 3.1 Field app — four screens, and that is deliberate

Every additional screen reduces adoption. Reps are not office workers with
time to explore.

#### A · Onboarding (once)

```
SMS invite link → PWA opens → "Add to Home Screen"
   → set 4-digit PIN  (no SMS OTP: it costs money and reps lose passwords)
   → sees name, company logo, territory, today's route
   → 20-second interactive tutorial: "Try saying this →" [example sentence]
```

The tutorial is not optional. The first recording decides whether the app is
ever opened again.

**States:** invalid token · expired token · already activated on another device.

#### B · Record — the only screen that matters

```
┌─────────────────────────────┐
│  আজ: ৩৪টি দোকান · ১২ ভিজিট  │  route progress
├─────────────────────────────┤
│   📍 বিজয় স্টোর?            │  GPS auto-detect
│   [হ্যাঁ]  [অন্য দোকান]      │
│                             │
│    ┌───────────────────┐    │
│    │   ●  ধরে বলুন     │    │  hold-to-record
│    └───────────────────┘    │  ~60% of the viewport
├─────────────────────────────┤
│ ৩টি ক্লিপ · ১ পাঠানো হচ্ছে   │  local queue strip
└─────────────────────────────┘
```

**Interaction:** press and hold, speak, release to send. Release is the commit.
A cancel gesture (slide away while holding) must exist — misfires are constant
with gloves and wet hands.

**States, all of which will occur daily:**

| State | Behaviour |
|---|---|
| Mic permission denied | Explain in Bangla, deep-link to settings |
| No GPS fix yet | Record anyway; attach position when it arrives |
| Offline | Record, queue, show `অপেক্ষমাণ`. Never an error. |
| Queue syncing | Per-clip progress in the strip, non-blocking |
| Upload failed | Retry silently with backoff; surface only after repeated failure |
| Recording too short (<1s) | Discard with a shake; do not upload |

**GPS is captured at record time.** It cannot be recovered later — the rep has
moved on. This is a hard requirement on the capture screen, not a nice-to-have.

#### C · Clarification — batched, one tap

```
┌─────────────────────────────┐
│  ৩টি বিষয় নিশ্চিত করুন       │
├─────────────────────────────┤
│  🔊 ▶  (replay the clip)     │
│  "বিজয় স্টোর?"              │
│  [হ্যাঁ]    [না]             │
├─────────────────────────────┤
│  "১২ না ১৮ কার্টন?"          │
│  [১২]  [১৮]  [অন্য]          │
└─────────────────────────────┘
```

**One tap per question. Never a re-recording.** By the time this arrives he is
between outlets; asking him to record again means he never answers.

Audio replay on every question — he will not remember what he said forty shops
ago.

Delivered at end-of-route or on next app open, never as an interruption
mid-visit.

#### D · My day / history

Outlets visited vs assigned, clips captured, and a replayable list of past
recordings showing what was extracted.

Read-only. Its job is trust: the rep should be able to see that his voice
became data.

---

### 3.2 Admin console — seven screens

#### 1 · Today (landing)

Live feed of observations arriving over Socket.IO. This is the realtime demo
moment at the exhibition.

```
Observations today: 247   Reps active: 18/22   Outlets covered: 189
⚠ 3 high-severity competitor promos — Mirpur zone
⚠ 12 records need review
```

#### 2 · Intelligence ⭐ — the screen that gets bought

- Competitor share-of-voice, by brand and region, over time
- Stock-out heatmap: area × SKU
- Price erosion: observed `priceDelta` by region
- Emergent complaint themes (clustered, no predefined categories)
- Coverage: outlets visited vs assigned, per rep

**Every number drills down to the source audio.** Click a bar → the
observations behind it → press play → hear the rep's voice.

That chain is the single strongest differentiator against any BI dashboard. It
answers "how do I know your AI isn't making this up?" in two clicks, and no
competitor offers it.

#### 3 · Review queue

```
┌──────────────────────────────────────────────┐
│ 🔊 ▶━━━━━━━━━  7.4s          conf 0.61 ⚠      │
│                                              │
│ বিজয় স্টরে প্রান ম্যাঙ্গো জুস দের ডজন...      │
│ ░░░░░  ████  ░░░   ← shaded by word confidence│
│                                              │
│ Extracted:  SKU-404 · 18 pcs · OUT-1182      │
│ Unsure about: outlet, sku                    │
│                                              │
│ [Confirm]  [Correct →]  [Discard]            │
└──────────────────────────────────────────────┘
```

The transcript shading is not decoration — it comes straight from
`transcript.words[].conf` and shows the reviewer *where* to listen.

#### 4 · Alias approvals ⭐ — best demo screen you have

```
Heard "হইল" 7× this week
Matched → Wheel (COMP-WHEEL) @ 0.79
🔊 ▶ hear all 7 instances
[Approve alias]  [Map to other]  [Reject]
```

The learning loop in one frame: the system shows what it is unsure of, a human
answers once, it never asks again. Show this immediately after the live
recording.

#### 5 · Catalog

CSV import (not CRUD forms — it mirrors how you would integrate with SAP),
browse/search, and per-SKU: attached aliases, mention frequency, and **resolver
accuracy on that SKU** so the admin can see which products the system struggles
with.

#### 6 · Reps & territories

```
Rahim Uddin   · Mirpur-2 · Beverages, Home Care · 34 clips · avg conf 0.87
Karim Hossain · Mohammadpur · Home Care         · 41 clips · avg conf 0.62 ⚠
```

Per-rep average confidence is a genuine ops signal — a consistently low rep
usually means a strong dialect, a bad phone mic, or noisy recording conditions.

Assigning territory + brand portfolio is **not bookkeeping**: it scopes the
resolver's candidate set from thousands of SKUs to ~150, which is what keeps
matching accurate at ACI scale. Present it as an accuracy control.

#### 7 · Settings — mock it

Thresholds, integrations, roles, audit log. A static screen on the poster's
roadmap panel. Nobody penalises a mocked settings page; they penalise a broken
pipeline.

---

## 4. The visual language: saturation = certainty

Worth adopting as the brand signature, because it makes the product's technical
thesis visible without a word of explanation.

```
confirmed        full saturation      the system is sure
needs review     amber                the system is not sure, and says so
raw transcript   desaturated wash     machine output, not yet judged
flagged field    amber underline      this specific value is uncertain
```

One consistent rule across the wordmark, the transcript shading, the review
queue, the confidence charts, and the poster. A judge sees the same gradient in
the logo and in the data.

**Two colour scales, and they run opposite ways** — a mistake already made once
in the CLI tool:

- **Confidence** 0→1: low is alarming, high is calm
- **Margin** 0→1: low is alarming, high is calm, but **0.3 already means
  decisive**. A margin of 0.39 is healthy and must not render as a warning.

Suggested palette direction: deep indigo (নীল — a genuinely Bangladeshi
reference) as the confirmed state, warm amber for uncertainty, warm off-white
ground. Avoid red for "needs review" — it is not an error, it is honesty.

**Typography:** needs a Bangla + Latin pairing that works at both ends. Noto
Sans Bengali with Inter, or Hind Siliguri. Test at 14px on a cheap Android
screen before committing — many Bangla webfonts fall apart at small sizes with
conjuncts.

---

## 5. What the backend actually gives you today

Be precise about this, because most of the admin console has **no API yet**.

### Exists and works

```http
GET  /health
     → { ok, asr, llm }

POST /api/observations              Authorization: Bearer <rep token>
     { clientUuid, audioBase64, mimeType, geo: {lat,lng}|null,
       declaredOutletId: string|null, recordedAt: ISO8601 }
     → 202 { clipId, status: "queued", duplicate: false }
     → 200 { clipId, status, duplicate: true }     // repeated clientUuid

GET  /api/clips/:clipId             Authorization: Bearer <rep token>
     → { clipId, status: queued|processing|processed|failed,
         observationCount, transcriptText, error }
```

**Socket.IO** — `emit("join", companyId)` then:

```
clip:status            { clipId, status, error? }
observations:created   Observation[]
observation:updated    Observation
```

`Observation` shape: `shared/observation.schema.ts`. Import the Zod types via
the `@shared/*` alias — never hand-copy them, or the two sides drift within
days.

### Needs building before the matching screen can exist

| Screen | Missing API |
|---|---|
| Clarification | `GET /api/clarifications`, `POST /api/clarifications/:id/answer` |
| Today | `GET /api/observations` (list, filter, paginate) |
| Intelligence | aggregation endpoints; audio playback URL |
| Review queue | `GET /api/review`, `POST /api/observations/:id/correct` |
| Alias approvals | `GET /api/aliases/pending`, `POST /api/aliases/:id/approve` |
| Catalog | `POST /api/catalog/import`, `GET /api/skus` |
| Reps | `GET/PATCH /api/reps`, invite generation |

**Plan the frontend around this.** Building a screen whose API does not exist
means mocking it twice.

---

## 6. Technical decisions

**Stack:** React 19 + Vite + TypeScript, matching the repo. TanStack Query for
server state, Zustand for local. Zod types imported from `shared/`.

**PWA is required, not optional** — the offline queue is the whole point:

```
IndexedDB queue  →  each clip: { clientUuid, blob, geo, recordedAt, attempts }
Service worker   →  background sync on reconnect
Cache            →  app shell offline-first
```

`clientUuid` is generated **on the client** and is the idempotency key. The
server dedupes on it, so retrying an upload is always safe.

**Audio capture:** `MediaRecorder` → opus/webm, 16 kHz mono. Do not send WAV —
it is roughly ten times the bytes on a 3G field connection.

**Two entry points, two builds.** Field app and admin console should not ship
each other's JavaScript. The rep is on a cheap phone and a metered connection.

---

## 7. Build order — 12 days to 30 August

Sequenced by what unblocks the demo, not by what is satisfying.

| Priority | Work | Why |
|---|---|---|
| **1** | Record screen + IndexedDB queue + upload | Without this there is no demo at all |
| **2** | Clip status feedback | The rep must see his voice became data |
| **3** | Admin: Today + live feed | The realtime moment at the booth |
| **4** | Admin: Review queue with audio + confidence shading | Shows the thesis visually |
| **5** | Clarification screen | Best interaction moment; needs backend first |
| **6** | Alias approvals | Best *story* moment — the flywheel |
| **7** | Intelligence charts | Highest business value, lowest demo risk if cut |
| — | Catalog, Reps, Settings | Static mockups on the poster |

**Cut from the bottom.** Items 6 and 7 can be static screenshots on the poster
without anyone noticing; item 1 cannot.

---

## 8. Exhibition mode — design for a booth, not a stage

BrainChild is hours of open Q&A with strangers walking up, not a seven-minute
talk. That changes what to build:

- **A kiosk/demo mode** with a printed prompt card: *"Try saying: …"*. Rails,
  not an open mic — a stranger's dialect producing visible garbage in front of
  a judge is the worst moment available.
- **Degrade visibly, not silently.** When confidence is low the UI should *say
  so*. That turns a failure into a live demonstration of the gating.
- **Must survive hours.** No memory leaks, no unbounded lists, no socket that
  dies quietly after an hour.
- **Offline backup is a requirement.** The backend already has a demo mode that
  needs no network; the frontend must not assume connectivity either.
- **Two screens if possible:** the field app on a phone, the admin dashboard on
  a laptop, updating live as someone speaks. That side-by-side *is* the demo.

---

## 9. What to hand the designer

1. This document
2. The four field-app screens and seven admin screens above
3. The confidence colour language (§4) — the most important part
4. Real Bangla copy, not lorem ipsum. Bangla text sets differently from Latin
   and a layout that works with placeholder English will break.
5. The constraint list from §2, framed as constraints rather than suggestions

Ask for **mobile-first at 360×640** for the field app. That is a common cheap
Android resolution in Bangladesh, and a design that survives it will survive
anything.

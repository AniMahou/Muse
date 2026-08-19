# Muse — Stitch design brief

Copy-pasteable prompts for Google Stitch, plus the design system behind them.

---

## Read this first: one deliberate split

You asked for glassmorphism, animation and Lottie. **Yes for the admin console.
Partly no for the field app** — and the reason is not taste.

| | Field app | Admin console |
|---|---|---|
| Where it's used | Karwan Bazar, midday sun, cracked Android | Office, 1440px laptop |
| Connection | 3G that drops between shops | Wifi |
| Session | 15 seconds, forty times a day | 20 minutes |
| Full glassmorphism | ⚠️ frosted panels lose contrast in sunlight | ✅ ideal |
| Heavy Lottie | ⚠️ bundle + battery on a metered connection | ✅ ideal |

Frosted translucent surfaces are gorgeous indoors and nearly unreadable
outdoors. A rep who cannot read the screen stops using the app, and then there
is no data and no product.

**So: one visual family, two dialects.**

- **Field app** — a *dark* base with **restrained** glass: depth and blur on
  cards, but text and controls at full opacity and high contrast. Dark UI also
  beats white outdoors, because glare on a bright screen is worse than on a
  dark one. The "wow" comes from a **live audio waveform**, which is both the
  most striking thing on screen and genuinely functional.
- **Admin console** — full glassmorphism, depth, blur, animated charts, Lottie
  everywhere it helps.

You lose nothing at the exhibition. Judges will see the console on a laptop
beside the phone, and the console is where the visual points are.

---

## Global style preamble

**Paste this at the top of every Stitch prompt.**

```
STYLE SYSTEM — "Muse"

Dark, premium, glassmorphic. Deep indigo-black base with frosted translucent
surfaces, soft inner glow, and a single vivid indigo→violet accent gradient.
Feels like a modern analytics product, not a form.

COLOURS
  base          #0A0E1A   deepest background
  base-raised   #0F1424   secondary background
  glass         rgba(255,255,255,0.06) with 20px backdrop blur
  glass-border  rgba(255,255,255,0.10), 1px
  accent        #4F46E5 → #7C5CFF  (indigo→violet gradient)
  confident     #10B981   confirmed / high confidence
  uncertain     #F59E0B   needs clarification / flagged
  danger        #EF4444   used sparingly, errors only
  text          #F8FAFC primary · #94A3B8 secondary · #64748B muted

THE ONE RULE THAT MATTERS — saturation = certainty
  Confirmed data      full saturation, crisp
  Uncertain data      amber accent, slightly desaturated
  Raw machine output  desaturated wash until judged
Confidence is the product's whole thesis; the UI should show it without words.

TYPOGRAPHY
  Latin headings   Space Grotesk, tight tracking
  Latin body       Inter
  Bangla           Hind Siliguri or Noto Sans Bengali (MUST render conjuncts
                   cleanly at 14px — test যুক্তাক্ষর before committing)
  Numbers          tabular figures everywhere

SHAPE & DEPTH
  radius 16px cards, 12px controls, 999px pills
  layered shadows, never a hard 1px border alone
  subtle noise/grain overlay at 3% opacity for texture

ICONS
  Phosphor Icons, duotone weight. Accent colour on the secondary layer.

MOTION
  Entrances: 300ms cubic-bezier(0.22, 1, 0.36, 1), staggered 40ms
  Never animate anything that repeats in a long list.
```

---

## FIELD APP — 4 screens

Device: **mobile 360×800**. Bangla-first — no language toggle anywhere.

### 1 · Record (the screen that matters)

```
Screen: Muse field app — RECORD. Mobile 360x800, dark glassmorphic, Bangla UI.

TOP: slim glass status bar. Left "আজ: ৩৪টি দোকান · ১২ ভিজিট". Right a small
circular progress ring at 35%.

UPPER: glass card with a location pin icon, "বিজয় স্টোর?" in large Bangla,
below it "১৮ মিটার দূরে" muted. Two pill buttons: "হ্যাঁ" filled with the
indigo→violet gradient, "অন্য দোকান" ghost with a glass border.

CENTER — the hero, ~55% of the screen:
A large circular record button, 200px, indigo→violet gradient, glowing soft
outer halo. Concentric translucent rings pulse outward from it. A live audio
waveform arcs around the circle as thin vertical bars in the accent gradient.
Inside, a duotone microphone icon and "ধরে বলুন" beneath.

BOTTOM: glass tray listing recent clips. Each row: small waveform thumbnail,
duration, and a status pill — "পাঠানো হয়েছে" green, "পাঠানো হচ্ছে" amber with
a progress bar, "অপেক্ষমাণ" muted with an offline cloud icon.

MOOD: confident, tactile, one-handed. The record button must be the only thing
the eye goes to. Everything reachable in the bottom two thirds.
```

### 2 · Clarification

```
Screen: Muse field app — CLARIFICATION. Mobile 360x800, dark glassmorphic, Bangla.

HEADER: "৩টি বিষয় নিশ্চিত করুন", with three small dots showing progress.

Stacked glass question cards, the front one prominent and the others peeking
behind with reduced opacity and scale, like a deck.

FRONT CARD:
 - a waveform audio player with a circular gradient play button and elapsed time
 - the question in large Bangla: "বিজয় স্টোর নাকি রহমান স্টোর?"
 - two large stacked answer buttons, each a glass pill with the shop name and a
   faint confidence bar underneath
 - a small ghost "অন্য কিছু" link below

Answering slides the card away and brings the next forward.

MOOD: fast, effortless, finishable in fifteen seconds. Big tap targets. This
must never feel like a form.
```

### 3 · My day

```
Screen: Muse field app — MY DAY. Mobile 360x800, dark glassmorphic, Bangla.

TOP: greeting "রহিম উদ্দিন", territory chip "মিরপুর-২".

Three glass stat cards in a row with duotone icons and large tabular numbers:
outlets visited, clips recorded, time on route. Each with a faint sparkline.

Below: a vertical timeline of today's outlets. Each entry is a glass row with
a small waveform, the shop name in Bangla, time, and a status dot. Visited
entries in full colour; upcoming ones desaturated.

BOTTOM: fixed glass tab bar with 4 duotone icons, the record tab a raised
gradient circle breaking above the bar.
```

### 4 · Onboarding

```
Screen: Muse field app — ONBOARDING. Mobile 360x800, dark glassmorphic, Bangla.

Three sequential cards:
1. Company logo on a glass card, "আপনার প্রোফাইল", name and territory shown,
   with a large gradient "শুরু করুন" button.
2. A 4-digit PIN entry: four large glass boxes and a custom numeric keypad.
3. A tutorial card showing an example sentence in Bangla inside a speech
   bubble — "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে" — with an animated
   waveform and a prompt to try saying it.

MOOD: welcoming, three steps, no reading required.
```

---

## ADMIN CONSOLE — 7 screens

Device: **desktop 1440×900**. Full glassmorphism. English UI, Bangla data.

### 5 · Today (landing)

```
Screen: Muse admin — TODAY. Desktop 1440x900, dark glassmorphic analytics dashboard.

LEFT: 72px glass icon rail, duotone Phosphor icons, the active one with a
gradient pill highlight.

TOP: six KPI cards in a row — glass, large tabular numbers, tiny sparklines,
duotone icons, coloured glow matching each metric's state.
Observations Today · Active Reps · Outlets Covered · Needs Review ·
High Severity · Avg Confidence.

CENTER LEFT (60%): "Live Feed" — a scrolling column of glass observation cards.
Each: type badge, outlet name, product chip, a quantity in tabular figures, a
Bangla verbatim quote in muted italic, a small waveform play button, and a
confidence ring on the right (green confirmed / amber needs review). Newest
card enters with a soft gradient flash.

CENTER RIGHT (40%): a dark map panel with glowing outlet markers, a heat glow
over active clusters, and an alert strip beneath: "3 high-severity competitor
promos — Mirpur zone".

MOOD: a live operations room. Premium, calm, data-dense but not cramped.
```

### 6 · Intelligence ⭐

```
Screen: Muse admin — INTELLIGENCE. Desktop 1440x900, dark glassmorphic analytics.

TOP: date range pills and brand/region filter chips in glass.

GRID:
 - Large "Competitor Share of Voice" stacked area chart, glowing gradient fills,
   soft grid lines
 - "Stock-out Heatmap": outlets × SKUs grid, cells glowing from transparent to
   amber to red by frequency
 - "Price Erosion": horizontal bars extending left for negative deltas, in a
   red-amber gradient
 - "Emergent Themes": floating glass pills sized by frequency
 - "Rep Coverage": a table with avatar, name, territory, and a confidence bar

EVERY chart element is clearly clickable — on hover a glass tooltip appears
with a small ▶ play icon and the words "hear the source".

MOOD: an executive dashboard someone would pay for. This is the screen that
sells the product.
```

### 7 · Review queue

```
Screen: Muse admin — REVIEW QUEUE. Desktop 1440x900, dark glassmorphic.

LEFT (30%): a queue list of glass cards, each with a mini waveform, timestamp,
rep name and an amber confidence ring. The selected one has a gradient border.

RIGHT (70%): the detail panel.
 - a large waveform player with a gradient scrubber and timestamps
 - the Bangla transcript in large type where EACH WORD is shaded by confidence:
   bright white for confident, amber for uncertain, dim for very uncertain —
   the visual centrepiece of this screen
 - an "Extracted" glass card with field rows: label, value, confidence bar,
   and an amber warning icon on flagged fields
 - three actions: "Confirm" gradient, "Correct" glass, "Discard" ghost

MOOD: forensic. The reviewer should instantly see WHERE to listen.
```

### 8 · Alias approvals ⭐ (best demo screen)

```
Screen: Muse admin — ALIAS APPROVALS. Desktop 1440x900, dark glassmorphic.

Header: "Teach Muse" with a subtitle "Approve once. It never asks again."

Centered stack of large glass cards. The front card:
 - big Bangla text of the misheard form: "হইল"  — with a "heard 7 times this
   week" pill
 - a wide arrow in the accent gradient
 - the suggested product: "Wheel (COMP-WHEEL)" with a 0.79 confidence ring
 - a row of 7 small waveform chips, each playable, so a reviewer can listen
 - actions: "Approve" gradient, "Map to another product" glass with a search
   field, "Reject" ghost

Behind it, the next cards peek with reduced scale and opacity.

MOOD: satisfying and decisive — a teaching moment, not data entry. Approving
should feel great.
```

### 9 · Catalog

```
Screen: Muse admin — CATALOG. Desktop 1440x900, dark glassmorphic.

TOP: a drag-and-drop CSV zone — a large dashed glass panel with an upload
duotone icon, "Drop your SKU master here", and a subtitle "Imports from SAP or
your DMS. Muse is not the system of record."

Below: a glass data table of SKUs with columns for ID, name, brand,
manufacturer, pack, and a "resolver accuracy" column shown as a small bar with
a percentage. Rows below 80% carry an amber dot.

RIGHT DRAWER (when a row is selected): attached aliases as chips, mention
frequency sparkline, and recent clips mentioning it.

Show an import-result state: "1,997 imported · 3 skipped" with the skipped rows
expandable and each showing its line number and reason.
```

### 10 · Reps & territories

```
Screen: Muse admin — REPS. Desktop 1440x900, dark glassmorphic.

A grid of rep cards. Each glass card: avatar with a gradient ring, name,
territory chip, brand-portfolio chips, and three stats — clips this week,
outlets covered, average confidence shown as a coloured bar.
Cards below 0.7 average confidence carry a subtle amber glow and a small
tooltip: "low confidence often means dialect, mic quality or noise".

RIGHT PANEL when selected: territory dropdown, a multi-select brand portfolio
with chips, and an information callout in a glass box:
"Portfolio scoping narrows the search from 2,000 SKUs to ~150 — it raises
accuracy, it isn't bookkeeping."

Plus an "Invite rep" button producing a QR code on a glass card.
```

### 11 · Settings (mock only)

```
Screen: Muse admin — SETTINGS. Desktop 1440x900, dark glassmorphic.

Left sub-nav; right a form of glass panels: confidence threshold with a
gradient slider, critical-field toggles, clarification timeout, integrations
(SAP, CSV, webhook) as connect cards, and a roles table. Static.
```

---

## Motion & Lottie

**Where Lottie genuinely helps** — one per state, never inside a list:

| Where | Animation |
|---|---|
| Record button idle | slow breathing pulse ring |
| Recording | live waveform (real audio data, not canned) |
| Upload success | quick gradient checkmark draw |
| Processing | voice-wave morphing into small data bars — literally the product |
| Empty: no clarifications | calm illustration, "সব ঠিক আছে ✓" |
| Empty: no pending aliases | "Muse has nothing to ask" |
| Alias approved | brief confetti burst — earn the satisfaction |

**Where Lottie hurts:** inside any repeating row, on the field app's main path,
anything above ~50KB.

**CSS motion, both apps**

```
Card entrance   translateY(12px) + fade, 300ms, 40ms stagger
Number change   count-up over 600ms, tabular figures so nothing reflows
Chart draw      path draw-on 800ms ease-out
Glass hover     border-opacity 0.10→0.20, lift 2px
Confidence ring stroke-dashoffset sweep on mount
Waveform        real-time bars from the Web Audio API
```

**Respect `prefers-reduced-motion`** — replace movement with fades. Judges
sometimes have it on, and it is a real accessibility signal.

---

## Assets to gather

- **Phosphor Icons** (duotone) — `@phosphor-icons/react`
- **Fonts** — Space Grotesk, Inter, Hind Siliguri (all Google Fonts)
- **Lottie** — `lottie-react`; source from LottieFiles, recolour to the palette
- **Noise texture** — a 3% opacity grain PNG for glass surfaces

---

## When Stitch gets it wrong

Stitch drifts in predictable ways. Push back with these:

| It does | Say |
|---|---|
| Light mode | "Dark base #0A0E1A. Never a white background." |
| Latin placeholder text | "Use the exact Bangla strings given. Do not translate." |
| Flat cards | "Frosted glass: translucent white 6%, 20px backdrop blur, 1px light border." |
| A tiny record button | "The record button is 200px and occupies 55% of the screen." |
| Red for 'needs review' | "Amber, not red. Uncertainty is honesty, not an error." |
| A cramped dashboard | "Generous whitespace. 24px gutters. Data-dense but calm." |
| A language toggle | "Field app is Bangla only. Remove any toggle." |

---

## Order to generate

1. **Record** — everything else is negotiable, this is not
2. **Today** — the live realtime moment at the booth
3. **Alias approvals** — the best story
4. **Review queue** — shows the thesis visually
5. **Clarification**
6. **Intelligence**
7. My day · Catalog · Reps · Settings · Onboarding

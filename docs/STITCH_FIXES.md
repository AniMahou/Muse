# Stitch — round 2 fixes

Review of the four generated screens. **Verdict: keep the design system.** It is
roughly 80% right and the palette, depth and layout language are all correct.
Four things need fixing, two of them serious.

---

## Screen-by-screen

| Screen | Verdict |
|---|---|
| **Today dashboard** | Excellent. Best screen of the four. Fix the quotes. |
| **Alias approvals** | Structurally perfect — and the hero text renders in the wrong script. |
| **Review queue** | Beautiful layout, **wrong product entirely**. Regenerate. |
| **Record** | Directionally right, four specific fixes. |

---

## 🔴 Critical 1 — the Bengali font is missing on three screens

Proven root cause, not a guess:

```
✓ record_field_app        Hind Siliguri loaded
✗ alias_approvals_admin   NO Bengali font
✗ review_queue_admin      NO Bengali font
✗ today_dashboard_admin   NO Bengali font
```

That is exactly why **হইল renders as Devanagari `हइेल`** on the alias screen —
the browser falls back to whatever Indic font it can find. It is the hero text,
in 60px, on your single best demo screen, in the wrong writing system. A
Bangladeshi judge will notice in under a second.

It is also why the Today feed quotes came out romanised (`"Dove er stock
shesh..."`) instead of Bengali script.

**Add to every prompt, verbatim:**

```
CRITICAL — FONTS
Load Hind Siliguri from Google Fonts and apply it to ALL Bangla text:
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
  font-family: 'Hind Siliguri', 'Noto Sans Bengali', sans-serif;
Every Bangla string MUST render in Bengali script (বাংলা), never Devanagari
(हिन्दी) and never romanised transliteration. Verify যুক্তাক্ষর conjuncts
render cleanly: প্রাণ, ম্যাঙ্গো, স্টোর, দেড়.
```

---

## 🔴 Critical 2 — the Review Queue is a different product

The layout is genuinely excellent — the per-word confidence shading is the best
thing in the whole set. But the content is a **call-centre helpdesk**:

> transcript: "হ্যালো, আমি আপনাকে কীভাবে সাহায্য করতে পারি? অ্যাকাউন্টে লগইন করতে সমস্যা হচ্ছে।"
> EXTRACTED ENTITIES — INTENT: Login Issue · ACCOUNT ID: AC-992-84X

Muse is field sales intelligence. There is no login, no account ID, no support
intent. Stitch fell back to a generic support use case.

**Regenerate with this prompt:**

```
Screen: Muse admin — REVIEW QUEUE. Desktop 1440x900, dark glassmorphic.

CRITICAL — FONTS
Load Hind Siliguri and apply it to all Bangla text. Bengali script only.

DOMAIN: This is FMCG FIELD SALES intelligence in Bangladesh. A distribution
representative records a voice note in a shop. There are no support tickets,
no login issues, no account IDs.

LEFT (30%): queue of glass cards. Each: timestamp, rep name (Rahim M.,
Salma A., Farhan A.), a mini waveform, and a confidence ring — 78%, 62%, 84%.
Selected card has a gradient border.

RIGHT (70%):
 - waveform player, gradient scrubber, duration 0:08 (field clips are SECONDS,
   never minutes)
 - the transcript in large Bengali, each word shaded by confidence:
   "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে, আর হুইল এর নতুন অফার
    দিছে পাঁচ টাকা কম"
   Confident words bright white; uncertain words amber with an underline —
   put the amber on "বিজয়" and "হুইল" specifically.
 - "EXTRACTED OBSERVATIONS" glass card with these rows:
      OUTLET       Bijoy Store (OUT-1182)     amber bar, warning icon
      PRODUCT      PRAN Mango Juice 250ml     green bar
      QUANTITY     18 piece                   green bar
      COMPETITOR   Wheel                      amber bar, warning icon
      PRICE DELTA  -৳5                        green bar
 - actions: "Confirm" gradient · "Correct" glass · "Discard" ghost

Fill the vertical space; no large empty area at the bottom.
```

---

## 🟠 Fix 3 — Today dashboard: quotes in Bengali script

Everything else on this screen is right. The outlet names (Bismillah Traders,
Mayer Doa General Store, Molla Enterprise) and products (Dove, Lux Pink,
Sunsilk Black, Lifebuoy) are convincingly Bangladeshi — keep all of it.

Replace the romanised quotes with Bengali script:

```
Regenerate the Live Feed verbatim quotes in BENGALI SCRIPT, not romanised:
  "ডাভ এর স্টক শেষ, এক সপ্তাহ ধরে নাই"
  "লাক্স পিংক টা নাই আজকে, কাল আসবে বলছে ডিস্ট্রিবিউটর"
  "দাম বেড়ে গেছে ভাই, ১৮০ টাকা নিলো একটা"
  "নতুন অফার দিয়ে গেছে, দুইটা কিনলে একটা ফ্রি দিচ্ছে"
  "হ্যাঁ স্টক আছে, মোটামুটি ৫০ পিস এর মতো থাকবে"

Also: confidence rings must read 74-94, never 98 or 99. This system's real
measured confidences are 0.74-0.90 and inflated numbers invite a question
we cannot answer well.

Any row with a ring below 80 must LOOK uncertain: amber ring, amber left
border, slightly desaturated card.
```

---

## 🟠 Fix 4 — Record screen: four specific changes

Good bones. Bangla throughout, correct gradient, pulse rings, glass tray.

```
Regenerate the Muse RECORD screen with these corrections:

1. RED IS WRONG for "পাঠানো হচ্ছে" (sending). Sending is normal progress, not
   failure. Use AMBER #F59E0B for the pill and its progress bar. Red is
   reserved for genuine errors. In this product uncertainty is honesty, never
   an error state.

2. THE RECORD BUTTON IS TOO SMALL and there is a large empty gap above it.
   Make it 220px and let it occupy roughly 55% of the screen height. Move it up
   to close the dead space between the outlet card and the button.

3. ADD THE LIVE WAVEFORM — this is the centrepiece and it is missing. Thin
   vertical bars in the indigo→violet gradient, arranged in a ring around the
   circular button, varying in height like a real audio meter. This is the
   single most striking element on the screen.

4. CLIP NAMES ARE WRONG. Not "অডিও ক্লিপ_১". Show the outlet instead:
   "বিজয় স্টোর · ০:১২", "রহমান স্টোর · ০:০৮". Durations are SECONDS —
   never ৮:৫২. Field clips are 8-20 seconds.

5. Remove the English word "Record" from the header. This app is Bangla only.

Keep everything else: the dark base, gradient button, pulse rings, the glass
outlet-confirm card, Bengali numerals (৩৪, ০:১২), and the bottom tab bar with
the raised centre button.
```

---

## Minor, only if you regenerate anyway

- `CONSOLE V2.4` is an invented version number. Either drop it or make it
  `BETA`.
- Audio durations of 3:45 and 8:52 are wrong throughout — field clips are
  seconds.
- The Today feed shows no `needs_clarification` state. One card with an amber
  border and a small "3 fields unconfirmed" chip would demonstrate the
  confidence gating, which is the product's whole argument.

---

## What NOT to change

Resist the urge to tune these — they are already right:

- the palette (`#0A0E1A` base, `#4F46E5→#7C5CFF` accent, `#4EDEA3` green)
- glass depth, blur and border treatment
- the Today dashboard layout and its Bangladeshi outlet and product names
- the alias screen's structure — "Teach Muse / Approve once. It never asks
  again." is exactly right
- the per-word confidence shading in the review queue, which is the strongest
  single idea in the set
- the icon rail and Phosphor/Material duotone icon style

---

## Order to regenerate

1. **Alias approvals** — font fix only, and it becomes your best demo screen
2. **Review queue** — full regenerate, wrong domain
3. **Today** — quotes and confidence values
4. **Record** — the four fixes above

Then generate the remaining seven screens from `STITCH_PROMPTS.md`, with the
font block added to every one.

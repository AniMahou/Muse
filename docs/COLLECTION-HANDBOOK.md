# Collection handbook

**Self-contained. If you get stuck, paste this whole file into ChatGPT along with the exact
error you saw, and it will have everything it needs to help you.** You do not have to wait
for anyone.

`COLLECTION.md` is the short version — what to do. This is the long version — what each
step *is*, why it exists, and what every error message means.

---

## 1 · How to ask an AI for help with this

Paste, in this order:

1. this entire file
2. the command you ran
3. the **complete** terminal output, not a cropped screenshot
4. your OS — Windows 10 / Windows 11 / Ubuntu / etc.

Then ask your question. Everything the model needs about the project is below, so it will
not have to guess.

**Two things to tell it not to do**, because a confident wrong suggestion here costs real time:

- **Do not suggest editing any file under `backend/src/`.** That is application code and is
  not your job. If a fix seems to require it, the answer is wrong — message Tabib instead.
- **Do not invent product or shop IDs.** They come from a fixed list, reproduced in §8.

---

## 2 · What the project is

Muse turns a Bangla voice note from a field sales rep into structured data. A rep says
*"Bijoy Store needs one and a half dozen PRAN mango juice, and Wheel has a new offer five
taka cheaper"* and the system produces two records: an order for 18 units of a specific
product at a specific shop, and a competitor promotion with a price change.

The interesting claim, and the reason your work matters: **Bangla speech recognition gets
roughly a third of the words wrong on real field audio.** Muse is built so the transcript
does not have to be right — only the extracted *fields* do. It recovers accuracy with a
Bangla number grammar and by matching against a fixed product catalogue, rather than by
hoping for a better speech model.

That claim has never been measured. The measurement system is built and has never run,
because there is no labelled data. That is what you are producing.

There is a presentation on **Sunday 30 August**. Every number that can be shown is blocked
on this and nothing else.

---

## 3 · What your job is, in one sentence

Record 40 short Bangla clips from a set of prepared scenarios, write down what was actually
said in each, and check it validates.

You do **not** write code, run a server, use a database, or need an API key.

---

## 4 · The mental model

There are two halves to a labelled clip, and they are kept apart deliberately.

```
   ALREADY DONE (Tabib)                        YOUR JOB
   ───────────────────                         ────────
   ground-truth.csv                            clips.csv
   the answer key                              what was actually said
   "card 7 means: order,                       "clip-07-a was card 7,
    Sunsilk, 30 pieces,                         spoken by Rafi, in a
    at New Alam"                                noisy market, and he
                                                actually said: ..."
                         │                          │
                         └──────────┬───────────────┘
                                    │  joined on card_id
                                    ▼
                          datasets/labels/*.json
                                    │
                                    ▼
                        the evaluation reads these,
                        runs the real pipeline on your
                        audio, and compares its output
                        to the answer key
```

**Why you never label products or quantities.** The answer key was written *before* any
audio existed. Deciding after the fact whether a clip contains an "order" or a "complaint"
is a judgement call, and when two people make that call differently the metrics quietly
become wrong in a way nobody notices for a week. So the scenarios were fixed in advance and
you only record them.

**This is why the `notes` column matters.** If the speaker drifted off-card — said a
different shop, a different product, a different number — then the answer key is now wrong
*for that clip*. Write it in `notes` and it gets fixed. Leave it silent and the system gets
marked wrong for an error it did not make.

---

## 5 · The files

Everything is under `backend/`. Run all commands from there.

| path | what it is | who writes it |
|---|---|---|
| `datasets/CRIB.md` | every valid product and shop ID | generated |
| `datasets/raw/ground-truth.csv` | the answer key, one row per expected observation | Tabib, already done |
| `datasets/raw/clips.csv` | **your work** — one row per clip | you |
| `datasets/raw/clips.example.csv` | three filled example rows to copy the shape from | reference |
| `datasets/clips/*.wav` | the audio | created by `npm run mic` |
| `datasets/labels/*.json` | the finished labels | created by `npm run labels:build` |
| `../docs/CARDS.md` | the 25 scenarios you record | read this |

Audio never goes into git — it is large and deliberately ignored. Only the CSV and the JSON
labels get committed.

---

## 6 · The commands, and what each actually does

Run every one of these from the `backend` folder.

> **Windows note.** PowerShell 5.1, the default on Windows 10, does **not** support `&&`.
> Run each command on its own line. If you see `The token '&&' is not a valid statement
> separator`, that is this and nothing else.

### `npm install`

Downloads the project's dependencies into `node_modules/`. Once per machine. Takes a minute
or two. Warnings about deprecated packages are normal and harmless.

### `ffmpeg -version` and `ffprobe -version`

`ffmpeg` records and converts audio; `ffprobe` reads how long a file is. They ship together
but **both must be on PATH** — the tools call each one separately, and having only one is a
confusing half-failure.

Install: Windows `winget install Gyan.FFmpeg`, Ubuntu `sudo apt install ffmpeg`,
macOS `brew install ffmpeg`.

**On Windows you must close and reopen the terminal afterwards.** PATH is read when a
terminal starts, so an already-open one cannot see a program installed a moment ago. This
is the single most common false alarm.

### `npm run mic -- --devices`

Asks ffmpeg what microphones exist and prints them. Changes nothing. Run it first.

Each operating system exposes audio differently — `dshow` on Windows, `pulse` on Linux,
`avfoundation` on macOS — and the tool picks the right one for you. Windows is the awkward
case: it has no "default microphone" concept at this level and needs the device's exact
name, so the tool lists them and takes the first. If that is the wrong one, pass the right
name with `--device`.

### `npm run mic`

The main tool. Starts an interactive loop:

```
  clip > 1a
  press ENTER to start clip-01-a
  ● RECORDING clip-01-a   — speak now, press ENTER to stop
  saved clip-01-a  12.4s

  clip > 
```

- Type a card number and take letter: `1a`, `7b`, `16a`. Just `7` means `7a`.
- ENTER starts. ENTER stops. A blank line at the `clip >` prompt ends the session.
- Saves straight to `datasets/clips/clip-01-a.wav` as 16kHz mono, which is what the
  speech model wants.
- Asks before overwriting an existing clip, so mistakes are free.
- Ctrl-C stops safely — it closes the recording properly rather than killing it, which
  would leave a file that looks fine and contains silence.

**Why it says "opening the microphone..." sometimes.** Opening a microphone is not instant:
about a second normally, and several seconds the first time, while the operating system
initialises the device or asks for permission. If the tool said "speak now" the moment it
started, the first few seconds of your clip would be lost — and a clip missing its opening
words has a transcript that can never be right, which would then be counted against the
system as *its* mistake. So it waits until audio is genuinely being recorded.

**This is why you must not speak until `● RECORDING` appears.**

### `npm run mic -- 1a`

Records exactly one clip and exits. Same thing, non-interactive.

### `npm run collect -- <folder>`

Only needed **if you recorded on a phone instead**. Takes a folder of recordings, converts
each to the right format, and puts them in `datasets/clips/`. Files must already be named
`clip-01-a.m4a` and so on. Safe to re-run — clips already ingested are skipped.

```
npm run collect -- "C:\Users\you\Desktop\muse-clips"
npm run collect -- ~/Desktop/muse-clips
```

### `npm run labels:check`

**Run this constantly.** It reads both CSVs, cross-checks everything, and prints problems
with the **spreadsheet row number**. It writes nothing, so it is always safe.

It checks: every clip has audio; every ID exists in the catalogue; nothing is duplicated;
no required field is blank; the enums are spelled correctly. It also reports progress
towards the collection targets.

### `npm run labels:build`

The same checks, but on success writes `datasets/labels/*.json`. Run it once at the end,
after `labels:check` is clean.

---

## 7 · Every error message

### From `npm run mic`

**`ffmpeg and ffprobe must both be installed and on PATH.`**
One or both is missing. Install ffmpeg, then **reopen the terminal**. Verify both commands
separately.

**`the microphone did not start`**
ffmpeg opened but no audio arrived within 15 seconds. Usually the wrong device.

```
npm run mic -- --devices
```

then pass the right one:

```
npm run mic -- 1a --device "Microphone (Realtek(R) Audio)"
```

On Linux, try `--device default`, and if the device list is empty install
`pulseaudio-utils`. On Windows, check the microphone is not muted in Sound settings and
that the terminal has microphone permission (Settings → Privacy → Microphone).

**`ffmpeg failed:` followed by ffmpeg's own output**
Read the ffmpeg lines underneath — that is the real error. `Could not find audio only
device` or `I/O error` both mean the device name is wrong.

**`thin — under two seconds, record it again`**
You pressed ENTER to stop too quickly, so the clip is nearly empty. It is not saved as
usable. Record it again.

**`"x" is not a clip id`**
The format is card number plus take letter. `1a`, `7`, `16b`, or the full `clip-16-b`.

### From `npm run labels:check` and `labels:build`

Every message names the file and row, e.g. `clips.csv:14` means row 14 of your sheet.

**`no audio at datasets/clips/clip-09-b.wav`**
The sheet has a row for a clip that was never recorded, or `clip_id` is misspelled. Check
the spelling first — `clip-9-b` is wrong, it must be `clip-09-b` with two digits.

**`clip_id "..." must look like clip-01-a`**
Two digits for the card, one lowercase letter for the take.

**`clip_id "..." appears twice`**
Two rows have the same clip. Delete one, or fix the take letter — a second recording of
card 1 is `clip-01-b`, not another `clip-01-a`.

**`card_id "99" has no rows in ground-truth.csv`**
Cards are numbered 1 to 25.

**`transcript_bn is empty — write what was actually said`**
That column cannot be blank. It is the reference the accuracy is measured against.

**`noise "shouting" must be quiet, moderate or loud`**
Exactly those three words, lowercase.

**`dialect "sylhet" — this clip WILL BE EXCLUDED from the evaluation`**
A warning, not an error. The evaluation only covers Dhaka-standard Bangla and drops
everything else. The clip is wasted — record that card again with a Dhaka-standard speaker.

**`sku_id "SKU-999" is not in the catalogue`** or **`outlet_id "OUT-9999" is not in the
catalogue`**
An ID that does not exist. Valid ones are in §8 below and in `datasets/CRIB.md`. You should
not normally hit this, since you do not fill in IDs — if you do, tell Tabib, because it
probably means the answer key has a typo.

**`"COMP-WHEEL" is a competitor — it belongs in competitor_brand, not sku_id`**
Competitor products live in a different column from our own. Same for the reverse message.
Again, tell Tabib — this is the answer key's problem, not yours.

**`PowerShell: The token '&&' is not a valid statement separator`**
Run each command on its own line.

---

## 8 · Reference: the valid IDs

You should not need to type these, but an AI helping you will want to see them.

**Our products** — `SKU-404` PRAN Mango Juice · `SKU-407` PRAN Mango Drink ·
`SKU-410` PRAN Litchi Juice · `SKU-420` PRAN Chanachur · `SKU-501` Surf Excel Powder ·
`SKU-502` Lux Soap · `SKU-504` Sunsilk Shampoo · `SKU-505` Clear Shampoo ·
`SKU-503` Harpic · `SKU-601` Colgate

**Competitors** — `COMP-WHEEL` Wheel · `COMP-WHITEPLUS` White Plus · `COMP-RIN` Rin Powder

**Shops** — `OUT-1182` Bijoy Store · `OUT-1183` Rahman Store ·
`OUT-1184` New Alam Enterprise · `OUT-1185` Shanto General Store

**Observation types** — `demand_signal` (wants to order) · `stock_out` (run out) ·
`competitor_promo` (rival's offer) · `price_change` (our price moved) ·
`retailer_complaint` · `posm_issue` (poster or display problem)

**Bangla quantities** — the resolved number, never the words. দেড় ডজন is 18, not 1.5.

| spoken | value |
|---|---|
| আধা | 0.5 |
| দেড় | 1.5 |
| আড়াই | 2.5 |
| সাড়ে X | X + 0.5 |
| সোয়া X | X + 0.25 |
| **পৌনে X** | **X − 0.25** — it subtracts |
| ডজন | × 12 |
| হালি | × 4 |
| কুড়ি | 20 |

---

## 9 · Your sheet's columns

| column | example | notes |
|---|---|---|
| `clip_id` | `clip-07-a` | exactly the filename, no `.wav` |
| `card_id` | `7` | which card, 1–25 |
| `transcript_bn` | `নিউ আলম এ সানসিল্ক শ্যাম্পু আড়াই ডজন লাগবে` | **what was said**, word for word |
| `speaker` | `rafi` | short name, consistent across rows |
| `noise` | `moderate` | `quiet` / `moderate` / `loud` |
| `dialect` | `dhaka` | leave as `dhaka` unless it genuinely was not |
| `notes` | | only if the speaker went off-card |

**`transcript_bn` is the one that matters.** Write what was *said*, not what the card asked
for. If the speaker said প্রান instead of প্রাণ, or fumbled a word, or repeated himself,
write that. Tidying it up makes our headline accuracy number wrong in our own favour, which
is the one kind of error that would actually damage us on Sunday.

---

## 10 · What "done" looks like

```
npm run labels:check
```

```
  ✓ 40 clip(s) valid · 40 usable in the evaluation
    noise    quiet 13 · moderate 13 · loud 14
    speakers 4
    12 clip(s) carry more than one observation
```

No red lines, and no "Still to do" list. Then:

```
npm run labels:build
```

```
git add datasets/raw/clips.csv datasets/labels
```

```
git commit -m "data: labelled field clips"
```

```
git push
```

### The one hard rule

**Never commit anything under `backend/src/`.** That is application code, Tabib is editing
it at the same time, and a stray commit there causes a merge conflict at the worst possible
moment. Data files only.

---

## 11 · When to stop and message Tabib

Most things you can solve yourself or with an AI. These you should not:

- **After your first five clips.** This is planned — record cards 1 to 5, then stop and
  wait for the go-ahead before doing the other 35. He runs those five through the real
  pipeline first. If something about the audio is wrong, it is much better to discover it
  on five clips than on forty.
- **Any error mentioning the catalogue** (`not in the catalogue`, `is a competitor`).
  That is the answer key's problem, not yours.
- **An AI tells you to edit something under `backend/src/`.** The advice is wrong.
- **Anything that would make you record fewer than 40 clips, or record them all quietly.**
  Those two decisions change what we can claim on Sunday, so they are his to make.

When you message him, send the command, the full output, and your OS. Not a screenshot of
part of it.

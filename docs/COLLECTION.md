# Field clip collection

Everything you need to collect and label the evaluation set. You will not need to
change any code.

**Target: 40 clips, labelled and validated, by Thursday evening.**

---

## Why this matters more than it looks

Muse claims something specific: Bangla speech recognition gets roughly a third of the
words wrong on real field audio, and the system extracts the right **shop, product and
quantity anyway** — because it recovers the fields rather than the transcript.

We have never measured that. The evaluation harness is built, gated and has never run,
because there is no labelled data. Every number we cannot give on Sunday is blocked on
this and nothing else. It is the only task on the project that no amount of coding
substitutes for.

---

## One-time setup — about fifteen minutes

### A note on `&&`

Windows PowerShell 5.1 — the default on Windows 10 — does **not** support `&&`. Every
command below is therefore written on its own line. Run them one at a time and it works
in PowerShell, in cmd, in Git Bash and on Linux alike.

### 1 · Get the code

```bash
git pull
```

```bash
cd backend
```

```bash
npm install
```

### 2 · Install ffmpeg

Check whether you already have it:

```bash
ffmpeg -version
```

If that fails:

| | |
|---|---|
| **Windows** | `winget install Gyan.FFmpeg` — then **close and reopen the terminal**, or PATH will not have updated |
| Windows, if winget is missing | `choco install ffmpeg` |
| Ubuntu / Debian / WSL | `sudo apt update` then `sudo apt install ffmpeg` |
| Fedora | `sudo dnf install ffmpeg` |
| macOS | `brew install ffmpeg` |

Then check again — **both** of these must print a version, because the collector uses
each of them:

```bash
ffmpeg -version
```

```bash
ffprobe -version
```

### 3 · Confirm the toolchain

From the `backend` folder:

```bash
npm run labels:check
```

It should print `0 clip(s) valid` and a list of what is still missing. That is success —
it means everything runs and there is simply no data yet.

You do **not** need Docker, MongoDB, Redis, or any API key. Nothing you run touches them.

## What you are recording

Open **[CARDS.md](CARDS.md)** on your phone. Twenty-five scenarios. You are a distribution
rep standing in a shop, reporting what you just saw.

For each card: read it, understand it, then **say it in your own words**. The Bangla line
is a suggestion, not a script — read it out flatly and the clip is useless, because read
speech and spoken speech sound different to a recogniser and spoken speech is what we are
testing.

### The four rules

**1 · Record on your phone, not a laptop.** The ordinary voice-recorder app is right.
A phone microphone in a market is the actual deployment condition; a laptop in a bedroom
is not.

**2 · A third of the clips must be genuinely noisy.** Roughly 13 quiet, 13 moderate,
14 loud — a real market, traffic, people talking over you.

> This is the one rule that decides whether the whole exercise was worth doing. Our entire
> claim is that the transcript comes out badly and the extracted fields come out right
> anyway. Record 40 quiet clips and the transcript comes out fine, so we will have proved
> nothing at all.

**3 · At least three different speakers, ideally four.** One voice measures one voice.
Ask friends. They do not need to understand the project — hand them a card.

**4 · Dhaka-standard Bangla only.** A strongly Chittagonian or Sylheti clip is silently
discarded by the evaluation. Label it honestly if it happens, but do not spend a card on it.

### Naming

Name each recording `clip-<card>-<take>`:

```
clip-01-a     card 1, first take
clip-01-b     card 1, again — different speaker or different noise
clip-16-a     card 16
```

Record all 25 cards once, then pick 15 and record them again with a different speaker or
noise level. That is 40.

Two digits for the card, always: `clip-07-a`, not `clip-7-a`.

---

## Getting clips onto the laptop

Move the files into one folder — AirDrop, a cable, Google Drive, whatever is easiest — then:

```bash
npm run collect -- "C:\\Users\\you\\Desktop\\muse-clips"
```

On Linux or macOS the path is the ordinary one:

```bash
npm run collect -- ~/Desktop/muse-clips
```

Quote the path if it contains a space. Run it from the `backend` folder.

That converts each recording to the format the pipeline wants and puts it in
`datasets/clips/`. Run it as often as you like; clips already ingested are skipped.

It will tell you if a file is named wrongly, or if a clip is under two seconds — which
usually means the recorder was stopped early and it needs redoing.

---

## Labelling

Open the shared sheet. You fill in **one row per clip**, six columns:

| column | what to write |
|---|---|
| `clip_id` | `clip-07-a` — exactly the filename, without the extension |
| `card_id` | `7` — which card it was |
| `transcript_bn` | **what was actually said**, word for word, in Bangla |
| `speaker` | a short name — `rafi`, `nabil` |
| `noise` | `quiet`, `moderate` or `loud` |
| `notes` | only if the speaker went off-card |

### `transcript_bn` is the real work

Write what was **said**, not what the card asked for. If the speaker said প্রান instead of
প্রাণ, or fumbled a word, write the fumble. This column is the reference the word error rate
is measured against, so tidying it up quietly makes our headline number wrong in our own
favour — which is the one kind of error nobody in the room on Sunday will forgive.

### You never label observations

You will notice there is no column for product, quantity or shop. That is deliberate.
The answer key was written in advance, in `ground-truth.csv`, and it is joined to your
row by `card_id`. Deciding what counts as a `demand_signal` is not your job and getting
it wrong would corrupt the metrics invisibly.

**That is also why the `notes` column matters.** If the speaker said a different shop, a
different product, or a different number from the card, the answer key is now wrong for
that clip. Write it down and it gets fixed. Leave it and it counts against the system as
an error the system did not make.

---

## Checking your own work

Export your sheet tab as CSV, save it to `backend/datasets/raw/clips.csv`, then:

```bash
npm run labels:check
```

It validates every row and prints the **spreadsheet row number** of anything wrong:

```
x clips.csv:14   sku_id "SKU-999" is not in the catalogue — see datasets/CRIB.md
x clips.csv:22   no audio at datasets/clips/clip-09-b.wav — run npm run collect
! clips.csv:31   dialect "sylhet" — this clip WILL BE EXCLUDED from the evaluation
```

It also reports progress towards the collection targets — clip count, the noise mix,
speaker count, how many clips carry more than one observation.

Fix, re-run, repeat until it is clean. Then:

```bash
npm run labels:build
```

```bash
git add datasets/raw/clips.csv datasets/labels
```

```bash
git commit -m "data: labelled field clips"
```

```bash
git push
```

Audio files stay out of git deliberately — they are large and `datasets/clips/` is
ignored. Share the raw recordings through Drive.

---

## The order to work in

**Wednesday morning.** Setup, then record **cards 1–5 only**. Ingest them, put the five
rows in the sheet, run `labels:check`, and **stop there** — tell Tabib. He runs those five
through the real pipeline first, to be sure the audio format and everything downstream
works before you spend a day on the other 35. Expect to wait about half an hour.

**Wednesday, rest of day.** Once you get the go-ahead, record the remaining clips.
Start transcripts for whatever you have finished.

**Thursday.** Finish all 40 transcripts, run `labels:check` until it is clean, commit and
push. Re-record anything flagged.

---

## If something breaks

| | |
|---|---|
| `ffmpeg: command not found` | install it (table above), then **reopen the terminal** |
| `ffprobe: command not found` | same install; ffprobe ships with ffmpeg |
| PowerShell rejects `&&` | run each command on its own line |
| `skip … name must look like clip-01-a` | rename the file — two digits for the card |
| `thin — under 2 seconds` | the recorder stopped early, record it again |
| `no audio at datasets/clips/…` | run `npm run collect` again, or check the spelling of `clip_id` |
| `card_id "N" has no rows in ground-truth.csv` | card numbers are 1–25 |
| anything else | send the whole terminal output, not a screenshot of part of it |

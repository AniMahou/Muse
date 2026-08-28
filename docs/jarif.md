# Jarif — your work

Two tasks. Neither one needs you to write or change any code.

Read section 0 first — it is five minutes and it makes the rest make sense.

- **Task 1 · Bangla fonts** — about an hour, at a laptop, tonight
- **Task 2 · Voice recordings** — a few hours across a few days, plus people

---

## 0 · What this project does, in five minutes

A sales rep in Bangladesh visits 30–50 small shops a day. His company's app
records his **orders** perfectly. It records **the reason for nothing** — why a
shop refused, what a competitor just did, what the shopkeeper complained about.
Typing that at forty shops a day is impossible, so nobody does it.

Muse lets him **speak for fifteen seconds** instead, and turns that into rows a
brand manager can act on.

The hard part is that **Bangla speech recognition is bad at exactly the words
that matter**. General models have heard millions of hours of ordinary Bangla,
but they have never heard "সার্ফ এক্সেল" or "বিজয় স্টোর" — brand names and shop
names. Our own measurement: the recogniser gets about **73% of words wrong**,
and we still pull out the right shop, product and quantity **59% of the time**,
because we match what it heard against a fixed list of the customer's products
rather than trusting the text.

Two things you are helping with:

| | |
|---|---|
| **Fonts** | We are building a second feature that reads **photographs** of price tags. To train it we generate fake price-tag images by the tens of thousands. Each image needs a typeface to be drawn in — and right now we only have three. |
| **Voice** | Every improvement we make has to be proved on real recordings. We have 20, all of one person reading a script in a quiet room. That is the easiest possible case and it does not resemble a real shop. |

---

# TASK 1 · Bangla fonts

## First — what a "font" is here

**You are not photographing anything. You are not writing Bangla by hand.**

A font is a **file** — like `NotoSansBengali.ttf` — that a computer uses to draw
letters. Your job is to **download font files from websites** and put them in one
folder in the project. That is the entire task. No camera, no handwriting, no
scanning.

## Why it matters

We generate fake price-tag pictures to train the photo reader. Every picture is
drawn using one of the fonts we have.

We currently have **10 faces, from only 3 typeface families** — all Apple system
fonts. A model trained on 3 typefaces learns *those 3 typefaces*, and then meets
a real shop where the tag was printed in something else and fails.

> **The 10th font helps more than the 10,000th picture.**

We can generate a million pictures in an afternoon. We cannot generate variety
in letterforms — that has to come from real typefaces designed by real people.
This is why an hour of your time here is worth more than it looks.

## Setting up — one time

You need the project and Python. If you already have the repo:

```bash
git pull
```

If not:

```bash
git clone https://github.com/AniMahou/Muse.git
```

```bash
cd Muse/ml
```

Now install the one tool that checks fonts:

**Windows:**

```bash
pip install fonttools
```

**Mac or Linux:**

```bash
pip3 install fonttools
```

If `pip` is not found, install Python from python.org first, then reopen the
terminal.

## Check what we have now

From the `Muse/ml` folder:

**Windows:**

```bash
python -m synth.fonts
```

**Mac or Linux:**

```bash
python3 -m synth.fonts
```

You should see something like:

```
  10 usable Bengali face(s), 3 family/families

    Arial Unicode MS                       system
    Bangla MN                              system
    Kohinoor Bangla                        system
    ...

  0 from ml/fonts/ · 10 from this computer
  Target is 25. Add 15 more.
```

That last line is your scoreboard. **Get it to 25.**

## Where to get fonts

### Google Fonts — easiest, definitely free to use

Go to **fonts.google.com**, search each name, click **"Get font"** then
**"Download all"**. You get a `.zip`; unzip it and the `.ttf` files are inside.

Download all of these:

- **Noto Sans Bengali** ← most important, comes with many weights
- **Noto Serif Bengali**
- **Hind Siliguri**
- **Baloo Da 2**
- **Atma**
- **Mina**
- **Galada**
- **Tiro Bangla**

Noto Sans Bengali alone often gives 6–9 separate weight files, and **each weight
counts as a separate face** because the letter shapes genuinely differ. These
eight names should get you most of the way to 25 on their own.

### Bangladeshi community fonts — worth having, check carefully

These are the fonts actually used for printing in Bangladesh, so they matter:

- **SolaimanLipi**
- **Kalpurush**
- **Nikosh**
- **Siyam Rupali**
- **Mukti / Mukti Narrow**

Search for the name plus "font download". **Omicron Lab** and **ekushey.org** are
the usual legitimate sources.

### ⚠️ The licence rule — please do not skip this

Every font page says how the font may be used. Look for:

- ✅ **SIL Open Font License (OFL)** — fine, use it
- ✅ **Apache License** — fine, use it
- ✅ "Free for commercial use" — fine
- ❌ "Free for personal use only" — **skip it**
- ❌ "Demo version" — **skip it**

Everything on Google Fonts is fine. The community ones need a look.

This is not paperwork. If this becomes a real product and a font is licensed
personal-use-only, that is a genuine legal problem, and it is far cheaper to
avoid now than to unpick later.

## Where to put the files

Put every `.ttf` and `.otf` file directly into:

```
Muse/ml/fonts/
```

Flat, no subfolders. If a zip contained a `static/` folder full of `.ttf` files,
drag those out into `ml/fonts/` directly.

**Also create a text file** `ml/fonts/SOURCES.txt` and write one line per font:

```
Noto Sans Bengali    fonts.google.com    SIL Open Font License
Hind Siliguri        fonts.google.com    SIL Open Font License
SolaimanLipi         omicronlab.com      free for any use
```

## Test that they actually work

**This step is not optional, and it is the interesting part.**

Run the check again:

```bash
python -m synth.fonts
```

**A font that does not appear in the list is not usable — delete it.**

### Why a font can silently fail

This surprises people, so it is worth understanding.

A font is a collection of drawings plus a table saying which character maps to
which drawing. Many fonts have **no Bengali drawings at all**. When you ask such
a font to draw প, it does not fail — it draws a **small empty box** (people call
it "tofu").

So you cannot test a font by drawing text and looking for pixels. You get
pixels. They are boxes.

> When we first wrote this check by drawing text, it reported **324 usable
> Bengali fonts** on a computer that has **10**. Wingdings was on the list.

The check you are running does the correct thing instead: it opens the font's
internal character table and asks whether Bengali characters — ক, ষ, the
conjunct-joiner, the nukta dot, the digit ১ — are genuinely present. A font that
has them all is real. A font that draws boxes is caught.

So if you download something that looks Bangla on the website and the tool does
not list it, the tool is right. Delete it and move on.

### When you are done

```
  27 usable Bengali face(s), 9 family/families
  17 from ml/fonts/ · 10 from this computer
  Target reached.
```

## Sending them to Tabib

Font files are **not** stored in git — licences differ and some forbid
redistribution. So:

1. Zip the `ml/fonts/` folder
2. Upload the zip to Google Drive and send the link
3. Also send a screenshot or copy-paste of the `python -m synth.fonts` output

**Do not run `git push` for this task.** Nothing here goes into git.

---

# TASK 2 · Voice recordings

## Why we are doing this again

We have 20 recordings. All of them are **you or Tabib reading a Bangla sentence
off a card, alone, in a quiet room.**

That is a problem, and it is worth understanding why, because it changes what
you do this time.

**Reading is not speaking.** When you read a sentence aloud, you say it evenly,
completely, with no hesitation, in an order you can see. When you *tell* someone
something, you pause, restart, put words in a different order, and swallow
endings. Speech recognisers behave very differently on the two. A system that
works on read speech and fails on spoken speech is a system that fails in a shop.

**A quiet room is not a shop.** Our entire claim is: *the audio is bad, the
transcript comes out wrong, and we still get the right answer.* If every
recording is quiet, we never test that claim. The noisy recordings are not a
compromise — **they are the experiment.**

**One voice measures one voice.** Everything we currently know about the system
is really about how Tabib pronounces things.

So round two is: **spoken not read · several people · genuinely noisy.**

## What "spontaneous" means in practice

Below are situation cards. Notice there is **no Bangla sentence to read.** That
is deliberate.

For each card:

1. Read the situation. Understand it.
2. **Put the phone or paper down.**
3. Say it out loud in Bangla, **in your own words**, as if telling a colleague
   on the phone.

If you fumble, repeat a word, or start over mid-sentence — **keep it.** That is
real and it is exactly what we need.

### The one thing you must say precisely

Where a card says a quantity like **one and a half dozen**, say the Bangla words
— **দেড় ডজন** — not "eighteen". The number-handling is a specific thing we
built and are testing. Saying the final number skips the test entirely.

Quick reference:

| card says | you say |
|---|---|
| one and a half | দেড় |
| two and a half | আড়াই |
| three and a half | সাড়ে তিন |
| quarter past five *(5¼)* | সোয়া পাঁচ |
| quarter to four *(3¾)* | পৌনে চার |
| dozen | ডজন |
| hali *(4)* | হালি |
| twenty | কুড়ি |

## Setting up

```bash
git pull
```

```bash
cd Muse/backend
```

```bash
npm install
```

Check you have ffmpeg — this records the audio:

```bash
ffmpeg -version
```

If that fails:

**Windows:**

```bash
winget install Gyan.FFmpeg
```

**Linux:**

```bash
sudo apt install ffmpeg
```

⚠️ **On Windows, close and reopen the terminal after installing.** The terminal
only reads the list of installed programs when it starts.

Then check your microphone is found:

```bash
npm run mic -- --devices
```

If it picks the wrong microphone, use its exact name:

```bash
npm run mic -- 26a --device "Microphone (Realtek Audio)"
```

## Recording

```bash
npm run mic
```

You get a prompt. Type the card number and a letter, press ENTER, speak, press
ENTER again:

```
  clip > 26a
  press ENTER to start clip-26-a
  ● RECORDING clip-26-a   — speak now, press ENTER to stop
  saved clip-26-a  11.2s

  clip > 
```

- `26a` = card 26, first person. `26b` = card 26, a different person.
- Blank line ends the session.
- **Wait for `● RECORDING` before speaking.** Opening a microphone takes a second
  or two — longer the first time. If you start early those words are lost.

## 🚦 Stop after 10 and check in

Record cards 26–35 with one speaker. Then run:

```bash
npm run clips
```

**Send Tabib that output and wait.** He will confirm the audio is good before
you spend hours on the rest.

This takes ten minutes and it is there because last time a batch of recordings
was made and none of it could be used. Ten minutes now protects several hours
later.

## The full target

| | |
|---|---|
| Cards | 26–45 (twenty situations, below) |
| Speakers | **at least 4 different people** |
| Clips | ~50 — every card once, then ~30 repeats by other people |
| Quiet | about 15 |
| Moderate — street, some background | about 15 |
| Loud — market, traffic, people talking over you | about 20 |

**People:** dorm-mates, friends, anyone who speaks Bangla. They do not need to
understand the project. Hand them a card, tell them to say it naturally, done in
five minutes each.

**Noise:** go outside. A roadside, a canteen at lunch, a market. Somewhere you
would have to raise your voice slightly.

**Dhaka-standard Bangla only.** A strong Chittagong or Sylhet accent gets
automatically excluded by our system, so those recordings would be wasted.

---

## The cards

> Read it. Put it down. Say it in your own words, in Bangla.

**26 · Bijoy Store** — they want to order **two and a half dozen** PRAN litchi juice.

**27 · Rahman Store** — Surf Excel powder has completely run out.

**28 · New Alam Enterprise** — White Plus has started an offer, 10 taka cheaper.

**29 · Shanto General Store** — Lux soap's price has gone up by 8 taka.

**30 · Bijoy Store** — the shopkeeper complains Sunsilk bottles are arriving leaking.

**31 · Rahman Store** — the Clear shampoo poster has been taken down / is missing.

**32 · New Alam Enterprise** — they want **quarter to four** cartons of Surf Excel *(পৌনে চার)*.

**33 · Shanto General Store** — they want **five and a quarter** cartons of PRAN mango drink *(সোয়া পাঁচ)*.

**34 · Bijoy Store** — they want **three hali** of Lux soap *(তিন হালি)*.

**35 · Rahman Store** — Rin has some offer running; you do not know the amount.

**36 · New Alam Enterprise** — PRAN Chanachur is finished.

**37 · Shanto General Store** — they want **four and a half** cartons of Surf Excel *(সাড়ে চার)*.

**38 · Bijoy Store** — the shopkeeper is angry that deliveries keep arriving late. No particular product.

**39 · Rahman Store** — they want **twenty** pieces of Sunsilk shampoo *(কুড়ি)*.

**40 · New Alam Enterprise** — Wheel has dropped its price by 7 taka.

### Two or three things in one breath

For these, say it all as **one continuous report** — do not pause between the
parts. A rep would not.

**41 · Bijoy Store** — they want **one and a half dozen** Clear shampoo *(দেড় ডজন)*, and White Plus is running an offer.

**42 · Rahman Store** — Surf Excel has run out, and Rin is selling 6 taka cheaper.

**43 · New Alam Enterprise** — they want **two and a half dozen** PRAN mango juice *(আড়াই ডজন)*, and the poster on the wall is torn.

**44 · Shanto General Store** — Lux soap's price dropped 5 taka, and they want **two dozen** of it.

**45 · Bijoy Store** — PRAN litchi juice has run out, they want **quarter to two dozen** PRAN Chanachur *(পৌনে দুই ডজন)*, and the shopkeeper is complaining about late delivery.

---

## Writing down what was said

This is the second half of the job and it is the half that did not get done last
time. **A recording nobody has written down cannot be used for the main
measurement.**

Last round we got away with it because everyone read from a script, so we already
knew the words. **This time there is no script** — only you know what was
actually said, so it has to be typed by ear.

There is a tool for it. From `Muse/backend`:

```bash
npm run labels:scaffold
```

That creates a row for every recording. Then:

```bash
npm run transcribe
```

It plays a clip and waits for you to type what you heard, then asks who spoke and
how noisy it was:

```
  clip-26-a › রহমান স্টোরে প্রাণ লিচি জুস আড়াই ডজন লাগবে
  speaker › nabil
  noise [quiet/moderate/loud] › loud
  ✓ 1/50
```

- Press **ENTER on its own** to hear it again
- Type **s** to skip a clip
- Type **q** to save and stop — it saves after every clip, so nothing is lost

**Write what was actually SAID, not what the card asked for.** If someone said
প্রান instead of প্রাণ, or repeated a word, or trailed off — type that.

We measure our own accuracy against what you type. If you tidy it up, we make
our own system look better than it is. That is the one mistake that would
actually damage us.

Budget about **2 minutes per clip**, so roughly 90 minutes for 50.

## Finishing and sending

Check everything is complete:

```bash
npm run labels:check
```

It will list, by row number, anything missing. Fix and re-run until it is clean.
Then:

```bash
npm run labels:build
```

```bash
git add datasets/raw/clips.csv datasets/labels
```

```bash
git commit -m "data: round 2 field clips"
```

```bash
git push
```

### ⚠️ The audio does not go through git

The `.wav` files are deliberately excluded — they are large. **Pushing sends the
text, not the sound.**

This confused everyone last time, so to be clear:

| what | how it travels |
|---|---|
| the recordings themselves | **zip `backend/datasets/clips/` → Google Drive** |
| what you typed | `git push` |

Both are needed. Doing only one is the same as doing neither.

### One hard rule

**Never commit anything inside `backend/src/`.** That is the application code and
Tabib is editing it at the same time. Data files only — the two paths in the
`git add` command above and nothing else.

---

## If something goes wrong

Send the **whole terminal output**, not a cropped screenshot, plus which command
you ran and whether you are on Windows or Linux.

| what you see | what it means |
|---|---|
| `'&&' is not a valid statement separator` | Windows PowerShell. Run each command on its own line. |
| `ffmpeg: command not found` | Install it, then **reopen the terminal** |
| `the microphone did not start` | `npm run mic -- --devices`, then pass `--device "<name>"` |
| `thin — under two seconds` | You pressed ENTER too fast. Record it again. |
| First words missing from a clip | You spoke before `● RECORDING` appeared |
| A font not appearing in the list | It has no real Bengali in it. Delete it. |
| `0 clip(s) valid` after recording | Run `npm run labels:scaffold` first |

There is also a longer troubleshooting guide at **`docs/COLLECTION-HANDBOOK.md`**
— it is written so you can paste the whole thing into ChatGPT along with your
error and get a useful answer without waiting for anyone.

## Order of work

1. **Tonight** — Task 1, fonts. About an hour, ends with `Target reached`.
2. **Meanwhile** — ask 4 people if they can spare 30 minutes this week.
3. **Then** — record cards 26–35, run `npm run clips`, **send it and wait**.
4. **After the go-ahead** — the rest of the recordings.
5. **Last** — transcribe, `labels:check` until clean, push, and Drive the audio.

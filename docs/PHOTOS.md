# Collecting photographs for the recogniser

The price-tag reader has never seen a photograph. It learned from 50,000
images we rendered ourselves across 137 Bangla typefaces, and every score
reported so far was measured on more of the same renderer's output. That
number says the model is learning. It cannot say the model reads a shop.

Forty labelled photographs settle it. This is how they get taken and scored.

## What to photograph

| | roughly | why |
|---|---:|---|
| Printed price tags and shelf labels | 25 | the core case — product name, price, or both |
| Promo and offer signs | 8 | `অফার`, `৫ টাকা কম` — the observations worth most |
| Shop signboards | 7 | outlet names are in the trained vocabulary too |

**Not** product photos — the model reads *text*, it does not identify products
from their packaging. **Not** wide shelf shots: there is no text detector yet,
so a scene with twelve labels in it cannot be scored.

## How to shoot

One line of text filling most of the frame, roughly square on.

Do **not** hunt for perfect lighting. Glare, tilt, mild blur and cheap paper
were all deliberately simulated during training, and photographs taken in
ordinary conditions are what the measurement needs. A set of forty flawless
studio shots would report a number no shop will ever reproduce.

Do not rename anything. Phone names like `IMG_1043.jpg` are fine.

## Two folders, and this part matters

```
printed/       tags and signs that were printed
handwritten/   tags written by hand
```

The recogniser learned from typefaces, so it reads print. Handwriting is a
different task with a different expected score, and pooling the two produces a
figure that describes neither — it would flatter or damn the model depending
only on how many handwritten tags happened to be in the folder. The tooling
scores them apart and refuses to average them.

Ten to fifteen handwritten shots are worth taking. They tell us how much of
Bangladesh's price tags we currently cannot read at all.

## Then, on the machine with the code

```bash
cd backend && npm run photos -- ~/Desktop/muse-photos
```

Copies them in, refuses duplicates, and flags anything too small to hold
readable glyphs or noticeably blurrier than the rest of the batch. Flagged
shots are kept — a real set contains bad photographs — but they are named so a
poor score can be explained rather than puzzled over.

```bash
npm run photos:label
```

Opens a page at `localhost:5178`. Drag a box round **one line** of text, type
exactly what it says, press Enter. Several lines in one photo: save one, drag
the next.

The box is required, and it is not busywork. The recogniser reads a single
line 32 pixels tall — that is the shape it was trained on. Feeding it a whole
photograph would measure our missing *detector* and report a terrible number
for the wrong reason. Drawing the box by hand separates the two questions and
leaves an honest claim: given a correctly cropped line, this is how well it
reads Bangla.

Crops are written in exactly the training format — greyscale, 32px tall — so
the real and synthetic figures are measured on identically shaped inputs.

## Scoring

```bash
cd ml && python -m ocr.eval_real
```

Reports, separately for print and handwriting: character error rate, exact
match, mean confidence, whether confidence separates right answers from wrong
ones, the five worst lines with what was wanted and what came back, and the
**domain gap** — how far the real number sits from the synthetic one.

A large gap is not a failure. It is the expected consequence of training on
synthetic data, and its size is what tells us whether to ship, to fine-tune on
real photographs, or to go back to the generator.

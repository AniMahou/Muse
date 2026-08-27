# ml — training and data generation

Python, deliberately separate from the TypeScript service. There is no model
training in the serving path: things here train offline and ship as artefacts
that an adapter loads. Keeping the boundary means the API never grows a Python
dependency and the training code never has to care about request latency.

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## Synthetic price-tag corpus

```bash
cd ../backend && npm run catalog:export     # writes ml/data/catalog.json
cd ../ml && ./.venv/bin/python -m synth.generate --count 50000 --out data/synth
```

~320 samples/sec, so 50k takes under three minutes and about 230 MB. Output is
32px-tall greyscale crops plus `labels.tsv` and `charset.json` — the input a
CRNN+CTC recogniser expects. CTC sums over alignments, so no character boxes are
needed, which is the whole reason data this cheap is usable.

### Why generate rather than collect

We know the vocabulary in advance. The text on a tag a rep photographs is the
customer's own catalogue, and proper nouns are exactly where a general
recogniser fails — the same reason a general acoustic model mangles
সার্ফ এক্সেল. A model trained on generic Bengali has never seen these brand
names. One trained on this has seen each ten thousand times.

It is also how the field actually works: most scene-text recognisers are
pretrained on synthetic corpora and fine-tuned on a small real set.

### The part that is easy to get wrong

**Bengali needs real text shaping.** Pillow's default layout draws glyphs in
logical order with no substitution or repositioning, so two-part matras (ো, ৌ)
come out as detached dotted circles and nukta never joins its base. Pillow can
delegate to Raqm, but Raqm is a build-time dependency missing from most wheels,
which makes the corpus silently correct on one machine and wrong on another.

`synth/shape.py` does it explicitly: HarfBuzz applies GSUB/GPOS to get positioned
glyph ids, FreeType rasterises them, and the bitmaps are composed at those
positions. Portable, and honest about what is happening — the failure mode when
shaping is missing is invisible to anyone who does not read Bengali, because the
output still looks like Bengali.

**Font detection cannot be done by rendering.** FreeType and Pillow both draw
`.notdef` boxes for missing glyphs, so a font with no Bengali produces a
confident row of tofu. Probing that way reported 324 usable faces on a machine
with 10, Wingdings among them. `synth/fonts.py` reads the character map instead.

## Layout

```
synth/
  shape.py     HarfBuzz shaping + FreeType rasterisation
  fonts.py     cmap-based discovery of genuinely Bengali faces
  corpus.py    what a Bangladeshi price tag actually says
  augment.py   print defects, lighting, perspective, blur, sensor noise, JPEG
  generate.py  CLI
data/
  catalog.json exported from the backend — one source of truth for vocabulary
```

## What this does not give you

**A test set.** Validating on held-out synthetic data measures how well the model
learned our renderer, and a renderer is not a shop. A real accuracy figure needs
real photographs, and the model should be judged on those even when there are
only a hundred.

Roughly 150 real photos are eventually needed, for two things: an honest test
set, and fine-tuning detection — the stage synthetic data serves worst, because
synthetic scene composition looks synthetic. Recognition is the stage it serves
best, which is why it is the stage built first.

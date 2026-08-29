"""Generate a synthetic Bangla price-tag corpus for recogniser training.

    python -m synth.generate --count 50000 --out data/synth

Writes 32px-tall greyscale crops with a labels file, which is the input format
a CRNN+CTC recogniser expects: no character boxes, just (image, string). CTC
sums over alignments, which is exactly why data this cheap is usable at all.

What this does NOT produce is a test set. Validating on held-out synthetic data
measures how well the model learned our renderer, and a renderer is not a shop.
The real number needs real photographs, and the model should be judged on those
even when there are only a hundred of them.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np

from .augment import degrade
from .corpus import Catalog, corpus
from .fonts import discover
from ocr.charset import normalise
from .shape import render

TARGET_H = 32


def _tag_background(w: int, h: int, rng: random.Random) -> np.ndarray:
    """Paper, card or plastic — never pure white, which does not exist."""
    base = rng.randrange(200, 252)
    img = np.full((h, w), base, np.uint8)

    texture = np.random.normal(0, rng.uniform(1.5, 5.0), (h, w))
    img = np.clip(img.astype(np.float32) + texture, 0, 255).astype(np.uint8)

    if rng.random() < 0.25:                      # printed border on the tag
        t = rng.choice([1, 2])
        cv2.rectangle(img, (t, t), (w - t - 1, h - t - 1), int(base * 0.45), t)
    return img


def compose(text: str, face, size: int, rng: random.Random) -> np.ndarray | None:
    ink = render(text, face.path, size, face.index)
    if ink.size == 0 or ink.shape[0] < 4:
        return None

    ph, pw = ink.shape
    pad_x = rng.randrange(6, 26)
    pad_y = rng.randrange(4, 16)
    canvas = _tag_background(pw + pad_x * 2, ph + pad_y * 2, rng)

    # Ink is rarely pure black on a real tag, and the contrast between ink and
    # card is one of the things the model must be robust to.
    ink_level = rng.randrange(10, 90)
    alpha = (255 - ink.astype(np.float32)) / 255.0
    region = canvas[pad_y : pad_y + ph, pad_x : pad_x + pw].astype(np.float32)
    canvas[pad_y : pad_y + ph, pad_x : pad_x + pw] = (
        region * (1 - alpha) + ink_level * alpha
    ).astype(np.uint8)

    out = degrade(canvas, rng)
    if rng.random() < 0.12:                      # some tags are dark with light text
        out = 255 - out

    h, w = out.shape
    scale = TARGET_H / h
    return cv2.resize(out, (max(8, int(w * scale)), TARGET_H), interpolation=cv2.INTER_AREA)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=20000)
    ap.add_argument("--catalog", default="data/catalog.json")
    ap.add_argument("--out", default="data/synth")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--fonts-dir", default="fonts")
    args = ap.parse_args()

    faces = discover([args.fonts_dir])
    if not faces:
        raise SystemExit("No Bengali-capable fonts found. Drop .ttf files into ml/fonts/.")

    cat = Catalog.load(args.catalog)
    lines = corpus(cat, args.count, seed=args.seed)
    rng = random.Random(args.seed)

    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)

    charset: set[str] = set()
    written = 0
    with (out / "labels.tsv").open("w", encoding="utf-8") as fh:
        for i, text in enumerate(lines):
            face = rng.choice(faces)
            # ৳ is missing from some otherwise good faces and renders as tofu,
            # which would teach the model that a box means taka.
            if "৳" in text and not face.has_taka:
                text = text.replace("৳", "Tk ")
            img = compose(text, face, rng.randrange(28, 64), rng)
            if img is None:
                continue
            name = f"{i:07d}.png"
            cv2.imwrite(str(out / "images" / name), img)
            fh.write(f"{name}\t{text}\n")
            # NORMALISED, like the training loader does. Counting raw code
            # points here recorded a bare U+09BC NUKTA as a class and never ড় or
            # য়, so this file described an alphabet no model was ever trained on.
            # Anything loading it for inference would map ids to the wrong
            # characters from the divergence point on and emit confident
            # nonsense. The authoritative charset ships beside the weights.
            charset.update(normalise(text))
            written += 1
            if written % 2000 == 0:
                print(f"  {written}/{len(lines)}")

    # The charset IS the model's output layer, so it is part of the artefact:
    # a model cannot emit a character that was not in its vocabulary at training
    # time, and silently retraining with a different one breaks every checkpoint.
    (out / "charset.json").write_text(
        json.dumps({"chars": sorted(charset), "size": len(charset)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n  {written} samples -> {out}")
    print(f"  {len(charset)} distinct characters, {len(faces)} fonts")
    print("  NOTE: checkpoints/charset.json is the one that binds — load that for inference.")


if __name__ == "__main__":
    main()

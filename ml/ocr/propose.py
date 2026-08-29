"""Propose candidate text lines in a photograph.

    python -m ocr.propose ../backend/datasets/photos/printed/photo-024.jpg --out /tmp/props

Not the text detector this system eventually needs — that is a learned model.
This is the classical stand-in that makes hand-labelling tractable: it finds
regions that LOOK like a line of text, and a human then throws away the
nonsense and types what the good ones say. Drawing two hundred boxes by hand is
hours; correcting two hundred proposals is minutes.

The method is deliberately old-fashioned and has no parameters worth tuning
beyond the obvious:

  * contrast-normalise, then adaptive-threshold, because a shop is lit unevenly
    and a global threshold loses either the shaded half or the glare;
  * dilate along the X axis only, which welds neighbouring characters into one
    blob while keeping separate LINES apart — the whole trick;
  * keep blobs whose shape is line-like and whose height could survive being
    resized to 32px.

It over-proposes on purpose. A missed line is lost data; a spurious one costs a
glance.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

# A line must be wider than it is tall, and not be a scratch or a shelf edge.
MIN_ASPECT = 1.2
MAX_ASPECT = 30.0
# Below this the glyphs cannot survive the resize to 32px tall.
MIN_HEIGHT_PX = 26
MAX_HEIGHT_FRAC = 0.18
MIN_WIDTH_PX = 40


def proposals(img: np.ndarray, scale: float = 1.0) -> list[tuple[int, int, int, int]]:
    """Candidate line boxes, in ORIGINAL image coordinates.

    `scale` exists because a shelf photographed from two metres away carries
    text twenty pixels tall in a four-thousand-pixel frame, and every
    morphological size here is absolute. On such a photo the merge never welds
    characters into a line and almost everything is rejected as too short —
    the first run on a wide shot returned two proposals for a shelf carrying
    perhaps sixty legible ones. Enlarging first, and dividing the boxes back
    down afterwards, costs one resize and fixes it.
    """
    if scale != 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    h, w = img.shape[:2]
    grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # CLAHE rather than a plain equalise: a fridge light blows out one corner of
    # most of these photographs, and global equalisation then crushes the rest.
    grey = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(16, 16)).apply(grey)

    # Both polarities. Shop signage is black-on-white and white-on-black in
    # roughly equal measure, and thresholding for one throws the other away.
    boxes: list[tuple[int, int, int, int]] = []
    for invert in (cv2.THRESH_BINARY_INV, cv2.THRESH_BINARY):
        binary = cv2.adaptiveThreshold(grey, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, invert, 25, 12)
        # Horizontal-only dilation: characters merge into a line, lines stay apart.
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(9, w // 220), 3))
        merged = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            if bh < MIN_HEIGHT_PX or bh > h * MAX_HEIGHT_FRAC or bw < MIN_WIDTH_PX:
                continue
            aspect = bw / bh
            if aspect < MIN_ASPECT or aspect > MAX_ASPECT:
                continue
            # Ink coverage: a genuine line of text fills part of its box, while a
            # shelf edge or a shadow fills nearly all or nearly none of it.
            patch = binary[y : y + bh, x : x + bw]
            fill = float((patch > 0).mean())
            if fill < 0.08 or fill > 0.80:
                continue
            boxes.append((x, y, bw, bh))

    if scale != 1.0:
        boxes = [(int(x / scale), int(y / scale), int(bw / scale), int(bh / scale))
                 for x, y, bw, bh in boxes]
    return dedupe(boxes)


def dedupe(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Merge boxes that are the SAME line found twice, by overlap.

    The obvious rule — drop any box contained in a larger one — is wrong here
    and cost most of the recall on the first attempt. A promo tag sits inside a
    red panel, and a product name sits inside the tag; containment is the
    normal relationship between a line and its background, not evidence of a
    duplicate. Both threshold polarities find the same line at nearly the same
    coordinates, so overlap is what actually identifies a duplicate.

    Smaller boxes win. A tight box round one line beats a loose box round three.
    """
    kept: list[tuple[int, int, int, int]] = []
    for b in sorted(boxes, key=lambda b: b[2] * b[3]):
        if all(iou(b, k) < 0.55 for k in kept):
            kept.append(b)
    return sorted(kept, key=lambda b: (b[1], b[0]))


def iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--out", default="/tmp/props")
    ap.add_argument("--limit", type=int, default=60)
    ap.add_argument("--scale", type=float, default=1.0,
                    help="enlarge before detecting; use 2-3 for a whole-shelf photo")
    args = ap.parse_args()

    img = cv2.imread(args.photo)
    if img is None:
        raise SystemExit(f"cannot read {args.photo}")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.png"):
        f.unlink()

    boxes = proposals(img, scale=args.scale)[: args.limit]
    stem = Path(args.photo).stem
    lines = []
    strips = []
    SHEET_W = 1500
    for i, (x, y, w, h) in enumerate(boxes):
        pad = max(2, h // 8)
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(img.shape[1], x + w + pad), min(img.shape[0], y + h + pad)
        crop = img[y0:y1, x0:x1]
        scale = 48 / crop.shape[0]
        crop = cv2.resize(crop, (max(8, int(crop.shape[1] * scale)), 48),
                          interpolation=cv2.INTER_LANCZOS4)
        cv2.imwrite(str(out / f"{i:03d}.png"), crop)
        lines.append(f"{stem}\t{x0}\t{y0}\t{x1-x0}\t{y1-y0}\t")

        # One contact sheet, each strip stamped with its index. Without the
        # number a reviewer has to count bands to say which line they mean,
        # and miscounting silently attaches a transcription to the wrong box.
        strip = np.full((56, SHEET_W, 3), 255, np.uint8)
        strip[:, :] = 255
        cv2.putText(strip, f"{i:03d}", (6, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 200), 2)
        wid = min(crop.shape[1], SHEET_W - 80)
        strip[4:52, 76 : 76 + wid] = crop[:, :wid]
        strips.append(strip)

    (out / "boxes.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    if strips:
        cv2.imwrite(str(out / "sheet.png"), np.vstack(strips))
    print(f"  {len(boxes)} proposals -> {out}/sheet.png")


if __name__ == "__main__":
    main()

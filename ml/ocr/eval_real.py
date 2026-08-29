"""Score the recogniser on photographs a human actually took.

    python -m ocr.eval_real
    python -m ocr.eval_real --checkpoint checkpoints --kind printed

This is the only number about this model that means anything to a customer.
Everything reported during training was measured on a 2% slice of the same
50,000 images the model learned from — same renderer, same fonts, same
augmentation pipeline. It answers "is it still learning". It cannot answer
"does it read a shop".

The gap between the two is the DOMAIN GAP, and reporting it is the point of
this script. A large gap is not a failure; it is the expected result of
training on synthetic data, and knowing its size is what tells us whether to
ship, to fine-tune on real photographs, or to go back to the generator.

Printed and handwritten are scored SEPARATELY and never pooled. The corpus was
rendered from 137 typefaces, so handwriting is a different task with a
different expected score; a single averaged figure would describe neither and
would flatter or damn the model depending only on how many handwritten tags
happened to be in the folder.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch

from .charset import Charset, normalise
from .decode import cer, greedy
from .model import CRNN, IMG_H

PHOTOS = Path("../backend/datasets/photos")


def load_rows(labels: Path, kind: str | None, split: str = "test") -> list[dict]:
    if not labels.exists():
        raise SystemExit(
            f"no labels at {labels}\n"
            "  collect first:  cd ../backend && npm run photos -- <folder>\n"
            "  then label:     npm run photos:label"
        )
    rows = [json.loads(l) for l in labels.read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = [r for r in rows if kind is None or r["kind"] == kind]

    # Default to the held-out photographs only. Scoring a fine-tuned model on
    # lines it was fine-tuned on is not a measurement, and making that the
    # DEFAULT rather than a flag means the honest number is the one you get by
    # accident.
    if split != "all":
        sp = json.loads((labels.parent / "split.json").read_text(encoding="utf-8"))
        allowed = set(sp[split])
        rows = [r for r in rows if r["photoId"] in allowed]
    return rows


def read_crop(path: Path) -> torch.Tensor | None:
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    if img.shape[0] != IMG_H:
        scale = IMG_H / img.shape[0]
        img = cv2.resize(img, (max(8, int(img.shape[1] * scale)), IMG_H))
    return torch.from_numpy(img.astype(np.float32) / 127.5 - 1.0).unsqueeze(0).unsqueeze(0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default="checkpoints")
    ap.add_argument("--photos", default=str(PHOTOS))
    ap.add_argument("--kind", default=None, help="printed | handwritten; default both, reported apart")
    ap.add_argument("--split", default="test", choices=["test", "train", "all"],
                    help="held-out photographs by default")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    ckpt_dir = Path(args.checkpoint)
    blob = torch.load(ckpt_dir / "recogniser.pt", map_location="cpu")
    charset = Charset(blob["charset"])
    # Only a synthetic-trained checkpoint has a synthetic validation score. A
    # fine-tuned one does not, and claiming otherwise turns the domain-gap line
    # into a comparison of a number with itself.
    synth_cer = blob.get("val_cer")
    finetuned_from = blob.get("finetuned_from")

    model = CRNN(charset.size)
    model.load_state_dict(blob["model"])
    model.eval()

    root = Path(args.photos)
    rows = load_rows(root / "labels.jsonl", args.kind, args.split)
    if not rows:
        raise SystemExit("no labelled lines to score")

    print(f"\n  {len(rows)} labelled line(s) · split '{args.split}' · {charset.size} classes")
    if finetuned_from is not None:
        print(f"  fine-tuned from {finetuned_from} on real photographs")
        print("  no synthetic validation score applies; there is no domain gap to report")
    elif synth_cer is not None:
        print(f"  synthetic validation CER at training time: {synth_cer:.3f}")
    print()

    by_kind: dict[str, list[dict]] = {}

    for row in rows:
        crop = read_crop(root / "lines" / f"{row['lineId']}.png")
        if crop is None:
            print(f"  {row['lineId']}  MISSING CROP — skipped")
            continue

        with torch.no_grad():
            logprobs = model(crop)[:, 0, :]
        out = greedy(logprobs, charset)

        truth = normalise(row["text"])
        # Characters outside the trained alphabet cannot be emitted, so counting
        # them as errors would measure the corpus, not the model. They are
        # reported separately instead.
        unknown = sorted({ch for ch in truth if ch not in charset.stoi and not ch.isspace()})
        score = cer(truth, out.text)

        by_kind.setdefault(row["kind"], []).append(
            {"cer": score, "exact": truth == out.text, "conf": out.conf, "unknown": unknown,
             "lineId": row["lineId"], "truth": truth, "got": out.text}
        )

    for kind, results in sorted(by_kind.items()):
        n = len(results)
        mean_cer = sum(r["cer"] for r in results) / n
        exact = sum(1 for r in results if r["exact"]) / n
        mean_conf = sum(r["conf"] for r in results) / n

        print(f"  {kind.upper()}  ({n} lines)")
        print(f"    CER          {mean_cer:.3f}")
        print(f"    exact match  {exact:.1%}")
        print(f"    mean confidence {mean_conf:.2f}")
        if synth_cer is not None and finetuned_from is None and kind == "printed":
            gap = mean_cer - synth_cer
            print(f"    domain gap   {gap:+.3f}  (synthetic {synth_cer:.3f} -> real {mean_cer:.3f})")

        # Does the model know when it is wrong? A recogniser whose confidence
        # does not separate its right answers from its wrong ones cannot be
        # trusted to drive the clarification prompt downstream.
        right = [r["conf"] for r in results if r["exact"]]
        wrong = [r["conf"] for r in results if not r["exact"]]
        if right and wrong:
            print(
                f"    confidence when right {sum(right)/len(right):.2f} · "
                f"when wrong {sum(wrong)/len(wrong):.2f}"
            )

        worst = sorted(results, key=lambda r: -r["cer"])[:5]
        if worst and worst[0]["cer"] > 0:
            print("    worst lines:")
            for r in worst:
                if r["cer"] == 0:
                    break
                print(f"      {r['lineId']}  CER {r['cer']:.2f}")
                print(f"        want  {r['truth']}")
                print(f"        got   {r['got']}")

        # Split the error in two, because the fixes are different.
        #
        # A line containing a character the model has no output unit for cannot
        # be got right at any price — that is a corpus gap, fixed by generating
        # more data. A line whose every character WAS trainable and is still
        # wrong is the domain gap: the renderer does not look like a shop.
        # Reporting one averaged number hides which of the two we are looking
        # at, and they call for completely different work.
        reachable = [r for r in results if not r["unknown"]]
        blocked = [r for r in results if r["unknown"]]
        if blocked:
            print("    split by cause:")
            if reachable:
                print(
                    f"      every character trainable   n={len(reachable):3d}  "
                    f"CER {sum(r['cer'] for r in reachable)/len(reachable):.3f}"
                )
            print(
                f"      contains untrainable chars  n={len(blocked):3d}  "
                f"CER {sum(r['cer'] for r in blocked)/len(blocked):.3f}"
            )
            missing = sorted({u for r in blocked for u in r["unknown"]})
            print(f"      absent from the alphabet: {' '.join(missing)}")
            print("      the model has no output unit for these — extend the corpus")
        print()

    if len(by_kind) > 1:
        print("  Reported apart on purpose. Print and handwriting are different tasks;")
        print("  a pooled figure would describe neither.")
        print()


if __name__ == "__main__":
    main()

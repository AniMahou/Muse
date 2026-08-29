"""Adapt the synthetic-trained recogniser to photographs.

    python -m ocr.finetune --checkpoint checkpoints --out checkpoints_ft

The model reads rendered text at CER 0.016 and photographs at 0.845. It did
not fail to learn; it learned a renderer. Fine-tuning shows it what a shop
actually looks like.

Three decisions carry this, and each guards against a way small-data
fine-tuning normally goes wrong:

  MIX IN THE SYNTHETIC DATA. Roughly a hundred real lines against 8.2M
  parameters will fit perfectly and forget everything else — catastrophic
  forgetting, and with a set this size it happens within an epoch or two. Each
  batch is therefore part real, part synthetic, so the original ability is
  rehearsed while the new distribution is learned.

  LOW LEARNING RATE. Fine-tuning at the training rate is not fine-tuning; it
  is restarting from a lucky initialisation.

  AUGMENT THE REAL CROPS HARD. A hundred lines from two shops is a narrow
  sample. Rotation, brightness, blur and noise multiply it, and — more
  usefully — they say what we believe is INCIDENTAL about a photograph. A
  recogniser should not care that a tag was shot at four degrees.

The test photographs are never touched. `--split train` is what this reads,
and the split was frozen before any of it was labelled.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

from .charset import Charset, normalise
from .data import SynthLines, collate, load_rows
from .decode import cer, greedy
from .model import CRNN, IMG_H


class RealLines(Dataset):
    """Hand-labelled crops, augmented. `repeat` oversamples the tiny real set."""

    def __init__(self, root: Path, charset: Charset, rows: list[dict], repeat: int = 1,
                 augment: bool = True) -> None:
        self.root, self.charset, self.augment = root, charset, augment
        self.rows = rows * repeat
        self.rng = random.Random(0)

    def __len__(self) -> int:
        return len(self.rows)

    def _degrade(self, img: np.ndarray) -> np.ndarray:
        r = self.rng
        if r.random() < 0.7:  # rotation: a hand-held phone is never square on
            angle = r.uniform(-3.5, 3.5)
            h, w = img.shape
            m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
            img = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE)
        if r.random() < 0.7:  # shop lighting, from a fridge lamp to a dim bulb
            img = np.clip(img.astype(np.float32) * r.uniform(0.65, 1.35)
                          + r.uniform(-30, 30), 0, 255).astype(np.uint8)
        if r.random() < 0.4:
            k = r.choice([3, 5])
            img = cv2.GaussianBlur(img, (k, k), 0)
        if r.random() < 0.4:
            img = np.clip(img.astype(np.float32)
                          + np.random.normal(0, r.uniform(3, 12), img.shape), 0, 255).astype(np.uint8)
        if r.random() < 0.3:  # JPEG, because every one of these came from a phone
            q = r.randrange(35, 80)
            _, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
            img = cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE)
        return img

    def __getitem__(self, i: int):
        row = self.rows[i]
        img = cv2.imread(str(self.root / "lines" / f"{row['lineId']}.png"), cv2.IMREAD_GRAYSCALE)
        if img is None:
            img = np.full((IMG_H, 32), 255, np.uint8)
        if self.augment:
            img = self._degrade(img)
        if img.shape[0] != IMG_H:
            scale = IMG_H / img.shape[0]
            img = cv2.resize(img, (max(8, int(img.shape[1] * scale)), IMG_H))
        x = torch.from_numpy(img.astype(np.float32) / 127.5 - 1.0).unsqueeze(0)
        text = normalise(row["text"])
        return x, torch.tensor(self.charset.encode(text), dtype=torch.long), text


def labelled(photos: Path, split: str) -> list[dict]:
    rows = [json.loads(l) for l in (photos / "labels.jsonl").read_text(encoding="utf-8").splitlines()
            if l.strip()]
    sp = json.loads((photos / "split.json").read_text(encoding="utf-8"))
    allowed = set(sp[split])
    return [r for r in rows if r["photoId"] in allowed]


def score(model: nn.Module, rows: list[dict], photos: Path, charset: Charset) -> tuple[float, float]:
    """Follow the model to whichever device it is on, rather than assuming CPU."""
    model.eval()
    device = next(model.parameters()).device
    cers, exact = [], 0
    for r in rows:
        img = cv2.imread(str(photos / "lines" / f"{r['lineId']}.png"), cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        x = torch.from_numpy(img.astype(np.float32) / 127.5 - 1.0).unsqueeze(0).unsqueeze(0).to(device)
        with torch.no_grad():
            out = greedy(model(x)[:, 0, :].cpu(), charset)
        truth = normalise(r["text"])
        cers.append(cer(truth, out.text))
        exact += truth == out.text
    return (sum(cers) / max(1, len(cers)), exact / max(1, len(rows)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default="checkpoints")
    ap.add_argument("--out", default="checkpoints_ft")
    ap.add_argument("--photos", default="../backend/datasets/photos")
    ap.add_argument("--synth", default="data/synth")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--repeat", type=int, default=12, help="oversampling of the real set")
    ap.add_argument("--val-frac", type=float, default=0.25,
                    help="fraction of TRAIN photos held back to choose the epoch")
    ap.add_argument("--synth-ratio", type=float, default=1.0,
                    help="synthetic samples per real sample, to rehearse against forgetting")
    args = ap.parse_args()

    photos = Path(args.photos)
    ckpt = Path(args.checkpoint)
    blob = torch.load(ckpt / "recogniser.pt", map_location="cpu")
    charset = Charset(blob["charset"])
    model = CRNN(charset.size)
    model.load_state_dict(blob["model"])

    train_rows = labelled(photos, "train")
    test_rows = labelled(photos, "test")

    # Model selection needs its OWN data. Choosing the epoch with the lowest
    # test CER and then reporting that CER is selection on the test set: with
    # twenty epochs to choose from and only twenty-three test lines, the
    # minimum of a noisy sequence is optimistically biased even when every
    # individual measurement is honest. So a slice of the TRAIN photographs is
    # held back for choosing, and the test set is touched once, at the end.
    #
    # Split by photo here too, for the same reason the outer split is.
    train_photos = sorted({r["photoId"] for r in train_rows})
    n_val = max(1, round(len(train_photos) * args.val_frac))
    val_photos = set(train_photos[::max(1, len(train_photos) // n_val)][:n_val])
    val_rows = [r for r in train_rows if r["photoId"] in val_photos]
    train_rows = [r for r in train_rows if r["photoId"] not in val_photos]

    # Lines carrying a character the alphabet lacks cannot be learned: CTC has
    # no unit to raise. Dropped from TRAINING with a note, never from the test
    # set, where they are part of the honest picture.
    keep = [r for r in train_rows if all(c in charset.stoi or c.isspace() for c in normalise(r["text"]))]
    dropped = len(train_rows) - len(keep)

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model.to(device)

    print(f"\n  {len(keep)} real training lines" + (f" ({dropped} dropped: untrainable chars)" if dropped else ""))
    print(f"  {len(val_rows)} validation lines from {sorted(val_photos)} — for choosing the epoch")
    print(f"  {len(test_rows)} held-out lines, scored once at the end")

    before = score(model, test_rows, photos, charset)
    before_val = score(model, val_rows, photos, charset)
    print(f"  before: test CER {before[0]:.3f}  exact {before[1]:.1%}\n")

    real = RealLines(photos, charset, keep, repeat=args.repeat)
    synth_rows = load_rows(args.synth)
    random.Random(0).shuffle(synth_rows)
    n_synth = int(len(real) * args.synth_ratio)
    synth = SynthLines(args.synth, charset, synth_rows[:n_synth])

    mixed = torch.utils.data.ConcatDataset([real, synth])
    loader = DataLoader(mixed, batch_size=args.batch, shuffle=True, collate_fn=collate, num_workers=0)

    criterion = nn.CTCLoss(blank=0, zero_infinity=True)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    best = before_val[0]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        total, seen = 0.0, 0
        for x, targets, input_lengths, target_lengths, _ in loader:
            x = x.to(device)
            logp = model(x)
            # collate() already reports the true width of each sample, so
            # padding contributes no gradient. Clamped to the actual number of
            # timesteps the CNN produced: a batch padded to a wider maximum
            # would otherwise claim more frames than exist.
            input_lengths = input_lengths.clamp(max=logp.shape[0])
            # CTC has no MPS kernel; computed on CPU deliberately rather than
            # via a blanket fallback, so it is visible where this runs.
            loss = criterion(logp.cpu(), targets, input_lengths, target_lengths)
            if not torch.isfinite(loss):
                continue
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            total += float(loss) * x.shape[0]
            seen += x.shape[0]

        cer_now, _ = score(model, val_rows, photos, charset)
        history.append({"epoch": epoch, "loss": total / max(1, seen), "val_cer": cer_now})
        star = ""
        if cer_now < best:
            best = cer_now
            # Deliberately NOT under "val_cer". That key means "CER on held-out
            # SYNTHETIC data" everywhere else, and the reporting script prints
            # it with that wording; writing a real-photo score into it made the
            # evaluation announce a domain gap of exactly zero, which is not a
            # result, it is the same number subtracted from itself.
            torch.save({"model": {k: v.cpu() for k, v in model.state_dict().items()},
                        "charset": charset.chars, "real_val_cer": cer_now,
                        "finetuned_from": str(ckpt)}, out / "recogniser.pt")
            star = "  <- saved"
        print(f"  epoch {epoch:2d}: loss {total/max(1,seen):.3f} · val CER {cer_now:.3f}{star}",
              flush=True)

    Charset(charset.chars).save(out / "charset.json")
    (out / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")

    # The test set, once, on the epoch validation chose.
    chosen = torch.load(out / "recogniser.pt", map_location="cpu")
    final = CRNN(charset.size)
    final.load_state_dict(chosen["model"])
    after = score(final, test_rows, photos, charset)
    print(f"\n  validation picked an epoch at val CER {best:.3f}")
    print(f"  TEST: {before[0]:.3f} -> {after[0]:.3f}   ({before[0]-after[0]:+.3f} CER)")
    print(f"        exact {before[1]:.1%} -> {after[1]:.1%}")


if __name__ == "__main__":
    main()

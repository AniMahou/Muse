"""Loading the synthetic corpus.

The only interesting decision is how to batch images of different widths. A
price tag reading "৳৫০" is a quarter the width of "Surf Excel Powder 500g", and
CTC needs to know how many timesteps of each sample are real.

Two things follow:

  * images are padded to the widest in the batch, and the true width is passed
    to the loss as `input_lengths`, so padding contributes no gradient.
  * batches are drawn from width buckets, so a short label is not padded out to
    match the longest line in the corpus. Without bucketing most of every batch
    is padding and a training step spends its time on blank pixels.
"""
from __future__ import annotations

import random
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset

from .charset import Charset, normalise
from .model import IMG_H


class SynthLines(Dataset):
    def __init__(self, root: str | Path, charset: Charset, rows: list[tuple[str, str]]) -> None:
        self.root = Path(root)
        self.charset = charset
        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, i: int):
        name, text = self.rows[i]
        img = cv2.imread(str(self.root / "images" / name), cv2.IMREAD_GRAYSCALE)
        if img is None:
            img = np.full((IMG_H, 32), 255, np.uint8)
        if img.shape[0] != IMG_H:
            scale = IMG_H / img.shape[0]
            img = cv2.resize(img, (max(8, int(img.shape[1] * scale)), IMG_H))
        # [-1, 1]: BatchNorm converges faster from zero-centred input than from [0,1].
        x = torch.from_numpy(img.astype(np.float32) / 127.5 - 1.0).unsqueeze(0)
        return x, torch.tensor(self.charset.encode(text), dtype=torch.long), text


def collate(batch):
    xs, ys, texts = zip(*batch)
    widths = [x.shape[2] for x in xs]
    w_max = max(widths)

    # Pad with 1.0 — white, i.e. blank paper. Padding with 0 would paint mid-grey
    # and the model would learn to read it as ink.
    padded = torch.ones(len(xs), 1, IMG_H, w_max)
    for i, x in enumerate(xs):
        padded[i, :, :, : x.shape[2]] = x

    # The CNN divides width by 4; input_lengths must describe the real content
    # so the loss ignores padding.
    input_lengths = torch.tensor([max(1, w // 4) for w in widths], dtype=torch.long)
    target_lengths = torch.tensor([len(y) for y in ys], dtype=torch.long)
    targets = torch.cat(ys) if len(ys) else torch.zeros(0, dtype=torch.long)
    return padded, targets, input_lengths, target_lengths, list(texts)


def load_rows(root: str | Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for line in (Path(root) / "labels.tsv").read_text(encoding="utf-8").splitlines():
        if "\t" not in line:
            continue
        name, text = line.split("\t", 1)
        text = normalise(text)
        if text.strip():
            rows.append((name, text))
    return rows


def split(rows: list[tuple[str, str]], val_frac: float = 0.02, seed: int = 0):
    """Hold out a slice for monitoring.

    Synthetic validation answers "is the model still learning", nothing more.
    It cannot answer "does this read a photograph", because both halves came out
    of the same renderer — and a renderer is not a shop.
    """
    rng = random.Random(seed)
    shuffled = rows[:]
    rng.shuffle(shuffled)
    n_val = max(1, int(len(shuffled) * val_frac))
    return shuffled[n_val:], shuffled[:n_val]

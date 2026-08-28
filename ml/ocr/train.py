"""Train the line recogniser.

    python -m ocr.train --data data/synth --epochs 8

Reports character error rate on a held-out synthetic slice, which answers "is it
still learning" and nothing else — both halves came from the same renderer. The
number that matters comes later, from photographs.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from .charset import Charset
from .data import SynthLines, collate, load_rows, split
from .decode import cer, greedy
from .model import CRNN


def pick_device(requested: str) -> torch.device:
    if requested != "auto":
        return torch.device(requested)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, charset: Charset, device: torch.device, limit: int = 400):
    model.eval()
    total, n, exact = 0.0, 0, 0
    for x, _, in_len, _, texts in loader:
        logp = model(x.to(device)).cpu()
        for b, truth in enumerate(texts):
            pred = greedy(logp[: in_len[b], b, :], charset)
            total += cer(truth, pred.text)
            exact += int(pred.text == truth)
            n += 1
            if n >= limit:
                model.train()
                return total / n, exact / n
    model.train()
    return (total / n, exact / n) if n else (1.0, 0.0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/synth")
    ap.add_argument("--out", default="checkpoints")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    device = pick_device(args.device)
    rows = load_rows(args.data)
    train_rows, val_rows = split(rows)
    charset = Charset.from_labels(Path(args.data) / "labels.tsv")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    charset.save(out / "charset.json")

    print(f"  device {device} · {len(train_rows):,} train / {len(val_rows):,} val · {charset.size} classes")

    # Width buckets: sorting by image width before batching keeps padding small.
    # Without it a batch mixing "৳৫০" with a full product name is mostly blank
    # pixels, and the step is spent on nothing.
    train_rows.sort(key=lambda r: len(r[1]))

    train_ds = SynthLines(args.data, charset, train_rows)
    val_ds = SynthLines(args.data, charset, val_rows)
    train_dl = DataLoader(
        train_ds, batch_size=args.batch, shuffle=False, collate_fn=collate,
        num_workers=args.workers, drop_last=True,
    )
    val_dl = DataLoader(val_ds, batch_size=args.batch, shuffle=False, collate_fn=collate, num_workers=2)

    model = CRNN(charset.size).to(device)
    # zero_infinity: a sample whose label is longer than its timestep count has
    # no valid alignment and yields infinite loss. One such row would otherwise
    # turn the whole run to NaN.
    criterion = nn.CTCLoss(blank=0, zero_infinity=True)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=args.epochs * len(train_dl), pct_start=0.15
    )

    history = []
    best = 1.0
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        running, seen = 0.0, 0
        for step, (x, targets, in_len, tgt_len, _) in enumerate(train_dl, 1):
            logp = model(x.to(device))
            # aten::_ctc_loss has no MPS kernel, so the loss is computed on CPU
            # while the convolutions and LSTM stay on the GPU. Autograd carries
            # gradients back across the device boundary, and the loss is cheap
            # next to the conv stack, so this costs far less than moving the
            # whole model to CPU. Done explicitly rather than via
            # PYTORCH_ENABLE_MPS_FALLBACK so the behaviour does not depend on an
            # environment variable someone forgot to set.
            loss = criterion(logp.cpu(), targets, in_len, tgt_len)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            # CTC gradients spike early, before the model learns to emit blanks.
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            running += loss.item()
            seen += 1
            if step % 100 == 0:
                print(f"    epoch {epoch} step {step}/{len(train_dl)} loss {running/seen:.3f}", flush=True)

        val_cer, val_exact = evaluate(model, val_dl, charset, device)
        mins = (time.time() - t0) / 60
        print(f"  epoch {epoch}: loss {running/max(seen,1):.3f} · val CER {val_cer:.3f} · exact {val_exact:.1%} · {mins:.1f}m", flush=True)
        history.append({"epoch": epoch, "loss": running / max(seen, 1), "val_cer": val_cer, "val_exact": val_exact})

        if val_cer < best:
            best = val_cer
            torch.save({"model": model.state_dict(), "charset": charset.chars, "val_cer": val_cer}, out / "recogniser.pt")
            print(f"    saved (best CER {best:.3f})", flush=True)

    (out / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"\n  best synthetic CER {best:.3f} -> {out/'recogniser.pt'}")
    print("  NOTE: synthetic validation. A real figure needs photographs.")


if __name__ == "__main__":
    main()

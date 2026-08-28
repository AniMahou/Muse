"""CRNN + CTC — the standard architecture for reading a line of text.

Three parts, and the shape of each is dictated by what CTC needs:

  CNN     the image -> a sequence of feature vectors along the WIDTH axis.
          Height is collapsed to 1 by pooling; width is preserved, because
          width is time. A 32x256 crop becomes 64 timesteps.
  BiLSTM  context along that sequence. Bengali needs it in both directions:
          the vowel sign ি is written BEFORE the consonant it is pronounced
          after, so a left-to-right-only model would have to guess.
  Linear  one logit per character, plus blank.

Why CTC rather than a per-character classifier: we have no character positions.
Labelling 50,000 images with bounding boxes would cost more than the model is
worth. CTC sums the probability over every alignment of the timestep sequence to
the target string, so (image, "প্রাণ") is a complete training example. That is
the property that makes synthetic data cheap enough to be worth generating.

Deliberately modest — 8.2M parameters. The task is a short line of text drawn
from a fixed vocabulary, not open-domain scene text, and a larger network on 50k
synthetic samples would learn our renderer rather than the language.
"""
from __future__ import annotations

import torch
import torch.nn as nn

IMG_H = 32


class CRNN(nn.Module):
    def __init__(self, n_classes: int, in_ch: int = 1, hidden: int = 256) -> None:
        super().__init__()

        def block(i: int, o: int, pool: tuple[int, int] | None) -> list[nn.Module]:
            layers: list[nn.Module] = [
                nn.Conv2d(i, o, 3, padding=1),
                nn.BatchNorm2d(o),
                nn.ReLU(inplace=True),
            ]
            if pool:
                layers.append(nn.MaxPool2d(pool, pool))
            return layers

        self.cnn = nn.Sequential(
            # Height halves at every stage. Width halves only twice, then keeps
            # its resolution — squeezing width would merge neighbouring
            # characters into one timestep, and CTC cannot emit two labels from
            # a single frame without a blank between them.
            *block(in_ch, 64, (2, 2)),    # 32x W   -> 16 x W/2
            *block(64, 128, (2, 2)),      # 16xW/2  ->  8 x W/4
            *block(128, 256, None),
            *block(256, 256, (2, 1)),     #  8xW/4  ->  4 x W/4
            *block(256, 512, None),
            *block(512, 512, (2, 1)),     #  4xW/4  ->  2 x W/4
            nn.Conv2d(512, 512, (2, 1)),  #  2xW/4  ->  1 x W/4
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
        )

        self.rnn = nn.LSTM(512, hidden, num_layers=2, bidirectional=True, batch_first=True, dropout=0.1)
        self.head = nn.Linear(hidden * 2, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """(B,1,32,W) -> log-probs (T,B,C), the layout CTCLoss expects."""
        f = self.cnn(x)                    # (B, 512, 1, T)
        f = f.squeeze(2).permute(0, 2, 1)  # (B, T, 512)
        f, _ = self.rnn(f)
        return self.head(f).permute(1, 0, 2).log_softmax(2)

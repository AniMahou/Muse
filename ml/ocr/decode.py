"""Turning CTC output into text, and into a confidence we can defend.

The confidence half is the part that matters to the rest of the system. Stage 6
scores every extracted field on `asr_conf(span) × resolver_margin × grammar_hit`,
and reads per-token confidence off the Transcript. An OCR adapter that returned
text without it would quietly flatten that term to a constant — the pipeline
would still run, flagging would stop discriminating, and nothing would say so.

CTC gives it to us honestly. The network emits a probability distribution over
the alphabet at every timestep, so the confidence of a character is the
probability the model actually assigned to it, and the confidence of a word is
the mean over the timesteps that produced it. That is a real measurement of the
model's own uncertainty, not a number invented after the fact.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import torch

from .charset import BLANK, Charset


@dataclass
class DecodedWord:
    text: str
    conf: float
    span: tuple[int, int] = (0, 0)


@dataclass
class Decoded:
    text: str
    conf: float
    words: list[DecodedWord] = field(default_factory=list)


def greedy(logprobs: torch.Tensor, charset: Charset) -> Decoded:
    """Best-path decode of one sample. `logprobs` is (T, C).

    CTC's collapse rule: take the argmax at each timestep, drop repeats, then
    drop blanks. The blank is what allows a genuine double letter — without one
    between them, two identical frames collapse to a single character.
    """
    probs = logprobs.exp()
    conf_t, ids_t = probs.max(dim=1)
    ids = ids_t.tolist()
    confs = conf_t.tolist()

    chars: list[str] = []
    char_confs: list[float] = []
    prev = -1
    for i, c in zip(ids, confs):
        if i != prev and i != BLANK:
            ch = charset.itos.get(i)
            if ch is not None:
                chars.append(ch)
                char_confs.append(c)
        prev = i

    text = "".join(chars)

    # Group into words, carrying each word's own mean confidence and its
    # character span in the returned string — spans are what let stage 6 ask
    # "how clearly was THIS product name read" rather than averaging the line.
    words: list[DecodedWord] = []
    start = 0
    buf: list[str] = []
    buf_conf: list[float] = []
    for idx, (ch, cf) in enumerate(zip(chars, char_confs)):
        if ch.isspace():
            if buf:
                words.append(DecodedWord("".join(buf), sum(buf_conf) / len(buf_conf), (start, idx)))
                buf, buf_conf = [], []
            start = idx + 1
        else:
            buf.append(ch)
            buf_conf.append(cf)
    if buf:
        words.append(DecodedWord("".join(buf), sum(buf_conf) / len(buf_conf), (start, len(chars))))

    overall = sum(char_confs) / len(char_confs) if char_confs else 0.0
    return Decoded(text=text, conf=overall, words=words)


def cer(reference: str, hypothesis: str) -> float:
    """Character error rate — the metric for a line recogniser.

    Word error rate is the wrong lens here: a price tag is often one token, so
    WER degenerates to right-or-wrong and hides whether the model got four of
    five characters.
    """
    r, h = list(reference), list(hypothesis)
    if not r:
        return 0.0 if not h else 1.0
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, hc in enumerate(h, 1):
            cur[j] = min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (rc != hc))
        prev = cur
    return prev[len(h)] / len(r)

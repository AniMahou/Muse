"""The model's output alphabet.

This is part of the trained artefact, not a runtime detail. A CTC head has one
output unit per character plus a blank, so the alphabet fixes the shape of the
final layer — a checkpoint trained on one charset cannot be loaded against
another. It ships beside the weights for that reason.

Bengali forces one real decision here: what counts as a character.

A naive answer is "a Unicode code point", and it is wrong. ক্ষ is three code
points (ক + virama + ষ) that a reader sees as one shape; ড় is two (ড + nukta)
that render as a single letter with a dot. Splitting those apart asks the model
to emit an invisible joiner between two glyphs it never saw separately, which it
cannot learn from images.

The alternative extreme — one class per visual cluster — explodes the alphabet
into the thousands, most of them appearing a handful of times.

So the split here is code points, with nukta sequences folded into their
precomposed forms first. That keeps the alphabet at ~100 classes while making
sure the model never has to predict a mark that has no independent appearance.
"""
from __future__ import annotations

import json
import unicodedata
from pathlib import Path

BLANK = 0  # CTC reserves index 0; a real character never occupies it.

# ড় ঢ় য় are each base + U+09BC and Unicode's composition exclusions mean NFC
# will never join them. Folded to the precomposed forms so the model sees one
# class per visible letter — the same normalisation the phonetic resolver does,
# for the same reason.
_NUKTA = {"ড়": "ড়", "ঢ়": "ঢ়", "য়": "য়"}


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    for decomposed, precomposed in _NUKTA.items():
        text = text.replace(decomposed, precomposed)
    return text


class Charset:
    def __init__(self, chars: list[str]) -> None:
        self.chars = chars
        self.stoi = {c: i + 1 for i, c in enumerate(chars)}  # 0 is blank
        self.itos = {i + 1: c for i, c in enumerate(chars)}

    @property
    def size(self) -> int:
        return len(self.chars) + 1

    @staticmethod
    def from_labels(path: str | Path) -> "Charset":
        chars: set[str] = set()
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if "\t" in line:
                chars.update(normalise(line.split("\t", 1)[1]))
        return Charset(sorted(chars))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps({"chars": self.chars}, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    @staticmethod
    def load(path: str | Path) -> "Charset":
        return Charset(json.loads(Path(path).read_text(encoding="utf-8"))["chars"])

    def encode(self, text: str) -> list[int]:
        return [self.stoi[c] for c in normalise(text) if c in self.stoi]

    def decode(self, ids: list[int]) -> str:
        return "".join(self.itos.get(i, "") for i in ids)

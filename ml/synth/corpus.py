"""What a Bangladeshi price tag or shelf label actually says.

The point of generating this ourselves, rather than reaching for a public
scene-text corpus, is that we know the vocabulary in advance. The words on the
tags a rep will photograph are the customer's own products — and proper nouns
are precisely where a general recogniser fails, for the same reason a general
acoustic model mangles them. A model trained on generic Bengali has never seen
"সার্ফ এক্সেল"; one trained on this has seen it ten thousand times.

Text is emitted in Bengali script because that is what appears on a tag in a
Dhaka shop, with Latin brand names mixed in because that is also true — a
carton reads "Surf Excel" while the handwritten price beside it reads ১২০৳.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path

BN_DIGITS = "০১২৩৪৫৬৭৮৯"

# Bengali renderings of the catalogue. Transliteration is not reversible and a
# machine guess produces spellings no shopkeeper writes, so these are stated.
BN_NAMES: dict[str, str] = {
    "PRAN Mango Juice": "প্রাণ ম্যাঙ্গো জুস",
    "PRAN Mango Drink": "প্রাণ ম্যাঙ্গো ড্রিংক",
    "PRAN Litchi Juice": "প্রাণ লিচি জুস",
    "PRAN Chanachur": "প্রাণ চানাচুর",
    "Surf Excel Powder": "সার্ফ এক্সেল পাউডার",
    "Lux Soap": "লাক্স সাবান",
    "Sunsilk Shampoo": "সানসিল্ক শ্যাম্পু",
    "Clear Shampoo": "ক্লিয়ার শ্যাম্পু",
    "Harpic Toilet Cleaner": "হারপিক",
    "Colgate Toothpaste": "কোলগেট টুথপেস্ট",
    "Wheel": "হুইল",
    "White Plus": "হোয়াইট প্লাস",
    "Rin Powder": "রিন পাউডার",
}

UNITS_BN = ["পিস", "কেজি", "লিটার", "প্যাকেট", "বোতল", "ডজন", "গ্রাম", "মিলি"]
PACKS = ["250ml", "500ml", "1L", "100g", "150g", "180ml", "500g", "1kg"]
OFFER_BN = ["অফার", "নতুন অফার", "ছাড়", "বিশেষ ছাড়", "১টি ফ্রি", "নতুন দাম"]


def to_bn_digits(n: int | str) -> str:
    return "".join(BN_DIGITS[int(c)] if c.isdigit() else c for c in str(n))


@dataclass
class Catalog:
    skus: list[dict]
    outlets: list[dict]

    @staticmethod
    def load(path: str | Path) -> "Catalog":
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        return Catalog(skus=d["skus"], outlets=d["outlets"])

    def product_names(self) -> list[str]:
        """Every way a product might be written, Bengali and Latin."""
        out: list[str] = []
        for s in self.skus:
            out.append(s["name"])
            if s["brand"] and s["brand"] != s["name"]:
                out.append(s["brand"])
            bn = BN_NAMES.get(s["name"])
            if bn:
                out.append(bn)
                # Bare brand in Bengali — how a shelf strip usually reads.
                out.append(bn.split()[0])
        return sorted(set(out))


def price(rng: random.Random) -> str:
    """A price the way it is actually written on a tag, which is many ways."""
    amount = rng.choice(
        [rng.randrange(5, 100), rng.randrange(100, 1000, 5), rng.randrange(1000, 5000, 50)]
    )
    bn = rng.random() < 0.65
    n = to_bn_digits(amount) if bn else str(amount)
    return rng.choice([f"৳{n}", f"৳ {n}", f"{n}৳", f"{n}/-", f"{n} টাকা", f"দাম {n}", n])


def quantity(rng: random.Random) -> str:
    n = rng.randrange(1, 60)
    n_s = to_bn_digits(n) if rng.random() < 0.7 else str(n)
    return f"{n_s} {rng.choice(UNITS_BN)}"


def line(cat: Catalog, rng: random.Random) -> str:
    """One line of text, weighted towards what dominates a real shelf."""
    names = cat.product_names()
    roll = rng.random()

    if roll < 0.34:                      # a price on its own — the commonest tag
        return price(rng)
    if roll < 0.62:                      # product, which is what we must resolve
        return rng.choice(names)
    if roll < 0.76:                      # product with its price, one tag
        return f"{rng.choice(names)} {price(rng)}"
    if roll < 0.84:
        return f"{rng.choice(names)} {rng.choice(PACKS)}"
    if roll < 0.90:
        return quantity(rng)
    if roll < 0.96:                      # promo signage — a competitor_promo
        return f"{rng.choice(names)} {rng.choice(OFFER_BN)}"
    return rng.choice([o["name"] for o in cat.outlets])


def corpus(cat: Catalog, n: int, seed: int = 0) -> list[str]:
    rng = random.Random(seed)
    return [line(cat, rng) for _ in range(n)]

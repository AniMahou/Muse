"""Discovering fonts that genuinely render Bengali.

The obvious check — render the text and see if anything appears — is wrong.
Pillow and FreeType both draw .notdef boxes for missing glyphs, so a font with
no Bengali at all produces a confident row of tofu. Probing this way reported
324 usable faces on a machine that has ten; Wingdings was among them.

The reliable question is whether the font's character map actually contains the
codepoints, which is what this asks.
"""
from __future__ import annotations

import glob
import os
from dataclasses import dataclass

from fontTools.ttLib import TTCollection, TTFont

# Consonant, sibilant, virama, nukta, a Bengali digit, the taka sign. A font
# needs real coverage; one stray codepoint means a fallback table, not support.
REQUIRED = [0x0995, 0x09B7, 0x09CD, 0x09BC, 0x09E7]
NICE_TO_HAVE = [0x09F3]  # ৳ — common on tags, absent from several good faces

SEARCH_DIRS = [
    "fonts",
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
    "/Library/Fonts",
    os.path.expanduser("~/Library/Fonts"),
    "/usr/share/fonts",
    "/usr/local/share/fonts",
]


@dataclass(frozen=True)
class Face:
    path: str
    index: int
    name: str
    has_taka: bool


def _faces(path: str):
    try:
        if path.lower().endswith(".ttc"):
            coll = TTCollection(path)
            for i, f in enumerate(coll.fonts):
                yield i, f
        else:
            yield 0, TTFont(path, fontNumber=0, lazy=True)
    except Exception:
        return


def discover(extra_dirs: list[str] | None = None) -> list[Face]:
    paths: list[str] = []
    for d in (extra_dirs or []) + SEARCH_DIRS:
        if not os.path.isdir(d):
            continue
        for ext in ("*.ttf", "*.otf", "*.ttc"):
            paths += glob.glob(os.path.join(d, "**", ext), recursive=True)

    out: list[Face] = []
    seen: set[str] = set()
    for p in sorted(set(paths)):
        for idx, f in _faces(p):
            try:
                cm = f.getBestCmap()
                if sum(1 for c in REQUIRED if c in cm) < len(REQUIRED):
                    continue
                name = (f["name"].getDebugName(4) or os.path.basename(p)) if f.get("name") else os.path.basename(p)
                # LastResort is the system's tofu font: full coverage, no shapes.
                if "LastResort" in name:
                    continue
                if name in seen:
                    continue
                seen.add(name)
                out.append(Face(p, idx, name, all(c in cm for c in NICE_TO_HAVE)))
            except Exception:
                pass
            finally:
                try:
                    f.close()
                except Exception:
                    pass
    return out

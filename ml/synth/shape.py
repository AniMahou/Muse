"""Bengali text shaping and rasterisation.

Pillow cannot do this on its own. Its basic layout engine draws glyphs in
logical order with no substitution or repositioning, which for Bengali means
two-part matras (ো, ৌ) come out as detached dotted circles — Unicode's
"unattached combining mark" placeholder — and nukta never joins its base.
Those forms are everywhere in real text, so a recogniser trained on that data
would learn letterforms that do not exist.

Pillow can delegate to Raqm, but Raqm is a build-time dependency and is absent
from most wheels, so relying on it makes the corpus silently wrong on some
machines and right on others. Doing the shaping explicitly is both portable and
honest about what is happening:

    HarfBuzz  text -> (glyph id, x/y offset, advance)   [GSUB/GPOS applied]
    FreeType  glyph id -> bitmap
    compose   bitmaps onto a canvas at the given positions

That is the same two-step every serious text renderer performs, and it is worth
understanding rather than delegating, because the failure mode when it is
missing is invisible: the image still looks like Bengali to someone who does not
read Bengali.
"""
from __future__ import annotations

import functools
from dataclasses import dataclass

import freetype
import numpy as np
import uharfbuzz as hb


@dataclass(frozen=True)
class ShapedGlyph:
    gid: int
    x: float
    y: float


@functools.lru_cache(maxsize=64)
def _hb_face(path: str, index: int) -> hb.Face:
    with open(path, "rb") as fh:
        data = fh.read()
    return hb.Face(data, index)


@functools.lru_cache(maxsize=64)
def _ft_face(path: str, index: int) -> freetype.Face:
    return freetype.Face(path, index)


def shape(text: str, font_path: str, size_px: int, face_index: int = 0) -> tuple[list[ShapedGlyph], float]:
    """Lay out `text`, returning positioned glyph ids and the total advance.

    Script and language are stated explicitly rather than guessed. HarfBuzz will
    infer them, but Bengali and Devanagari share reordering machinery with
    different details, and an autodetect miss produces subtly wrong matra
    placement rather than an error.
    """
    face = _hb_face(font_path, face_index)
    font = hb.Font(face)
    font.scale = (size_px * 64, size_px * 64)

    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction = "ltr"
    buf.script = "Beng"
    buf.language = "bn"
    hb.shape(font, buf)

    glyphs: list[ShapedGlyph] = []
    pen_x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        glyphs.append(
            ShapedGlyph(
                gid=info.codepoint,  # after GSUB this is a GLYPH id, not a codepoint
                x=(pen_x + pos.x_offset) / 64.0,
                y=pos.y_offset / 64.0,
            )
        )
        pen_x += pos.x_advance
    return glyphs, pen_x / 64.0


def render(
    text: str,
    font_path: str,
    size_px: int,
    face_index: int = 0,
    padding: int = 6,
) -> np.ndarray:
    """Render to a tight greyscale array, 0=ink, 255=paper."""
    glyphs, advance = shape(text, font_path, size_px, face_index)
    if not glyphs:
        return np.full((size_px, size_px), 255, dtype=np.uint8)

    ft = _ft_face(font_path, face_index)
    ft.set_pixel_sizes(0, size_px)

    # Generous canvas first, cropped at the end. Bengali ascenders and the
    # below-base forms of র and য় both overshoot the nominal em box.
    h = size_px * 3
    w = int(advance) + size_px * 2 + padding * 2
    canvas = np.zeros((h, w), dtype=np.float32)
    baseline = size_px * 2

    for g in glyphs:
        ft.load_glyph(g.gid, freetype.FT_LOAD_RENDER)
        bmp = ft.glyph.bitmap
        if bmp.width == 0 or bmp.rows == 0:
            continue
        patch = np.array(bmp.buffer, dtype=np.uint8).reshape(bmp.rows, bmp.pitch)[:, : bmp.width]

        x0 = int(round(g.x + ft.glyph.bitmap_left)) + padding
        y0 = int(round(baseline - g.y - ft.glyph.bitmap_top))
        if x0 < 0 or y0 < 0 or y0 + bmp.rows > h or x0 + bmp.width > w:
            continue
        # Marks overlap their base, so accumulate rather than overwrite.
        region = canvas[y0 : y0 + bmp.rows, x0 : x0 + bmp.width]
        np.maximum(region, patch, out=region)

    ink = 255 - np.clip(canvas, 0, 255).astype(np.uint8)
    ys, xs = np.where(ink < 250)
    if len(ys) == 0:
        return np.full((size_px, size_px), 255, dtype=np.uint8)
    return ink[
        max(0, ys.min() - padding) : ys.max() + padding + 1,
        max(0, xs.min() - padding) : xs.max() + padding + 1,
    ]

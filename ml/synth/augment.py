"""Turn a clean render into something that looks photographed.

A recogniser trained on crisp renders learns crisp renders. It then meets a
handheld phone photo of a laminated tag under a fluorescent tube and falls over,
and the failure is invisible until that moment because validation on held-out
SYNTHETIC data looks excellent.

Each degradation below corresponds to a specific thing that happens in a shop,
and they are applied in the order the physical world applies them: the print is
imperfect, the tag is lit unevenly and reflects, the camera is at an angle and
moves, the sensor is noisy, the file is compressed.
"""
from __future__ import annotations

import random

import cv2
import numpy as np


def _u8(x: np.ndarray) -> np.ndarray:
    return np.clip(x, 0, 255).astype(np.uint8)


def print_defects(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Local printing: ink spread, thin strokes, slight misregistration."""
    k = rng.choice([1, 1, 2])
    if rng.random() < 0.5:
        img = cv2.erode(img, np.ones((k, k), np.uint8))   # ink gain, strokes fatten
    elif rng.random() < 0.4:
        img = cv2.dilate(img, np.ones((k, k), np.uint8))  # under-inked, strokes thin
    return img


def lighting(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Uneven illumination and specular glare.

    A gradient across the tag is nearly universal indoors, and glare on plastic
    or lamination wipes out whole characters — which is why the model has to see
    it during training rather than meet it for the first time in a shop.
    """
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ang = rng.uniform(0, 2 * np.pi)
    grad = (np.cos(ang) * xx / max(w, 1) + np.sin(ang) * yy / max(h, 1))
    strength = rng.uniform(0.10, 0.40)
    out = img.astype(np.float32) * (1.0 - strength / 2 + strength * grad)

    if rng.random() < 0.30:
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        r = rng.uniform(0.15, 0.45) * max(h, w)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        out += np.exp(-(d ** 2) / (2 * r ** 2)) * rng.uniform(40, 110)

    return _u8(out)


def perspective(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """The camera is not square to the tag. Nobody's ever is."""
    h, w = img.shape[:2]
    m = rng.uniform(0.02, 0.10)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([
        [rng.uniform(0, m) * w, rng.uniform(0, m) * h],
        [w - rng.uniform(0, m) * w, rng.uniform(0, m) * h],
        [w - rng.uniform(0, m) * w, h - rng.uniform(0, m) * h],
        [rng.uniform(0, m) * w, h - rng.uniform(0, m) * h],
    ])
    return cv2.warpPerspective(
        img, cv2.getPerspectiveTransform(src, dst), (w, h),
        borderMode=cv2.BORDER_REPLICATE,
    )


def blur(img: np.ndarray, rng: random.Random) -> np.ndarray:
    r = rng.random()
    if r < 0.35:
        k = rng.choice([3, 5])
        return cv2.GaussianBlur(img, (k, k), 0)
    if r < 0.55:                                   # motion: a moving hand
        k = rng.choice([5, 7, 9])
        kern = np.zeros((k, k), np.float32)
        if rng.random() < 0.5:
            kern[k // 2, :] = 1.0 / k
        else:
            kern[:, k // 2] = 1.0 / k
        return cv2.filter2D(img, -1, kern)
    return img


def sensor_noise(img: np.ndarray, rng: random.Random) -> np.ndarray:
    out = img.astype(np.float32)
    out += np.random.normal(0, rng.uniform(2, 14), img.shape)
    if rng.random() < 0.15:                        # low light, high ISO
        n = int(img.size * rng.uniform(0.0005, 0.004))
        ys = np.random.randint(0, img.shape[0], n)
        xs = np.random.randint(0, img.shape[1], n)
        out[ys, xs] = np.random.choice([0, 255], n)
    return _u8(out)


def jpeg(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Phones save JPEG, and the artefacts sit exactly on character edges."""
    q = rng.randrange(30, 92)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), q])
    return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE) if ok else img


def degrade(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Physical order: printed, lit, photographed, digitised, compressed."""
    img = print_defects(img, rng)
    img = lighting(img, rng)
    img = perspective(img, rng)
    img = blur(img, rng)
    img = sensor_noise(img, rng)
    if rng.random() < 0.8:
        img = jpeg(img, rng)
    return img

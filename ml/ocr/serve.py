"""Serve the recogniser over HTTP.

    python -m ocr.serve --checkpoint checkpoints_ft_v1 --port 5179

A separate process rather than an ONNX export inside Node, chosen for a dull
reason: the model is a BiLSTM with a CTC head, exporting that graph has real
sharp edges, and the failure mode of a bad export is silently wrong output
rather than a crash. This runs the same PyTorch code the evaluation scores, so
what the product shows and what the report claims cannot drift apart.

TWO MODELS ARE NEEDED TO READ A PHOTOGRAPH AND WE ONLY TRAINED ONE. The
recogniser reads a single cropped line. Finding the lines is detection, which
is a learned model we have not built, so `ocr.propose` stands in — classical
morphology, no training, and visibly weaker than a real detector. Every
limitation of the output below is at least as likely to come from detection as
from recognition, and the reported confidence covers only the recognition half.
"""
from __future__ import annotations

import argparse
import base64
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2
import numpy as np
import torch

from .charset import Charset
from .decode import greedy
from .model import CRNN, IMG_H
from .propose import proposals

STATE: dict = {}


def recognise(image_bytes: bytes) -> dict:
    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return {"text": "", "words": [], "lines": 0, "error": "undecodable image"}

    model, charset = STATE["model"], STATE["charset"]

    # Enlarge small frames before detecting: every morphological size in the
    # proposer is absolute, so a distant shelf yields no lines at scale 1.
    scale = 3.0 if max(img.shape[:2]) < 2200 else 2.0
    boxes = proposals(img, scale=scale)[: STATE["max_lines"]]

    words: list[dict] = []
    pieces: list[str] = []
    for x, y, w, h in boxes:
        crop = img[max(0, y) : y + h, max(0, x) : x + w]
        if crop.size == 0:
            continue
        grey = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        k = IMG_H / grey.shape[0]
        grey = cv2.resize(grey, (max(8, int(grey.shape[1] * k)), IMG_H),
                          interpolation=cv2.INTER_LANCZOS4)
        x_t = torch.from_numpy(grey.astype(np.float32) / 127.5 - 1.0).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            out = greedy(model(x_t)[:, 0, :], charset)
        if not out.text.strip():
            continue
        pieces.append(out.text.strip())
        for wd in out.words:
            words.append({"w": wd.text, "conf": round(wd.conf, 4)})

    return {"text": " ".join(pieces), "words": words, "lines": len(pieces)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:  # quiet
        pass

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True, "model": STATE["name"], "classes": STATE["charset"].size})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/recognise":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        image = base64.b64decode(body.get("image", ""))
        if not image:
            self._json(400, {"error": "no image"})
            return
        try:
            self._json(200, recognise(image))
        except Exception as err:  # noqa: BLE001 - surface it, do not hang the caller
            self._json(500, {"error": f"{type(err).__name__}: {err}"})

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default="checkpoints_ft_v1")
    ap.add_argument("--port", type=int, default=5179)
    ap.add_argument("--max-lines", type=int, default=24)
    args = ap.parse_args()

    blob = torch.load(f"{args.checkpoint}/recogniser.pt", map_location="cpu")
    charset = Charset(blob["charset"])
    model = CRNN(charset.size)
    model.load_state_dict(blob["model"])
    model.eval()

    STATE.update(model=model, charset=charset, name=args.checkpoint, max_lines=args.max_lines)
    print(f"  {args.checkpoint} · {charset.size} classes · listening on :{args.port}", flush=True)
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

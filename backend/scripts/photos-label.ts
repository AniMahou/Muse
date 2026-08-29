/**
 * Draw a box round a line of text, type what it says, save the crop.
 *
 *   npm run photos:label
 *
 * The image counterpart of scripts/transcribe.ts, and it exists for the same
 * reason: a photograph without a human-written ground truth is not data, it is
 * a picture. Forty labelled line crops are worth more than four hundred loose
 * photos.
 *
 * WHY A BOX IS REQUIRED. The recogniser reads ONE line, 32 pixels tall — that
 * is the shape it was trained on. A phone photo is a scene: a tag, a shelf
 * edge, a hand, a floor. Feeding the whole frame in would measure our missing
 * text DETECTOR, not the recogniser, and would report a terrible number for
 * the wrong reason. Drawing the box by hand separates the two questions, and
 * leaves an honest statement of what has been measured: given a correctly
 * cropped line, how well does this read Bangla?
 *
 * It is a browser tool rather than a terminal one because cropping is a
 * pointing task, and asking anyone to type pixel coordinates would guarantee
 * bad boxes.
 *
 * Crops are written in the SAME format as the synthetic training data —
 * greyscale, 32px tall, aspect preserved — so the real and synthetic numbers
 * are measured on identically shaped inputs and the gap between them means
 * only what it should.
 */
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const ROOT = path.resolve(process.cwd(), "datasets/photos");
const LINES = path.join(ROOT, "lines");
const LABELS = path.join(ROOT, "labels.jsonl");
const KINDS = ["printed", "handwritten"] as const;
const PORT = Number(process.env.PORT ?? 5178);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"]);

interface LabelRow {
  lineId: string;
  photoId: string;
  kind: string;
  box: { x: number; y: number; w: number; h: number };
  text: string;
  at: string;
}

async function readLabels(): Promise<LabelRow[]> {
  const raw = await fs.readFile(LABELS, "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as LabelRow);
}

async function listPhotos(): Promise<Array<{ photoId: string; kind: string; file: string }>> {
  const out: Array<{ photoId: string; kind: string; file: string }> = [];
  for (const kind of KINDS) {
    const dir = path.join(ROOT, kind);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isFile() || !IMAGE.has(path.extname(e.name).toLowerCase())) continue;
      out.push({ photoId: path.parse(e.name).name, kind, file: path.join(dir, e.name) });
    }
  }
  return out;
}

/**
 * Crop to the box and normalise to the training shape.
 *
 * Lanczos rather than the default: downscaling a phone photo to 32px tall is a
 * large reduction, and a cheap filter turns thin Bengali strokes — the matra
 * bar above all — into grey mush that no recogniser could read. The synthetic
 * data was rendered crisp, so a soft resample here would show up as a domain
 * gap that is really just our own resizing.
 */
async function crop(src: string, box: LabelRow["box"], dest: string): Promise<void> {
  await exec("ffmpeg", [
    "-v", "error", "-y", "-i", src,
    "-vf", `crop=${Math.round(box.w)}:${Math.round(box.h)}:${Math.round(box.x)}:${Math.round(box.y)},` +
      `scale=-1:32:flags=lanczos,format=gray`,
    // Drop the source colour profile. ffmpeg otherwise copies the phone's RGB
    // ICC profile onto a greyscale PNG, which is invalid, and every reader
    // downstream warns about it once per image.
    "-map_metadata", "-1", "-frames:v", "1", dest,
  ]);
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>Muse — label photos</title>
<style>
  :root { color-scheme: light dark; --line: #8888; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 20px; max-width: 1100px; }
  header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 12px; }
  h1 { font-size: 17px; margin: 0; }
  .count { opacity: .6; font-size: 13px; }
  #stage { position: relative; display: inline-block; border: 1px solid var(--line); line-height: 0; }
  #stage img { max-width: 100%; max-height: 62vh; }
  #box { position: absolute; border: 2px solid #e11; background: #e1111a; pointer-events: none; }
  #text { width: 100%; font-size: 22px; padding: 10px; margin-top: 12px; box-sizing: border-box; }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  button { font-size: 15px; padding: 8px 16px; cursor: pointer; }
  kbd { border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-size: 12px; }
  .hint { opacity: .65; font-size: 13px; }
  .done { padding: 40px 0; font-size: 17px; }
  #saved { min-height: 20px; font-size: 13px; opacity: .75; margin-top: 8px; }
</style>
<header>
  <h1 id="who">—</h1><span class="count" id="count"></span>
</header>
<div id="app"></div>
<script>
let photos = [], i = 0, box = null, drag = null, img = null;

async function load() {
  photos = await (await fetch('/api/photos')).json();
  if (photos.length === 0) {
    document.getElementById('app').innerHTML =
      '<div class="done">Nothing left to label. Run <code>npm run photos:score</code>.</div>';
    document.getElementById('who').textContent = 'all done';
    return;
  }
  render();
}

function render() {
  const p = photos[i];
  document.getElementById('who').textContent = p.photoId + '  (' + p.kind + ')';
  document.getElementById('count').textContent = (i + 1) + ' of ' + photos.length;
  document.getElementById('app').innerHTML =
    '<div id="stage"><img id="img" src="/img/' + p.kind + '/' + p.photoId + '"><div id="box" hidden></div></div>' +
    '<input id="text" placeholder="type exactly what the line says" autocomplete="off">' +
    '<div class="row">' +
      '<button onclick="save()">Save line</button>' +
      '<button onclick="skip()">Skip photo</button>' +
      '<span class="hint">drag a box round ONE line, type it, <kbd>Enter</kbd> to save. ' +
      'Several lines? save one, then drag the next.</span>' +
    '</div><div id="saved"></div>';
  box = null;
  img = document.getElementById('img');
  const stage = document.getElementById('stage');
  stage.onpointerdown = e => {
    const r = img.getBoundingClientRect();
    drag = { x: e.clientX - r.left, y: e.clientY - r.top };
    stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove = e => {
    if (!drag) return;
    const r = img.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    box = { x: Math.min(x, drag.x), y: Math.min(y, drag.y),
            w: Math.abs(x - drag.x), h: Math.abs(y - drag.y) };
    const el = document.getElementById('box');
    el.hidden = false;
    el.style.left = box.x + 'px'; el.style.top = box.y + 'px';
    el.style.width = box.w + 'px'; el.style.height = box.h + 'px';
  };
  stage.onpointerup = () => { drag = null; document.getElementById('text').focus(); };
  document.getElementById('text').onkeydown = e => { if (e.key === 'Enter') save(); };
}

async function save() {
  const text = document.getElementById('text').value.trim();
  const note = document.getElementById('saved');
  if (!box || box.w < 8 || box.h < 8) { note.textContent = 'draw a box first'; return; }
  if (!text) { note.textContent = 'type what it says first'; return; }
  // Displayed pixels -> original pixels. The image is scaled to fit the screen.
  const scale = img.naturalWidth / img.clientWidth;
  const res = await fetch('/api/label', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ photoId: photos[i].photoId, kind: photos[i].kind, text,
      box: { x: box.x * scale, y: box.y * scale, w: box.w * scale, h: box.h * scale } }) });
  const j = await res.json();
  if (!res.ok) { note.textContent = 'failed: ' + (j.error || res.status); return; }
  note.textContent = 'saved ' + j.lineId + ' — drag another line, or Skip photo to move on';
  document.getElementById('text').value = '';
  document.getElementById('box').hidden = true;
  box = null;
}

function skip() { i++; i < photos.length ? render() : load(); }
load();
</script>`;

async function main(): Promise<void> {
  await fs.mkdir(LINES, { recursive: true });
  const photos = await listPhotos();

  if (photos.length === 0) {
    console.log("no photos in datasets/photos/ — run: npm run photos -- <folder>");
    return;
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGE);
        return;
      }

      if (url.pathname === "/api/photos") {
        const labelled = new Set((await readLabels()).map((l) => l.photoId));
        const pending = (await listPhotos()).filter((p) => !labelled.has(p.photoId));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(pending.map(({ photoId, kind }) => ({ photoId, kind }))));
        return;
      }

      if (url.pathname.startsWith("/img/")) {
        const [, , kind, photoId] = url.pathname.split("/");
        const match = (await listPhotos()).find((p) => p.photoId === photoId && p.kind === kind);
        if (!match) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(await fs.readFile(match.file));
        return;
      }

      if (url.pathname === "/api/label" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Omit<LabelRow, "lineId" | "at">;

        const source = (await listPhotos()).find(
          (p) => p.photoId === body.photoId && p.kind === body.kind,
        );
        if (!source) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "unknown photo" }));
          return;
        }

        const existing = (await readLabels()).filter((l) => l.photoId === body.photoId).length;
        const lineId = `${body.photoId}-${existing + 1}`;
        try {
          await crop(source.file, body.box, path.join(LINES, `${lineId}.png`));
        } catch (err) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: `crop failed: ${String(err).slice(0, 200)}` }));
          return;
        }

        const row: LabelRow = { lineId, ...body, at: new Date().toISOString() };
        await fs.appendFile(LABELS, `${JSON.stringify(row)}\n`, "utf8");
        console.log(`  ${lineId}  ${body.text}`);

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ lineId }));
        return;
      }

      res.writeHead(404).end();
    })().catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  server.listen(PORT, () => {
    console.log(`  ${photos.length} photo(s) ready`);
    console.log(`  open http://localhost:${PORT}`);
    console.log(`  crops -> datasets/photos/lines/   labels -> datasets/photos/labels.jsonl`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

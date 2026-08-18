import { promises as fs } from "node:fs";
import path from "node:path";

export interface TraceEntry {
  stage: string;
  ms: number;
  cached: boolean;
  input: unknown;
  output: unknown;
  error?: string;
}

/**
 * Per-clip, per-stage input and output dumps.
 *
 * The debugging loop this exists for: field accuracy drops, and the question
 * is immediately "which stage?". Without traces that means re-running with
 * console logs; with them it is one file showing exactly what each stage saw
 * and produced. Twenty lines of code that pay for themselves the first day.
 *
 * Audio is never written — only its length — so a trace directory stays small
 * enough to keep around and safe enough to paste into a bug report.
 */
export class Tracer {
  private readonly entries: TraceEntry[] = [];

  constructor(
    private readonly clipId: string,
    private readonly dir: string,
    private readonly enabled: boolean,
  ) {}

  record(entry: TraceEntry): void {
    if (!this.enabled) return;
    this.entries.push({ ...entry, input: redact(entry.input), output: redact(entry.output) });
  }

  async flush(meta: Record<string, unknown> = {}): Promise<string | null> {
    if (!this.enabled || this.entries.length === 0) return null;

    const day = new Date().toISOString().slice(0, 10);
    const outDir = path.join(this.dir, day);
    await fs.mkdir(outDir, { recursive: true });

    const file = path.join(outDir, `${this.clipId}.json`);
    const body = {
      clipId: this.clipId,
      tracedAt: new Date().toISOString(),
      totalMs: this.entries.reduce((a, e) => a + e.ms, 0),
      ...meta,
      stages: this.entries,
    };
    await fs.writeFile(file, JSON.stringify(body, null, 2), "utf8");
    return file;
  }
}

/** Replace binary payloads with a size marker so traces stay readable. */
function redact(value: unknown): unknown {
  if (value instanceof Uint8Array) return `<${value.byteLength} bytes>`;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v)]),
    );
  }
  return value;
}

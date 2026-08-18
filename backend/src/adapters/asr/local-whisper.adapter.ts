import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Transcript, Word } from "@shared/stage-io";
import type { AsrRequest, IAsrProvider } from "@/pipeline/ports";
import { ProviderError } from "@/common/errors";
import { attachSpans } from "@/common/transcript";
import { segmentConfidence } from "./confidence";

const exec = promisify(execFile);

interface WhisperCppJson {
  transcription?: Array<{
    text?: string;
    offsets?: { from?: number; to?: number };
    tokens?: Array<{ text?: string; p?: number }>;
  }>;
}

/**
 * whisper.cpp running on this machine.
 *
 * No API key, no network, no rate limit — and, more importantly, no data
 * leaving the customer's infrastructure. That last point is not a fallback
 * position but a feature worth leading with: a brand manager at a company
 * like Unilever will ask where field audio goes, and "it never leaves your
 * servers" is a better answer than any accuracy number.
 *
 * Slower than the hosted options, so the hosted path stays the default for
 * iteration while this is what gets demonstrated when data residency comes up.
 */
export class LocalWhisperProvider implements IAsrProvider {
  readonly name = "local";

  constructor(
    private readonly binPath: string,
    readonly model: string,
    private readonly timeoutMs = 300_000,
  ) {}

  async transcribe(req: AsrRequest): Promise<Transcript> {
    if (!this.binPath) {
      throw new ProviderError(this.name, "WHISPER_CPP_BIN is not set", false);
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "muse-asr-"));
    const audioPath = path.join(dir, `${req.clipId}.wav`);
    const outBase = path.join(dir, req.clipId);

    try {
      await fs.writeFile(audioPath, req.audio);

      const args = [
        "-m", this.model,
        "-f", audioPath,
        "--output-json",
        "--output-file", outBase,
        "-l", req.language ?? "bn",
        "-nt",
      ];

      await exec(this.binPath, args, { timeout: this.timeoutMs, maxBuffer: 32 * 1024 * 1024 });

      const raw = await fs.readFile(`${outBase}.json`, "utf8");
      const parsed = JSON.parse(raw) as WhisperCppJson;
      return this.toTranscript(parsed, req);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        this.name,
        err instanceof Error ? err.message : String(err),
        false, // a local failure is configuration, not transient load
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private toTranscript(parsed: WhisperCppJson, req: AsrRequest): Transcript {
    const segments = parsed.transcription ?? [];
    const text = segments.map((s) => (s.text ?? "").trim()).filter(Boolean).join(" ").trim();

    // whisper.cpp reports a probability per TOKEN, which is finer-grained
    // than any hosted API gives us. Tokens are sub-word, so the mean over a
    // segment's tokens is used as that segment's confidence.
    const bare: Array<Omit<Word, "span">> = [];
    for (const seg of segments) {
      const tokens = seg.tokens ?? [];
      const probs = tokens.map((t) => t.p).filter((p): p is number => typeof p === "number");
      const conf =
        probs.length > 0
          ? probs.reduce((a, b) => a + b, 0) / probs.length
          : segmentConfidence({});

      const from = (seg.offsets?.from ?? 0) / 1000;
      const to = (seg.offsets?.to ?? 0) / 1000;
      for (const w of (seg.text ?? "").split(/\s+/).filter(Boolean)) {
        bare.push({ w, start: from, end: to, conf: Math.max(0, Math.min(1, conf)) });
      }
    }

    const last = segments[segments.length - 1];
    return {
      text,
      words: attachSpans(text, bare),
      language: req.language ?? "bn",
      durationSec: last?.offsets?.to ? last.offsets.to / 1000 : null,
      provider: this.name,
      model: this.model,
      // Token probabilities are a real per-token signal, not a segment value
      // spread across words.
      confidenceDerived: false,
    };
  }
}

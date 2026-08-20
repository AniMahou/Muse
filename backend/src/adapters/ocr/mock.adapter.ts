import type { Transcript } from "@shared/stage-io";
import type { IOcrProvider, OcrRequest } from "@/pipeline/ports";
import { transcriptFromText } from "@/common/transcript";
import { sha256 } from "@/common/hash";

/**
 * Stand-in for handwriting recognition.
 *
 * SIMULATED, and it says so: `simulated: true` propagates onto the clip and
 * every surface that displays it, so nothing in the product claims to have
 * read pixels when it has not.
 *
 * What is NOT simulated is everything after this point. The text produced here
 * goes through the same quantity grammar, the same phonetic resolver, the same
 * assembly and the same confidence gate as speech. That is the useful part of
 * building it this way: the photo path exercises the real pipeline, and
 * replacing this class with a genuine OCR model later touches one file.
 *
 * Samples are written the way a rep's order pad actually reads — abbreviated,
 * unpunctuated, with the spelling drift a recogniser would produce — rather
 * than as clean sentences, so the resolvers face a realistic input.
 */
const SAMPLES: Array<{ text: string; confidence: number }> = [
  {
    text: "বিজয় স্টোর প্রান ম্যাংগো জুস ২ ডজন লাগবে হুইল এর নতুন অফার ৫ টাকা কম",
    confidence: 0.71,
  },
  {
    text: "রহমান স্টোর লাক্স সাবান দেড় ডজন সানসিল্ক শ্যাম্পু ১০ পিস",
    confidence: 0.66,
  },
  {
    text: "নিউ আলম এন্টারপ্রাইজ সার্ফ এক্সেল ৩ কার্টন রিন পাউডার শেষ",
    confidence: 0.63,
  },
  {
    text: "বিজয় স্টোর কোলগেট টুথপেস্ট ২ ডজন হারপিক ৫ পিস দাম বেড়েছে ১০ টাকা",
    confidence: 0.69,
  },
];

export class MockOcrProvider implements IOcrProvider {
  readonly name = "mock-ocr";
  readonly model = "handwriting-demo";
  readonly simulated = true;

  async recognise(req: OcrRequest): Promise<Transcript> {
    // Deterministic on the image bytes: the same photo always yields the same
    // reading, so a demo can be rehearsed and a trace re-run reproducibly.
    const digest = sha256(req.image);
    const index = parseInt(digest.slice(0, 8), 16) % SAMPLES.length;
    const sample = SAMPLES[index]!;

    // A little latency, because an instant result looks fake on video and
    // hides the loading state that real recognition would show.
    await new Promise((r) => setTimeout(r, 600));

    const transcript = transcriptFromText(sample.text, {
      conf: sample.confidence,
      provider: this.name,
      model: this.model,
      language: req.language ?? "bn",
      confidenceDerived: true,
    });

    // Vary confidence per word so the review UI shades realistically instead
    // of rendering one flat colour across the whole line.
    transcript.words = transcript.words.map((w, i) => ({
      ...w,
      conf: clamp(sample.confidence + wobble(digest, i)),
    }));

    return transcript;
  }
}

function wobble(digest: string, i: number): number {
  const byte = parseInt(digest.slice((i * 2) % 60, ((i * 2) % 60) + 2), 16);
  return (byte / 255 - 0.5) * 0.34;
}

function clamp(n: number): number {
  return Math.max(0.15, Math.min(0.98, Number(n.toFixed(4))));
}

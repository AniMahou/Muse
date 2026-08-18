import { describe, it, expect } from "vitest";
import { TranscribeStage } from "./index";
import { FakeAsrProvider } from "@/adapters/asr/fake.adapter";
import { ProviderError } from "@/common/errors";
import { transcriptFromText } from "@/common/transcript";

const audio = new Uint8Array([1, 2, 3, 4]);

function stageWith(clips: Record<string, string>) {
  return new TranscribeStage(new FakeAsrProvider(clips));
}

describe("TranscribeStage", () => {
  it("returns the provider's transcript", async () => {
    const stage = stageWith({ c1: "দেড় ডজন লাগবে" });
    const { transcript } = await stage.run({ clipId: "c1", audio, mimeType: "audio/webm" });
    expect(transcript.text).toBe("দেড় ডজন লাগবে");
  });

  it("passes the requested language through", async () => {
    const stage = stageWith({ c1: "পরীক্ষা" });
    const { transcript } = await stage.run({
      clipId: "c1",
      audio,
      mimeType: "audio/webm",
      language: "bn",
    });
    expect(transcript.language).toBe("bn");
  });

  it("rejects empty audio without calling the provider", async () => {
    const stage = stageWith({});
    await expect(
      stage.run({ clipId: "c1", audio: new Uint8Array(0), mimeType: "audio/webm" }),
    ).rejects.toThrow(ProviderError);
  });

  it("rejects an empty transcription as retryable", async () => {
    const stage = new TranscribeStage(new FakeAsrProvider({ c1: "   " }));
    await expect(
      stage.run({ clipId: "c1", audio, mimeType: "audio/webm" }),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("propagates an unknown clip rather than inventing one", async () => {
    const stage = stageWith({ c1: "hello" });
    await expect(
      stage.run({ clipId: "missing", audio, mimeType: "audio/webm" }),
    ).rejects.toThrow(/no fixture/);
  });

  it("preserves word spans supplied by the provider", async () => {
    const provider = new FakeAsrProvider();
    provider.set("c1", transcriptFromText("বিজয় স্টোরে দেড় ডজন", { conf: 0.6 }));
    const stage = new TranscribeStage(provider);
    const { transcript } = await stage.run({ clipId: "c1", audio, mimeType: "audio/webm" });
    for (const w of transcript.words) {
      expect(transcript.text.slice(w.span[0], w.span[1])).toBe(w.w);
    }
  });
});

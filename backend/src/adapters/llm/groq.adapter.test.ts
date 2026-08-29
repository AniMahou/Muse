import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { GroqLlmProvider } from "./groq.adapter";
import { ProviderError } from "@/common/errors";

const SCHEMA = z.object({ ok: z.boolean() });

function reply(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

function complete(fetchImpl: ReturnType<typeof reply>, maxTokens?: number) {
  vi.stubGlobal("fetch", fetchImpl);
  const provider = new GroqLlmProvider("test-model", "test-key");
  return provider.complete({
    system: "s",
    user: "u",
    schema: SCHEMA,
    schemaName: "T",
    ...(maxTokens === undefined ? {} : { maxTokens }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("token budget", () => {
  it("reserves the shared default rather than the provider's", async () => {
    // Groq bills prompt + max_tokens the moment the request is accepted, so
    // this number is a daily-allowance decision, not just a safety rail.
    const f = reply({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    await complete(f);
    const body = JSON.parse(f.mock.calls[0]![1].body as string);
    expect(body.max_tokens).toBe(1600);
  });

  it("lets a caller ask for more", async () => {
    const f = reply({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    await complete(f, 4096);
    expect(JSON.parse(f.mock.calls[0]![1].body as string).max_tokens).toBe(4096);
  });
});

describe("truncation", () => {
  it("fails NON-retryably when the reply hit the ceiling", async () => {
    // At temperature 0 a retry truncates in the same place, so retrying spends
    // the daily allowance on a request that cannot succeed.
    const f = reply({ choices: [{ message: { content: '{"ok":tr' }, finish_reason: "length" }] });
    await expect(complete(f)).rejects.toMatchObject({ retryable: false });
  });

  it("names the ceiling instead of blaming the JSON", async () => {
    const f = reply({ choices: [{ message: { content: '{"ok":tr' }, finish_reason: "length" }] });
    await expect(complete(f)).rejects.toThrow(/1600-token ceiling.*truncated/s);
  });

  it("still treats genuinely malformed JSON as retryable", async () => {
    const f = reply({ choices: [{ message: { content: "not json" }, finish_reason: "stop" }] });
    const err = await complete(f).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
  });
});

describe("a truncated structured reply", () => {
  const TRUNCATED_400 = {
    error: {
      message: "Failed to validate JSON. Please adjust your prompt.",
      code: "json_validate_failed",
      failed_generation: "",
    },
  };

  it("says the reply was cut off rather than malformed", async () => {
    // Groq does not report this as finish_reason "length". It is a 400 that
    // reads exactly like a schema bug, and it cost real time to diagnose once.
    await expect(complete(reply(TRUNCATED_400, 400))).rejects.toThrow(/CUT OFF, not malformed/);
  });

  it("names the ceiling that caused it", async () => {
    await expect(complete(reply(TRUNCATED_400, 400))).rejects.toThrow(/max_tokens is 1600/);
  });

  it("does not retry it", async () => {
    await expect(complete(reply(TRUNCATED_400, 400))).rejects.toMatchObject({ retryable: false });
  });

  it("leaves a genuine schema rejection reading as itself", async () => {
    const real = { error: { code: "json_validate_failed", failed_generation: '{"ok":"yes"}' } };
    await expect(complete(reply(real, 400))).rejects.not.toThrow(/CUT OFF/);
  });
});

describe("reasoning effort", () => {
  it("is omitted unless asked for, leaving the provider default", async () => {
    const f = reply({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    await complete(f);
    expect(JSON.parse(f.mock.calls[0]![1].body as string)).not.toHaveProperty("reasoning_effort");
  });

  it("is passed through when set", async () => {
    const f = reply({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    vi.stubGlobal("fetch", f);
    await new GroqLlmProvider("m", "k").complete({
      system: "s", user: "u", schema: SCHEMA, schemaName: "T", reasoningEffort: "low",
    });
    expect(JSON.parse(f.mock.calls[0]![1].body as string).reasoning_effort).toBe("low");
  });
});

describe("identifying ourselves", () => {
  it("sends a User-Agent, without which Cloudflare returns 1010", async () => {
    const f = reply({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    await complete(f);
    const headers = f.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^Muse\//);
  });
});

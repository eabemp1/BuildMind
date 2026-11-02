import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["GROQ_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "GEMINI_PREFERRED", "GEMINI_MODEL"] as const;
const saved: Record<string, string | undefined> = {};

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const groqOk = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) process.env[k] = "";
  process.env.GEMINI_API_KEY = "g-key";
  process.env.GROQ_API_KEY = "q-key";
  process.env.GEMINI_MODEL = "gemini-3.8-flash";
  vi.resetModules();
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, body: any) => Response) {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url: String(url), body });
    return handler(String(url), body);
  }));
  return calls;
}

describe("callModel prefer: gemini", () => {
  it("asks Gemini first, with a thinking level, and returns its answer", async () => {
    const calls = stubFetch((url) => (url.includes("generativelanguage") ? ok("from gemini") : groqOk("from groq")));
    const { callModel } = await import("../../lib/ai-providers");
    const out = await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" });
    expect(out).toBe("from gemini");
    expect(calls[0].url).toContain("generativelanguage");
    expect(calls[0].body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
  });

  it("does not use Gemini first when prefer is not set (Today stays on its normal chain)", async () => {
    const calls = stubFetch((url) => (url.includes("generativelanguage") ? ok("from gemini") : groqOk("from groq")));
    const { callModel } = await import("../../lib/ai-providers");
    const out = await callModel([{ role: "user", content: "hi" }], {});
    expect(out).toBe("from groq");
    expect(calls[0].url).not.toContain("generativelanguage");
  });

  it("is switched off by GEMINI_PREFERRED=off", async () => {
    process.env.GEMINI_PREFERRED = "off";
    stubFetch((url) => (url.includes("generativelanguage") ? ok("from gemini") : groqOk("from groq")));
    const { callModel } = await import("../../lib/ai-providers");
    expect(await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" })).toBe("from groq");
  });

  it("retries once without the thinking setting when Google rejects it", async () => {
    const calls = stubFetch((url, body) => {
      if (!url.includes("generativelanguage")) return groqOk("from groq");
      return body.generationConfig.thinkingConfig
        ? new Response("thinkingLevel is not supported", { status: 400 })
        : ok("gemini no thinking");
    });
    const { callModel } = await import("../../lib/ai-providers");
    expect(await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" })).toBe("gemini no thinking");
    expect(calls).toHaveLength(2);
  });

  it("moves to the next Gemini model on 503, then to the next provider when all are busy", async () => {
    const calls = stubFetch((url) => (url.includes("generativelanguage") ? new Response("busy", { status: 503 }) : groqOk("from groq")));
    const { callModel } = await import("../../lib/ai-providers");
    expect(await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" })).toBe("from groq");
    const geminiUrls = calls.filter((c) => c.url.includes("generativelanguage")).map((c) => c.url);
    expect(geminiUrls).toHaveLength(3);
    expect(geminiUrls[0]).toContain("gemini-3.8-flash");
    expect(geminiUrls[1]).toContain("gemini-3.7-flash");
    expect(geminiUrls[2]).toContain("gemini-3.6-flash");
  });

  it("uses the next Gemini model's answer when the first is busy", async () => {
    stubFetch((url) => (url.includes("gemini-3.8-flash") ? new Response("busy", { status: 503 }) : url.includes("generativelanguage") ? ok("from 3.7") : groqOk("from groq")));
    const { callModel } = await import("../../lib/ai-providers");
    expect(await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" })).toBe("from 3.7");
  });

  it("skips a busy model on the next request instead of waiting on it again", async () => {
    const calls = stubFetch((url) => (url.includes("gemini-3.8-flash") ? new Response("busy", { status: 503 }) : url.includes("generativelanguage") ? ok("from 3.7") : groqOk("from groq")));
    const { callModel } = await import("../../lib/ai-providers");
    await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" });
    calls.length = 0;
    await callModel([{ role: "user", content: "again" }], { prefer: "gemini" });
    expect(calls.some((c) => c.url.includes("gemini-3.8-flash"))).toBe(false);
  });

  it("ignores thought parts in the reply", async () => {
    stubFetch(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: "the answer" }] } }] }), { status: 200 }));
    const { callModel } = await import("../../lib/ai-providers");
    expect(await callModel([{ role: "user", content: "hi" }], { prefer: "gemini" })).toBe("the answer");
  });
});

describe("Gemini timeout ceiling", () => {
  it("never waits more than 14s for one Gemini attempt, even if asked for more", async () => {
    const signals: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => { signals.push(ms); return new AbortController().signal; });
    stubFetch((url) => (url.includes("generativelanguage") ? ok("x") : groqOk("y")));
    const { callModel } = await import("../../lib/ai-providers");
    await callModel([{ role: "user", content: "hi" }], { prefer: "gemini", geminiTimeoutMs: 60_000 });
    expect(Math.max(...signals)).toBeLessThanOrEqual(14_000);
    expect(Math.max(...signals)).toBeGreaterThan(13_000);
    spy.mockRestore();
  });
});

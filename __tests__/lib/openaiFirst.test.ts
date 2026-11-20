import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["OPENAI_API_KEY", "OPENAI_FIRST", "OPENAI_MODEL", "GROQ_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; vi.resetModules(); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); });

const reply = (text: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }), text: async () => text });

describe("OpenAI goes first when its key is set (fetch is mocked; no real call is made)", () => {
  it("is tried before Groq for fast and reasoning calls, and no other provider is called when it succeeds", async () => {
    process.env.OPENAI_API_KEY = "sk-test"; delete process.env.OPENAI_FIRST; process.env.GROQ_API_KEY = "gsk-test";
    const fetchMock = vi.fn(async () => reply("hello"));
    vi.stubGlobal("fetch", fetchMock);
    const { callModel } = await import("../../lib/ai-providers");
    for (const role of ["fast", "reasoning", "fallback"] as const) {
      fetchMock.mockClear();
      expect(await callModel([{ role: "user", content: "hi" }], { role })).toBe("hello");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.openai.com/v1/chat/completions");
    }
  });

  it("falls back to Groq when OpenAI fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test"; delete process.env.OPENAI_FIRST; process.env.GROQ_API_KEY = "gsk-test";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return u.includes("openai.com/v1") ? { ok: false, status: 429, text: async () => "quota" } : reply("from groq"); }));
    const { callModel } = await import("../../lib/ai-providers");
    expect(await callModel([{ role: "user", content: "hi" }], { role: "fast" })).toBe("from groq");
    expect(urls[0]).toContain("api.openai.com");
    expect(urls.some((u) => u.includes("groq.com"))).toBe(true);
  });

  it("OPENAI_FIRST=off keeps the key but skips OpenAI; no key means no OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test"; process.env.OPENAI_FIRST = "off"; process.env.GROQ_API_KEY = "gsk-test";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return reply("x"); }));
    const { callModel } = await import("../../lib/ai-providers");
    await callModel([{ role: "user", content: "hi" }], { role: "fast" });
    expect(urls.every((u) => !u.includes("openai.com/v1"))).toBe(true);
  });
});

describe("live ping includes OpenAI", () => {
  it("reports each OpenAI model and the error text when the call fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test"; delete process.env.OPENAI_FIRST; process.env.OPENAI_MODEL = "gpt-6.2-sol";
    for (const k of ["GROQ_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY"]) delete process.env[k];
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return { ok: false, status: 404, text: async () => "model not found" }; }));
    const { checkAllProviders } = await import("../../lib/ai-providers");
    const res = await checkAllProviders();
    const o = res.find((r) => r.provider === "openai")!;
    expect(o.model).toBe("gpt-6.2-sol");
    expect(o.ok).toBe(false);
    expect(o.error).toContain("OPENAI_404");
    expect(body.temperature).toBeUndefined();
  });
});

describe("a slow OpenAI call leaves time for the fallback", () => {
  it("with no deadline: OpenAI hangs past the default 9s budget, Groq still gets its turn", async () => {
    vi.useFakeTimers();
    try {
      process.env.OPENAI_API_KEY = "sk-test"; delete process.env.OPENAI_FIRST; process.env.GROQ_API_KEY = "gsk-test";
      const urls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (u: string) => {
        urls.push(u);
        // stands in for OpenAI's own 12s timeout (AbortSignal.timeout is not driven by fake timers)
        if (u.includes("openai.com/v1")) await new Promise((_, rej) => setTimeout(() => rej(new Error("OPENAI_timeout")), 12_000));
        return reply("from groq");
      }));
      const { callModel } = await import("../../lib/ai-providers");
      const p = callModel([{ role: "user", content: "hi" }], { role: "fast" });
      await vi.advanceTimersByTimeAsync(13_000);
      expect(await p).toBe("from groq");
      expect(urls.some((u) => u.includes("groq.com"))).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("with a shared deadline: OpenAI is cut off at 60% of what is left", async () => {
    vi.useFakeTimers();
    try {
      process.env.OPENAI_API_KEY = "sk-test"; delete process.env.OPENAI_FIRST; process.env.GROQ_API_KEY = "gsk-test";
      const urls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); if (u.includes("openai.com/v1")) await new Promise(() => {}); return reply("from groq"); }));
      const { callModel } = await import("../../lib/ai-providers");
      const p = callModel([{ role: "user", content: "hi" }], { role: "reasoning", deadlineMs: Date.now() + 10_000 });
      await vi.advanceTimersByTimeAsync(6_500);
      expect(await p).toBe("from groq");
      expect(urls.some((u) => u.includes("groq.com"))).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

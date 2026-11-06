import { describe, it, expect, vi, afterEach } from "vitest";

const img = [{ mimeType: "image/png", data: "AAAA" }];

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("@/lib/ai-providers")).geminiVisionJSON;
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("geminiVisionJSON fallback", () => {
  it("uses Groq when Gemini returns 503", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("groq.com")) return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
      return new Response("busy", { status: 503 });
    }));
    const run = await load({ GEMINI_API_KEY: "g", GROQ_API_KEY: "k" });
    expect(await run<{ ok: boolean }>("Reply in JSON", img)).toEqual({ ok: true });
    expect(urls.some((u) => u.includes("groq.com"))).toBe(true);
  });

  it("falls through to OpenRouter when Groq also fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("openrouter.ai")) return new Response(JSON.stringify({ choices: [{ message: { content: 'Here: {"ok":2}' } }] }), { status: 200 });
      return new Response("busy", { status: 503 });
    }));
    const run = await load({ GEMINI_API_KEY: "g", GROQ_API_KEY: "k", OPENROUTER_API_KEY: "o" });
    expect(await run<{ ok: number }>("Reply in JSON", img)).toEqual({ ok: 2 });
  });

  it("throws when every reader fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    const run = await load({ GEMINI_API_KEY: "g", GROQ_API_KEY: "k" });
    await expect(run("Reply in JSON", img)).rejects.toThrow(/every image reader failed/);
  });
});

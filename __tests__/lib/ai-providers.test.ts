import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["GROQ_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_MODEL"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("ai-providers env/diagnostics", () => {
  it("defaults OPENROUTER_MODEL to the free-router alias, not a pinned dead slug", async () => {
    // Regression guard: this used to default to deepseek/deepseek-r1:free,
    // which went paid-only and 404s on every call. openrouter/free
    // auto-selects whatever's currently free instead of rotting again the
    // next time a provider retires its free lineup.
    delete process.env.OPENROUTER_MODEL;
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.GROQ_API_KEY = "";
    process.env.CEREBRAS_API_KEY = "";
    process.env.GEMINI_API_KEY = "";

    const mod = await import("../../lib/ai-providers");
    const status = mod.getAIProviderStatus();
    const openrouterEntry = status.fast.find((p) => p?.provider === "openrouter");
    expect(openrouterEntry?.model).toBe("openrouter/free");
  });

  it("places Cerebras last in every chain when all providers are configured", async () => {
    // Regression guard: Cerebras's no-card free tier ended Aug 2026 and now
    // 402s without a payment method — it should be a best-effort last
    // resort, not tried ahead of providers that are actually reachable.
    process.env.GROQ_API_KEY = "test-key";
    process.env.CEREBRAS_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.OPENROUTER_API_KEY = "test-key";

    const mod = await import("../../lib/ai-providers");
    const status = mod.getAIProviderStatus();

    for (const chain of [status.fast, status.reasoning, status.fallback]) {
      const cerebrasIndex = chain.findIndex((p) => p?.provider === "cerebras");
      expect(cerebrasIndex).toBe(chain.length - 1);
    }
  });

  it("hasAIProvider is false when no provider env vars are set", async () => {
    for (const key of ["GROQ_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]) {
      process.env[key] = "";
    }
    const mod = await import("../../lib/ai-providers");
    expect(mod.hasAIProvider()).toBe(false);
  });

  it("sanitizeModelOutput strips think blocks and normalizes smart punctuation", async () => {
    const mod = await import("../../lib/ai-providers");
    const result = mod.sanitizeModelOutput('<think>internal reasoning</think>Here\u2019s the answer \u2014 done\u2026');
    expect(result).not.toContain("internal reasoning");
    expect(result).toBe("Here's the answer - done...");
  });
});

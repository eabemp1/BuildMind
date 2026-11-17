import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sitemap from "../../app/sitemap";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  // Node's native timeout signal uses internal timers, not Vitest's clock.
  // Keep the abort contract while making the 5-second deadline deterministic.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return controller.signal;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

it("keeps static and successful dynamic entries with the existing limits/public filter", async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("project_summaries")) {
      expect(url).toContain("is_public=eq.true");
      expect(url).toContain("limit=50");
      return json([{ username: "founder", updated_at: "2026-11-01T00:00:00Z" }]);
    }
    expect(url).toContain("limit=100");
    return json([{ share_token: "shared-report", created_at: "2026-11-02T00:00:00Z" }]);
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await sitemap();
  expect(result).toHaveLength(15);
  expect(result.map((entry) => entry.url)).toContain("https://buildmind.live/founder/founder");
  expect(result.map((entry) => entry.url)).toContain("https://buildmind.live/reports/share/shared-report");
});

it("returns static entries within ten seconds when both optional queries hang", async () => {
  const aborted = new Set<AbortSignal>();
  vi.stubGlobal("fetch", vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => { if (signal) aborted.add(signal); reject(signal?.reason); };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  })));
  let result: Awaited<ReturnType<typeof sitemap>> | undefined;
  const pending = sitemap().then((value) => { result = value; });
  await vi.advanceTimersByTimeAsync(10_001);
  expect(result, "the optional database requests must not stall sitemap generation").toBeDefined();
  expect(result).toHaveLength(13);
  expect(aborted.size).toBe(2);
  await pending;
});

it("keeps successful report entries if the founder query fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    if (String(input).includes("project_summaries")) return new Response('permission denied', { status: 403 });
    return json([{ share_token: "report", created_at: "2026-11-02T00:00:00Z" }]);
  }));
  const result = await sitemap();
  expect(result).toHaveLength(14);
  expect(result.map((entry) => entry.url)).toContain("https://buildmind.live/reports/share/report");
});

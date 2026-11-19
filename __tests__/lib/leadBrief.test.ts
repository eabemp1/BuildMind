import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ system: string; user: string }> = [];
let extractMode: "ok" | "429" = "ok";

vi.mock("@/lib/ai-providers", () => ({
  callModelJSON: vi.fn(async (msgs: Array<{ role: string; content: string }>) => {
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    const user = msgs.find((m) => m.role === "user")?.content ?? "";
    calls.push({ system, user });
    if (system.includes("plan web searches")) return { queries: ["game studios Bengaluru directory", "indie game developers Bengaluru community", "Bengaluru game jam events page"], osm: [] };
    if (system.includes("decide which links")) return { open: [] };
    if (extractMode === "429") throw new Error("GROQ_429 rate limit reached");
    return { leads: [{ name: "Bengaluru Game Devs", kind: "association", where: "Bengaluru", url: "https://games.example.in/bengaluru", why_fit: "A local group of game studios.", evidence: "Directory of 40 game studios in Bengaluru.", fit_proof: "Directory of 40 game studios in Bengaluru.", contact: { kind: "email", value: "hello@games.example.in" }, how_to_reach: "Message the page", first_message: "Hello, I am building PLAYFORGE for game studios. Could I ask two questions?" }] };
  }),
}));
vi.mock("@/lib/search", () => ({
  webSearch: vi.fn(async () => ({ provider: "serper", results: [{ title: "Game studios Bengaluru", url: "https://games.example.in/bengaluru", snippet: "Studios in Bengaluru", source_type: "web" }] })),
  discussionSearch: vi.fn(async () => ({ provider: "serper", results: [] })),
}));
vi.mock("@/lib/leads/pageReader", async (orig) => ({
  ...(await orig<typeof import("@/lib/leads/pageReader")>()),
  readPage: vi.fn(async () => "x".repeat(200)),
  readPageWithLinks: vi.fn(async () => ({ text: "Directory of 40 game studios in Bengaluru. Write to hello@games.example.in. Studio group 1 Studio group 2 Studio group 3 Studio group 4 Studio group 5 Studio group 6 Studio group 7 Studio group 8 Studio group 9 Bengaluru Game Devs. ".repeat(4), links: [] })),
}));
vi.mock("@/lib/leads/osm", () => ({ findPlaces: vi.fn(async () => []), overpassQuery: vi.fn(), parsePlaces: vi.fn() }));

import { findLeads, extractLeads, fromSaved, toSaved, type LeadSink } from "@/lib/leads/engine";
import { cleanBrief, cleanInput, productLine } from "@/lib/leads/plan";
import { generationFailure, hasMaterial, sameProduct } from "@/lib/leads/save";

beforeEach(() => { calls.length = 0; extractMode = "ok"; });

const base = { country: "India", city: "Bengaluru", customer: "indie game studios", problem: "Hard to find playtesters" };

describe("the product behind the search", () => {
  it("cleans a brief and writes it as one line", () => {
    expect(cleanBrief({ name: '  PLAY"FORGE ', what: "Playtest\nmarketplace" })).toEqual({ name: "PLAY FORGE", what: "Playtest marketplace" });
    expect(cleanBrief({ name: "  ", what: "x" })).toBeUndefined();
    expect(productLine({ name: "PLAYFORGE", what: "Playtests" })).toBe("Product: PLAYFORGE. What it does: Playtests");
    expect(productLine(undefined)).toBe("");
    expect(cleanInput({ ...base, product: { name: "PLAYFORGE", what: "Playtests" } }).product?.name).toBe("PLAYFORGE");
  });

  it("searches, explains fit and drafts messages for the brief product only", async () => {
    const run = await findLeads({ ...base, product: { name: "PLAYFORGE", what: "A marketplace that connects game studios with playtesters" } }, Date.now() + 240_000, true);
    expect(run.leads).toHaveLength(1);
    expect(calls.length).toBeGreaterThan(1);
    // Every model call that sees the product sees PLAYFORGE and never the active project's name.
    for (const c of calls.filter((x) => !x.system.includes("decide which links"))) {
      expect(c.user).toContain("PLAYFORGE");
      expect(c.user + c.system).not.toContain("BuildMind");
    }
    const writing = calls.find((c) => c.system.includes("first_message"))!;
    expect(writing.system).toContain("THE PRODUCT BELOW");
    expect(run.leads[0].first_message).toContain("PLAYFORGE");
  });

  it("matches a product name ignoring case and spacing", () => {
    expect(sameProduct(" PlayForge ", "playforge")).toBe(true);
    expect(sameProduct("PlayForge", "BuildMind")).toBe(false);
    expect(sameProduct("", "")).toBe(false);
  });
});

describe("when the AI step fails", () => {
  it("is a failure with the reading kept, not 'no leads found'", async () => {
    extractMode = "429";
    const sink: LeadSink = { leads: [], stats: null, queries: [] };
    const run = await findLeads({ ...base, product: { name: "PLAYFORGE", what: "x" } }, Date.now() + 240_000, true, sink);
    expect(run.leads).toHaveLength(0);
    expect(run.stats.modelFailed).toBeGreaterThan(0);
    expect(run.stats.modelError).toMatch(/429/);
    expect(hasMaterial(sink)).toBe(true);
    expect(sink.material!.pages[0].url).toBe("https://games.example.in/bengaluru");
    const msg = generationFailure(run.stats.modelError);
    expect(msg).toMatch(/rate limit/);
    expect(msg).toMatch(/without searching again/);
    expect(generationFailure(undefined, true)).toMatch(/took too long/);
  });

  it("retries writing from the saved pages with no new search", async () => {
    extractMode = "429";
    const sink: LeadSink = { leads: [], stats: null, queries: [] };
    await findLeads({ ...base, product: { name: "PLAYFORGE", what: "x" } }, Date.now() + 240_000, true, sink);
    const searches = (await import("@/lib/search")).webSearch as unknown as { mock: { calls: unknown[] } };
    const searchesBefore = searches.mock.calls.length;
    extractMode = "ok";
    const saved = JSON.parse(JSON.stringify(sink.material)); // what the database round trip keeps
    const m = fromSaved(saved);
    const out = await extractLeads(cleanInput({ ...base, product: { name: "PLAYFORGE", what: "x" } }), m.pages, m.places, m.snippets);
    expect(out.failed).toBe(false);
    expect(out.leads).toHaveLength(1);
    expect(searches.mock.calls.length).toBe(searchesBefore);
  });

  it("keeps saved material small", () => {
    const big = Array.from({ length: 30 }, (_, n) => ({ title: `t${n}`, url: `https://a${n}.com/x`, snippet: "", source_type: "web" as const, text: "y".repeat(9000), links: [] }));
    const saved = toSaved(big as never, [], []);
    expect(saved.pages.length).toBeLessThanOrEqual(12);
    expect(saved.pages[0].text.length).toBeLessThanOrEqual(2000);
  });
});

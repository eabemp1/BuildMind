import { describe, it, expect, vi, beforeEach } from "vitest";

let searchMode: "ok" | "fail" = "ok";
const searched: string[] = [];
const read: string[] = [];

vi.mock("@/lib/ai-providers", () => ({
  callModelJSON: vi.fn(async (msgs: Array<{ role: string; content: string }>) => {
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    if (system.includes("plan web searches")) return { queries: ["q one Bengaluru", "q two Bengaluru", "q three Bengaluru", "q four Bengaluru", "q five Bengaluru", "q six Bengaluru"], osm: [] };
    if (system.includes("decide which links")) return { open: [] };
    return { leads: [] };
  }),
}));
vi.mock("@/lib/search", () => ({
  webSearch: vi.fn(async (q: string) => {
    searched.push(q);
    if (searchMode === "fail") throw new Error("provider down");
    return { provider: "serper", results: Array.from({ length: 6 }, (_, n) => ({ title: `T${n}`, url: `https://site${n}-${searched.length}.example.in/p`, snippet: "s", source_type: "web" })) };
  }),
  discussionSearch: vi.fn(async (q: string) => { searched.push(`discussion:${q}`); return { provider: "serper", results: [] }; }),
}));
vi.mock("@/lib/leads/pageReader", async (orig) => ({
  ...(await orig<typeof import("@/lib/leads/pageReader")>()),
  readPageWithLinks: vi.fn(async (u: string) => { read.push(u); return { text: "A directory of game studios in Bengaluru with a long enough text to count as a page. ".repeat(3), links: [] }; }),
}));
vi.mock("@/lib/leads/osm", () => ({ findPlaces: vi.fn(async () => []), overpassQuery: vi.fn(), parsePlaces: vi.fn() }));

import { findLeads, thinReason } from "@/lib/leads/engine";
import { leadBudget } from "@/lib/leads/budget";

beforeEach(() => { searched.length = 0; read.length = 0; searchMode = "ok"; delete process.env.LEADS_BUDGET; });
const base = { country: "India", city: "Bengaluru", customer: "indie game studios", problem: "Hard to find playtesters" };

describe("budget values", () => {
  it("starts at 3 queries, 5 pages and 35 seconds", () => {
    expect(leadBudget(false, {})).toMatchObject({ queries: 3, pages: 5, workMs: 35_000, discussion: 0 });
  });
  it("is tunable from the environment, with limits on the values", () => {
    expect(leadBudget(false, { LEADS_QUERIES: "2", LEADS_PAGES: "4", LEADS_WORK_MS: "20000" })).toMatchObject({ queries: 2, pages: 4, workMs: 20_000 });
    expect(leadBudget(false, { LEADS_QUERIES: "99" }).queries).toBe(7);
    expect(leadBudget(false, { LEADS_QUERIES: "abc" }).queries).toBe(3);
  });
  it("busy mode searches less and skips the second hop; legacy restores the wide search", () => {
    expect(leadBudget(true, {})).toMatchObject({ queries: 2, pages: 3, follow: false });
    expect(leadBudget(false, { LEADS_BUDGET: "legacy" })).toMatchObject({ queries: 7, pages: 10 });
  });
});

describe("a run stays inside its budget", () => {
  it("runs 3 searches and opens at most 5 pages, however many the planner proposes", async () => {
    await findLeads(base, Date.now() + 240_000, false);
    expect(searched.filter((q) => !q.startsWith("discussion:"))).toHaveLength(3);
    expect(searched.some((q) => q.startsWith("discussion:"))).toBe(false);
    expect(read.length).toBeLessThanOrEqual(5);
  });
  it("Find More does not repeat queries it was told were already tried", async () => {
    await findLeads(base, Date.now() + 240_000, false, undefined, [], ["q one Bengaluru", "q two Bengaluru"]);
    expect(searched).not.toContain("q one Bengaluru");
    expect(searched).not.toContain("q two Bengaluru");
  });
  it("never runs longer than the caller's deadline", async () => {
    const run = await findLeads(base, Date.now() - 1, false);
    expect(run.stats.rounds).toBeLessThanOrEqual(1);
  });
});

describe("a failed provider is not 'no customers'", () => {
  it("says the searches failed, not that nobody exists", async () => {
    searchMode = "fail";
    const run = await findLeads(base, Date.now() + 240_000, false);
    expect(run.thin).toBe(true);
    expect(run.stats.searchFailed).toBeGreaterThan(0);
    expect(run.reason).toMatch(/did not answer/i);
    expect(run.reason).toMatch(/says nothing about whether customers exist/i);
  });
  it("thinReason keeps its old wording when searches ran but returned nothing", () => {
    expect(thinReason(0, { resultsFound: 0, pagesRead: 0, places: 0, searches: 3, searchFailed: 0 })).toMatch(/returned nothing/i);
  });
});

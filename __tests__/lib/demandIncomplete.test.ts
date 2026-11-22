import { describe, it, expect, vi, beforeEach } from "vitest";

let searchMode: "ok" | "fail" = "ok";
let modelMode: "ok" | "fail" = "ok";
const searches: string[] = [];
let modelCalls = 0;

vi.mock("@/lib/ai-providers", () => ({
  callModelJSON: vi.fn(async () => { modelCalls++; if (modelMode === "fail") throw new Error("429 rate limit"); return { signals: [] }; }),
}));
vi.mock("@/lib/search", () => {
  const run = async (q: string) => {
    searches.push(q);
    if (searchMode === "fail") throw new Error("down");
    return { provider: "serper", results: [{ title: "Thread", url: `https://forum.example/t/${searches.length}`, snippet: "I wish there was a way to track my walk-in queue without a notebook, it is a mess every day.", source_type: "discussion" }] };
  };
  return { webSearch: vi.fn(run), discussionSearch: vi.fn(run) };
});
vi.mock("@/lib/leads/pageReader", async (orig) => ({ ...(await orig<typeof import("@/lib/leads/pageReader")>()), readPage: vi.fn(async () => "") }));

import { checkDemand } from "@/lib/demand/engine";

beforeEach(() => { searchMode = "ok"; modelMode = "ok"; searches.length = 0; modelCalls = 0; });
const input = { country: "Ghana", city: "Accra", customer: "clinic managers", problem: "Waiting rooms are crowded" };

describe("a check that could not finish is not 'no demand'", () => {
  it("all searches failing is incomplete", async () => {
    searchMode = "fail";
    const r = await checkDemand(input);
    expect(r.incomplete).toBeTruthy();
    expect(r.headline).toMatch(/says nothing about demand/i);
  });
  it("the AI step failing is incomplete", async () => {
    modelMode = "fail";
    const r = await checkDemand(input);
    expect(r.incomplete).toBeTruthy();
    expect(r.stats.modelFailed).toBe(true);
  });
  it("a finished check that found nothing is complete", async () => {
    const r = await checkDemand(input);
    expect(r.incomplete).toBeUndefined();
  });
});

describe("busy mode is lighter", () => {
  it("runs at most 3 searches and one model attempt", async () => {
    modelMode = "fail";
    await checkDemand(input, true);
    expect(searches.length).toBeLessThanOrEqual(3);
    expect(modelCalls).toBe(1);
  });
  it("normal mode retries the model once", async () => {
    modelMode = "fail";
    await checkDemand(input, false);
    expect(modelCalls).toBe(2);
  });
});

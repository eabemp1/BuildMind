import { describe, it, expect } from "vitest";
import { estimateUsd, priceFor } from "@/lib/modelPrices";
import { emptyTally, tallyRowWithUsd, currentTally } from "@/lib/jobCost";

describe("modelPrices", () => {
  const nov = new Date("2026-11-16T00:00:00Z");
  it("prices a million tokens at the published rate", () => {
    expect(estimateUsd("groq:openai/gpt-oss-120b", 1_000_000, 1_000_000, nov)).toBeCloseTo(0.75, 6);
    expect(estimateUsd("gemini:gemini-3.8-flash", 1_000_000, 1_000_000, nov)).toBeCloseTo(4.5, 6);
  });
  it("Gemini 3.8 Flash doubles on 2027-01-01", () => {
    expect(priceFor("gemini:gemini-3.8-flash", new Date("2026-12-31T23:00:00Z"))?.inPerM).toBe(0.75);
    expect(priceFor("gemini:gemini-3.8-flash", new Date("2027-01-01T00:00:00Z"))?.inPerM).toBe(1.5);
  });
  it("the free router costs nothing", () => expect(estimateUsd("openrouter:openrouter/free", 5000, 5000, nov)).toBe(0));
  it("an unverified model is unpriced, never guessed", () => {
    expect(estimateUsd("cerebras:gpt-oss-120b", 1000, 1000, nov)).toBeNull();
    expect(estimateUsd("mistral:mistral-small-latest", 1000, 1000, nov)).toBeNull();
    expect(estimateUsd("groq:something-new", 1000, 1000, nov)).toBeNull();
  });
});
describe("job tally cost", () => {
  it("adds priced calls and counts unpriced ones separately", () => {
    const t = emptyTally();
    t.usd = 0.001; t.unpriced = 2; t.calls = 3;
    const row = tallyRowWithUsd("u", "demand_check", null, t);
    expect(row.approx_usd).toBe(0.001);
    expect(row.unpriced_calls).toBe(2);
    expect(currentTally()).toBeUndefined();
  });
});

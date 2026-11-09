import { describe, it, expect } from "vitest";
import { demandQueries, quoteInMaterial, validateSignals, groupThemes, demandHeadline } from "@/lib/demand/signals";

const page = "Posted in Accra Moms group: Does anyone know where I can find cheap rice that is not 20 cedis more at the mall? I am tired of driving to three shops.";
const texts = new Map([["https://www.example.com/post/1", page]]);
const sig = { quote: "Does anyone know where I can find cheap rice that is not 20 cedis more at the mall?", url: "https://example.com/post/1", kind: "ask", theme: "cheap rice", place: "Accra" };

describe("demand signals", () => {
  it("builds queries in the way people ask, tied to the place", () => {
    const q = demandQueries({ country: "Ghana", city: "Accra", customer: "shoppers", problem: "cheap groceries" });
    expect(q.length).toBeGreaterThanOrEqual(5);
    expect(q.some((x) => /where can I find/i.test(x))).toBe(true);
    expect(q.every((x) => /accra/i.test(x))).toBe(true);
  });
  it("accepts a quote only if it is on the page, ignoring case and punctuation", () => {
    expect(quoteInMaterial("does anyone know where i can find cheap rice that is not 20 cedis more at the mall", [page])).toBe(true);
    expect(quoteInMaterial("People in Accra badly need cheap rice everywhere", [page])).toBe(false);
    expect(quoteInMaterial("too short", ["too short"])).toBe(false);
  });
  it("keeps a real signal and drops invented quotes, unread URLs and repeats", () => {
    expect(validateSignals([sig], texts)).toHaveLength(1);
    expect(validateSignals([{ ...sig, quote: "Everyone in Accra wants cheaper rice right now, please help" }], texts)).toHaveLength(0);
    expect(validateSignals([{ ...sig, url: "https://other.com/x" }], texts)).toHaveLength(0);
    expect(validateSignals([sig, sig], texts)).toHaveLength(1);
    expect(validateSignals("nope", texts)).toEqual([]);
  });
  it("lets one page count at most three times", () => {
    const long = `${page} Second: I am tired of driving to three shops every weekend for rice. Third: I wish there was one place showing every price for rice. Fourth: nobody tells me which market is cheapest this week at all.`;
    const m = new Map([["https://a.com/p", long]]);
    const mk = (q: string) => ({ quote: q, url: "https://a.com/p", kind: "wish", theme: "t", place: "" });
    const got = validateSignals([mk("I am tired of driving to three shops every weekend for rice"), mk("I wish there was one place showing every price for rice"), mk("nobody tells me which market is cheapest this week at all"), mk("Does anyone know where I can find cheap rice that is not 20 cedis more")], m);
    expect(got).toHaveLength(3);
  });
  it("groups themes and writes an honest headline", () => {
    const s = [{ ...sig, theme: "cheap rice" }, { ...sig, quote: "b".repeat(30), theme: "cheap rice" }, { ...sig, quote: "c".repeat(30), theme: "price gaps" }] as never[];
    expect(groupThemes(s)).toEqual([{ name: "cheap rice", count: 2 }, { name: "price gaps", count: 1 }]);
    expect(demandHeadline(0, "Accra")).toMatch(/private groups/);
    expect(demandHeadline(3, "Accra")).toMatch(/lower bound/);
    expect(demandHeadline(12, "Accra")).toMatch(/12 public posts/);
  });
});

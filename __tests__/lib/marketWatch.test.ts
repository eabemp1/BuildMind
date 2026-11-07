import { describe, it, expect } from "vitest";
import { diffSnapshots, weekStartOf, sortChanges, type MarketSnapshot } from "@/lib/marketWatch/diff";
import { competitorsFromRun } from "@/lib/server/marketWatch";
import { buildMarketVisual } from "@/lib/marketWatch/visual";

const snap = (over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({ weekStart: "2026-11-02", competitors: [{ name: "Acme", url: "https://acme.com", ok: true, title: "Acme", price: "$19/mo" }], threads: [], ...over });

describe("market watch diff", () => {
  it("first scan is a baseline with no changes", () => {
    expect(diffSnapshots(null, snap())).toEqual({ baseline: true, changes: [] });
  });
  it("detects a price change from the page", () => {
    const cur = snap({ competitors: [{ name: "Acme", url: "https://acme.com", ok: true, title: "Acme", price: "$29/mo" }] });
    const { changes } = diffSnapshots(snap(), cur);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("price");
    expect(changes[0].text).toContain("$29/mo");
  });
  it("does not report a price when one side has none", () => {
    const cur = snap({ competitors: [{ name: "Acme", url: "https://acme.com", ok: true, title: "Acme", price: null }] });
    expect(diffSnapshots(snap(), cur).changes).toHaveLength(0);
  });
  it("flags pages that stop loading and new competitors and new threads", () => {
    const cur = snap({
      competitors: [{ name: "Acme", url: "https://acme.com", ok: false, title: "", price: null }, { name: "Newco", url: "https://new.co", ok: true, title: "Newco", price: null }],
      threads: [{ url: "https://reddit.com/x", title: "Acme vs others", about: "Acme" }],
    });
    const kinds = diffSnapshots(snap(), cur).changes.map((c) => c.kind).sort();
    expect(kinds).toEqual(["new_competitor", "new_thread", "page_down"]);
  });
  it("ignores threads already seen", () => {
    const t = { url: "https://reddit.com/x", title: "t", about: "Acme" };
    expect(diffSnapshots(snap({ threads: [t] }), snap({ threads: [t] })).changes).toHaveLength(0);
  });
  it("sorts money first", () => {
    const s = sortChanges([{ kind: "page_down", text: "a" }, { kind: "price", text: "b" }]);
    expect(s[0].kind).toBe("price");
  });
  it("week starts on Monday", () => {
    expect(weekStartOf(new Date("2026-11-05T10:00:00Z"))).toBe("2026-11-02");
    expect(weekStartOf(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11-02");
    expect(weekStartOf(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09");
  });
});

describe("competitorsFromRun", () => {
  it("keeps named competitors with a safe public site, one per website, at most five", () => {
    const brief = [{ name: "A", url: "https://a.com/pricing" }, { name: "A again", url: "https://www.a.com" }, { name: "Local", url: "http://localhost:3000" }, { name: "NoUrl" }, ...Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, url: `https://c${i}.com` }))];
    const out = competitorsFromRun({ agent_outputs: { competitor: { brief } } });
    expect(out[0]).toEqual({ name: "A", url: "https://a.com/" });
    expect(out.find((c) => c.name === "Local")).toBeUndefined();
    expect(out.filter((c) => c.url === "https://a.com/")).toHaveLength(1);
    expect(out).toHaveLength(5);
  });
  it("never falls back to search-result pages, which include articles", () => {
    const out = competitorsFromRun({ agent_outputs: { competitor: { brief: [] } }, competitors: [{ title: "Acme review", url: "https://acme.com/blog/review" }] });
    expect(out).toEqual([]);
  });
  it("refuses news, social and review sites even when the stress test named them", () => {
    const out = competitorsFromRun({ agent_outputs: { competitor: { brief: [{ name: "Story", url: "https://techcrunch.com/2026/acme" }, { name: "Post", url: "https://medium.com/@x/acme" }, { name: "Real", url: "https://real.io" }] } } });
    expect(out.map((c) => c.name)).toEqual(["Real"]);
  });
  it("returns nothing for an empty payload", () => expect(competitorsFromRun(null)).toEqual([]));
});

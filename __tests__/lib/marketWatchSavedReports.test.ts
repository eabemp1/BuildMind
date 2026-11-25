import { describe, it, expect } from "vitest";
import { watchFromRows } from "@/lib/server/marketWatch";
import type { MarketSnapshot } from "@/lib/marketWatch/diff";

const comp = (price: string) => ({ name: "Acme", url: "https://acme.com", ok: true, title: "Acme", price });
const old: MarketSnapshot = { weekStart: "2026-11-16", competitors: [comp("£35/mo")], threads: [] };

describe("old saved reports are re-judged by today's rules", () => {
  it("£35/mo to £35/month is not a price change, even if the saved report said so", () => {
    const cur = { ...old, weekStart: "2026-11-23", competitors: [comp("£35/month")], changes: [{ kind: "price", text: "stale" }] } as unknown as MarketSnapshot;
    const w = watchFromRows([{ payload: cur, week_start: "2026-11-23" }, { payload: old, week_start: "2026-11-16" }]);
    expect(w?.changes).toEqual([]);
  });
  it("a real price change still shows", () => {
    const cur: MarketSnapshot = { ...old, weekStart: "2026-11-23", competitors: [comp("£49/month")] };
    expect(watchFromRows([{ payload: cur, week_start: "2026-11-23" }, { payload: old, week_start: "2026-11-16" }])?.changes.map((c) => c.kind)).toEqual(["price"]);
  });
  it("a thread saved without a verified date is not a new competitor discussion", () => {
    const cur: MarketSnapshot = { ...old, weekStart: "2026-11-23", competitors: [comp("£35/mo")], threads: [{ url: "https://reddit.com/r/x/1", title: "Acme alternatives", about: "Acme" }] };
    expect(watchFromRows([{ payload: cur, week_start: "2026-11-23" }, { payload: old, week_start: "2026-11-16" }])?.changes).toEqual([]);
  });
  it("a verified thread carries its source and dates, and every change says when it was checked", () => {
    const cur: MarketSnapshot = { ...old, weekStart: "2026-11-23", scannedAt: "2026-11-25", competitors: [comp("£35/mo")], threads: [{ url: "https://acme.com/blog/x", title: "Acme launches X", about: "Acme", status: "this_week", publisher: "acme.com", publishedAt: "2026-11-24", checkedAt: "2026-11-25" }] };
    const c = watchFromRows([{ payload: cur, week_start: "2026-11-23" }, { payload: old, week_start: "2026-11-16" }])!.changes[0];
    expect(c).toMatchObject({ kind: "new_thread", url: "https://acme.com/blog/x", publishedAt: "2026-11-24", checkedAt: "2026-11-25" });
    expect(c.text).toContain("published 2026-11-24");
  });
  it("a first scan is a baseline", () => {
    expect(watchFromRows([{ payload: old, week_start: "2026-11-16" }])?.baseline).toBe(true);
  });
});

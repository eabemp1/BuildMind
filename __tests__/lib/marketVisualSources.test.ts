import { describe, it, expect } from "vitest";
import { buildMarketVisual } from "@/lib/marketWatch/visual";

describe("Market Watch shows where each line came from", () => {
  const watch = {
    weekStart: "2026-11-23", baseline: false,
    changes: [{ kind: "price" as const, text: "Acme now shows $20/mo.", url: "https://acme.com/pricing" }],
    competitors: [{ name: "Acme", url: "https://acme.com", ok: true, title: "Acme", price: "$20/mo" }],
    threads: [{ url: "https://reddit.com/r/x/1", title: "Acme alternatives?", about: "Acme", status: "this_week" as const, publisher: "reddit.com", publishedAt: "2026-11-24", checkedAt: "2026-11-25" }],
  };
  it("gives every change, competitor and thread a source url", () => {
    const { visual } = buildMarketVisual(watch);
    const trees = visual.panels.filter((p) => p.type === "tree") as Array<{ title: string; branches: Array<{ url?: string }> }>;
    expect(trees.map((t) => t.title)).toEqual(["What changed", "Prices printed on their pages", "Published this week"]);
    for (const t of trees) expect(t.branches.every((b) => !!b.url)).toBe(true);
    const week = trees.find((t) => t.title === "Published this week") as unknown as { branches: Array<{ note?: string }> };
    expect(week.branches[0].note).toContain("reddit.com");
    expect(week.branches[0].note).toContain("published 2026-11-24");
    expect(week.branches[0].note).toContain("checked 2026-11-25");
  });
  it("lists no threads panel when none were found", () => {
    const { visual } = buildMarketVisual({ ...watch, threads: [] });
    expect(visual.panels.some((p) => p.type === "tree" && p.title === "Published this week")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { buildMarketVisual } from "@/lib/marketWatch/visual";

describe("Market Watch shows where each line came from", () => {
  const watch = {
    weekStart: "2026-11-23", baseline: false,
    changes: [{ kind: "price" as const, text: "Acme now shows $20/mo.", url: "https://acme.com/pricing" }],
    competitors: [{ name: "Acme", url: "https://acme.com", ok: true, title: "Acme", price: "$20/mo" }],
    threads: [{ url: "https://reddit.com/r/x/1", title: "Acme alternatives?", about: "Acme" }],
  };
  it("gives every change, competitor and thread a source url", () => {
    const { visual } = buildMarketVisual(watch);
    const trees = visual.panels.filter((p) => p.type === "tree") as Array<{ title: string; branches: Array<{ url?: string }> }>;
    expect(trees.map((t) => t.title)).toEqual(["What changed", "Prices printed on their pages", "Community threads read"]);
    for (const t of trees) expect(t.branches.every((b) => !!b.url)).toBe(true);
  });
  it("lists no threads panel when none were found", () => {
    const { visual } = buildMarketVisual({ ...watch, threads: [] });
    expect(visual.panels.some((p) => p.type === "tree" && p.title === "Community threads read")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { buildAchievementsVisual } from "@/lib/visuals/achievementsVisual";
import { buildPortfolioVisual } from "@/lib/visuals/portfolioVisual";
import { buildMirrorVisual } from "@/lib/visuals/mirrorVisual";

describe("achievements visual", () => {
  const ach = [
    { id: "a", label: "A", category: "streak", rarity: "common", xp: 50 }, { id: "b", label: "B", category: "tasks", rarity: "rare", xp: 250 },
    { id: "c", label: "C", category: "ai", rarity: "epic", xp: 1000 }, { id: "d", label: "D", category: "ai", rarity: "common", xp: 50 },
  ];
  it("counts only real unlocks and uses timestamps for the timeline", () => {
    const v = buildAchievementsVisual({ achievements: ach, unlocked: new Set(["a", "c"]), timestamps: { a: "2026-08-02T00:00:00Z", c: "2026-09-05T00:00:00Z" }, xp: 1050, level: { level: 4, title: "Builder", nextXp: 2000, progress: 0.05 } });
    const stats = v.panels.find((p) => p.type === "stats") as any;
    expect(stats.items[0].value).toBe("2/4");
    const line = v.panels.find((p) => p.type === "line") as any;
    expect(line.points.map((p: any) => p.value)).toEqual([1, 2]);
    const radar = v.panels.find((p) => p.type === "radar") as any;
    expect(radar.axes.find((a: any) => a.label === "Ai").value).toBe(50);
    expect(JSON.stringify(v)).not.toContain('"B"');
  });
  it("omits the timeline with fewer than two months of data", () => {
    const v = buildAchievementsVisual({ achievements: ach, unlocked: new Set(["a"]), timestamps: { a: "2026-08-02T00:00:00Z" }, xp: 50, level: { level: 1, title: "x", nextXp: 200, progress: 0.2 } });
    expect(v.panels.some((p) => p.type === "line")).toBe(false);
  });
});

describe("portfolio visual", () => {
  it("rolls up tasks and flags stalled projects", () => {
    const v = buildPortfolioVisual([
      { name: "A", stage: "MVP", tasksTotal: 10, tasksCompleted: 5, stagePct: 40, health: "healthy" },
      { name: "B", stage: "Idea", tasksTotal: 0, tasksCompleted: 0, stagePct: null, health: "stalled" },
    ], "A");
    const stats = v.panels[0] as any;
    expect(stats.items[1].value).toBe("5/10");
    expect(stats.items[2].value).toBe("1");
    const bars = v.panels.find((p) => p.type === "bars") as any;
    expect(bars.items).toHaveLength(1);
    expect(bars.items[0].note).toContain("active");
  });
});

describe("mirror visual", () => {
  it("draws beliefs by confidence and skips empty panels", () => {
    const v = buildMirrorVisual({ beliefs: [{ belief: "Avoids calls", confidence: 0.8, trend: "persistent" }, { belief: "Ships fast", confidence: 0.6, trend: "strengthening" }], skills: [], signals: [], strengthening_patterns: [], weakening_patterns: [], may_be_wrong_about: [], self_reported_accuracy: { sample_size: 0, accuracy_pct: null, summary: "" } });
    const bars = v.panels.find((p) => p.type === "bars") as any;
    expect(bars.items[0].value).toBe(80);
    expect(v.panels.some((p) => p.type === "gauge" || p.type === "radar" || p.type === "tree")).toBe(false);
  });
});

/**
 * lib/visuals/achievementsVisual.ts — the founder's achievement journey as a
 * VisualSpec. Every number is a count of real unlocks; nothing is projected.
 */
import type { VisualSpec, VisualTone } from "./spec";

export interface AchLite { id: string; label: string; category: string; rarity: string; xp: number; secret?: boolean }
export interface LevelLite { level: number; title: string; nextXp: number; progress: number }

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildAchievementsVisual(args: {
  achievements: AchLite[]; unlocked: Set<string>; timestamps?: Record<string, string>; xp: number; level: LevelLite; maxStreak?: number;
}): VisualSpec {
  const { achievements, unlocked, timestamps = {}, xp, level } = args;
  const done = achievements.filter((a) => unlocked.has(a.id));
  const panels: VisualSpec["panels"] = [];

  panels.push({
    type: "stats", items: [
      { label: "Badges earned", value: `${done.length}/${achievements.length}`, tone: "accent" },
      { label: "XP", value: String(xp) },
      { label: "Level", value: `${level.level}`, sub: level.title },
      ...(args.maxStreak ? [{ label: "Best streak", value: `${args.maxStreak}d` }] : []),
    ],
  });

  panels.push({
    type: "gauge", title: "Next level", value: Math.round(level.progress * 100), max: 100,
    label: `${Math.round(level.progress * 100)}%`, caption: level.nextXp > xp ? `${level.nextXp - xp} XP to Level ${level.level + 1}` : "Top level reached", tone: "accent",
  });

  const cats = [...new Set(achievements.map((a) => a.category))];
  if (cats.length >= 3) {
    panels.push({
      type: "radar", title: "Where your badges come from", caption: "Share of each category you have earned.",
      axes: cats.map((c) => {
        const all = achievements.filter((a) => a.category === c);
        return { label: cap(c), value: Math.round((all.filter((a) => unlocked.has(a.id)).length / Math.max(1, all.length)) * 100), max: 100 };
      }),
    });
  }

  const rarity = RARITY_ORDER.map((r) => {
    const all = achievements.filter((a) => a.rarity === r);
    const got = all.filter((a) => unlocked.has(a.id)).length;
    return { r, all: all.length, got };
  }).filter((x) => x.all > 0);
  panels.push({
    type: "bars", title: "By rarity", caption: "Earned out of available.",
    items: rarity.map((x) => ({ label: cap(x.r), value: x.got, max: x.all, note: `${x.got}/${x.all}`, tone: (x.r === "legendary" || x.r === "epic" ? "accent" : "neutral") as VisualTone })),
  });

  // Cumulative unlocks by month, from real unlock timestamps.
  const months = new Map<string, number>();
  for (const a of done) {
    const t = timestamps[a.id]; if (!t) continue;
    const d = new Date(t); if (Number.isNaN(+d)) continue;
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(k, (months.get(k) ?? 0) + 1);
  }
  const keys = [...months.keys()].sort();
  if (keys.length >= 2) {
    let run = 0;
    panels.push({
      type: "line", title: "Badges over time", caption: "Cumulative unlocks by month.", unit: "",
      points: keys.map((k) => { run += months.get(k) ?? 0; return { label: k.slice(2), value: run }; }),
    });
  }

  const best = [...done].sort((a, b) => b.xp - a.xp).slice(0, 3);
  if (best.length) {
    panels.push({ type: "tree", title: "Your rarest wins", root: "Highest-XP badges", branches: best.map((a) => ({ label: a.label, note: `${a.xp} XP · ${cap(a.rarity)}`, tone: "accent" as VisualTone })) });
  }
  return { title: "Your founder journey", subtitle: `Level ${level.level} · ${level.title}`, panels };
}

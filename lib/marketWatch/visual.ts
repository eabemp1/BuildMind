/** Market Watch, drawn. Pure: reads a saved scan, writes a VisualSpec. */
import type { VisualPanel, VisualSpec } from "@/lib/visuals/spec";
import type { MarketChange, WatchedCompetitor } from "@/lib/marketWatch/diff";

export interface WatchView { weekStart: string; baseline: boolean; changes: MarketChange[]; competitors: WatchedCompetitor[] }

export function buildMarketVisual(watch: WatchView | null, now: Date = new Date()): { visual: VisualSpec; changeCount: number } {
  const head = { title: "Market Watch", subtitle: "What changed around you this week", generatedAt: now.toISOString() };
  if (!watch) {
    return { changeCount: 0, visual: { ...head, panels: [{ type: "callout", tone: "neutral", title: "No scan yet", text: "Market Watch reads your competitors' pages and community threads once a week. Run Break My Startup so it knows who to watch, then scan." }] } };
  }
  const panels: VisualPanel[] = [];
  const loaded = watch.competitors.filter((c) => c.ok).length;
  panels.push({ type: "stats", title: `Week of ${watch.weekStart}`, items: [
    { label: "Competitors watched", value: String(watch.competitors.length), tone: "accent" },
    { label: "Pages that loaded", value: String(loaded), tone: loaded === watch.competitors.length ? "good" : "warn" },
    { label: "Changes", value: watch.baseline ? "Baseline" : String(watch.changes.length), sub: watch.baseline ? "first scan, nothing to compare yet" : undefined, tone: watch.changes.length ? "warn" : "neutral" },
  ] });
  if (!watch.baseline) {
    panels.push(watch.changes.length
      ? { type: "tree", title: "What changed", root: "Since last week", branches: watch.changes.slice(0, 10).map((c) => ({ label: c.text, tone: c.kind === "price" || c.kind === "new_competitor" ? "warn" as const : "neutral" as const })) }
      : { type: "callout", tone: "good", title: "Quiet week", text: "Nothing changed on the pages and threads BuildMind reads." });
  }
  panels.push({ type: "tree", title: "Prices printed on their pages", root: "Competitors", caption: "Only prices found on the page itself. A price missing here may be behind a form.", branches: watch.competitors.map((c) => ({ label: c.name, tone: c.ok ? ("neutral" as const) : ("warn" as const), note: !c.ok ? "page did not load" : c.price ?? "no price on the page" })) });
  panels.push({ type: "callout", tone: "neutral", title: "How to read this", text: "BuildMind compares what it reads each week: prices, page titles, new community threads. It does not measure sentiment or traffic, and it only sees public pages." });
  return { changeCount: watch.changes.length, visual: { ...head, panels } };
}

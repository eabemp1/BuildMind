/** Market Watch, drawn. Pure: reads a saved scan, writes a VisualSpec. */
import type { VisualPanel, VisualSpec } from "@/lib/visuals/spec";
import { REASON_LABEL } from "@/lib/marketWatch/freshness";
import type { MarketChange, WatchedCompetitor, WatchedThread } from "@/lib/marketWatch/diff";

export interface WatchView { weekStart: string; baseline: boolean; changes: MarketChange[]; competitors: WatchedCompetitor[]; threads?: WatchedThread[] }

export function buildMarketVisual(watch: WatchView | null, now: Date = new Date()): { visual: VisualSpec; changeCount: number } {
  const head = { title: "Market Watch", subtitle: "What changed around you this week", generatedAt: now.toISOString() };
  if (!watch) {
    return { changeCount: 0, visual: { ...head, panels: [{ type: "callout", tone: "neutral", title: "No scan yet", text: "Market Watch reads your competitors' pages and community threads once a week. It takes the competitors from your latest saved Break My Startup run, so run one while signed in, then scan." }] } };
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
      ? { type: "tree", title: "What changed", root: "Since last week", branches: watch.changes.slice(0, 10).map((c) => ({ label: c.text, tone: c.kind === "price" || c.kind === "new_competitor" ? "warn" as const : "neutral" as const, url: c.url, note: c.kind === "new_thread" ? [c.publisher, c.publishedAt ? `published ${c.publishedAt}` : null, c.checkedAt ? `checked ${c.checkedAt}` : null].filter(Boolean).join(" · ") : undefined })) }
      : { type: "callout", tone: "good", title: "Quiet week", text: "Nothing changed on the pages and threads BuildMind reads." });
  }
  panels.push({ type: "tree", title: "Prices printed on their pages", root: "Competitors", caption: "Only prices found on the page itself. A price missing here may be behind a form.", branches: watch.competitors.map((c) => ({ label: c.name, tone: c.ok ? ("neutral" as const) : ("warn" as const), note: !c.ok ? "page did not load" : c.price ?? "no price on the page", url: c.url })) });
  const all = watch.threads ?? [];
  const note = (t: WatchedThread) => [t.primary ? "from the competitor" : null, t.publisher, t.publishedAt ? `published ${t.publishedAt}` : "no publication date", t.checkedAt ? `checked ${t.checkedAt}` : null].filter(Boolean).join(" · ");
  const branch = (t: WatchedThread) => ({ label: t.title.slice(0, 110), note: note(t), tone: "neutral" as const, url: t.url });
  const week = all.filter((t) => t.status === "this_week");
  const context = all.filter((t) => t.status === "context");
  const left = all.filter((t) => t.status !== "this_week" && t.status !== "context");
  if (week.length) panels.push({ type: "tree", title: "Published this week", root: "Pages dated inside this week", caption: "Counted as changes. The date is the page's own, not the day BuildMind read it.", branches: week.slice(0, 8).map(branch) });
  if (context.length) panels.push({ type: "tree", title: "Background, last 90 days", root: "Published before this week", caption: "Context only. Not counted as a change this week.", branches: context.slice(0, 8).map(branch) });
  if (all.length && !week.length && !context.length) panels.push({ type: "callout", tone: "neutral", title: "No dated sources", text: "BuildMind found links but could not verify that any were published in the last 90 days, so none are shown as evidence." });
  if (left.length) {
    const unchecked = left.filter((t) => !t.status).length;
    const why = left.filter((t) => t.status).reduce<Record<string, number>>((m, t) => { const k = REASON_LABEL[t.reason ?? "undated"]; m[k] = (m[k] ?? 0) + 1; return m; }, {});
    const parts = Object.entries(why).map(([k, n]) => `${n} ${k}`);
    if (unchecked) parts.push(`${unchecked} saved before date checks`);
    panels.push({ type: "callout", tone: "neutral", title: `${left.length} ${left.length === 1 ? "source" : "sources"} left out`, text: `Could not verify as recent: ${parts.join(", ")}. Old or undated pages can explain the background, but they are not shown as something that changed.` });
  }
  panels.push({ type: "callout", tone: "neutral", title: "How to read this", text: "BuildMind compares what it reads each week: prices, page titles, and pages that state a publication date inside the week. A page without a date, or older than 90 days, is never counted as a change. It does not measure sentiment or traffic, and it only sees public pages." });
  return { changeCount: watch.changes.length, visual: { ...head, panels } };
}

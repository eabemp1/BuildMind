/** Portfolio of projects as a VisualSpec. Counts and percentages come straight from project summaries. */
import type { VisualSpec, VisualTone } from "./spec";

export interface PortfolioProject {
  name: string; stage: string; tasksTotal: number; tasksCompleted: number;
  stagePct?: number | null; health: "completed" | "healthy" | "at-risk" | "stalled";
}
const STAGES = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];
const HEALTH_TONE: Record<PortfolioProject["health"], VisualTone> = { completed: "good", healthy: "good", "at-risk": "warn", stalled: "bad" };

export function buildPortfolioVisual(projects: PortfolioProject[], activeName?: string): VisualSpec {
  const panels: VisualSpec["panels"] = [];
  const total = projects.reduce((s, p) => s + p.tasksTotal, 0);
  const done = projects.reduce((s, p) => s + p.tasksCompleted, 0);
  const stalled = projects.filter((p) => p.health === "stalled").length;
  panels.push({ type: "stats", items: [
    { label: "Projects", value: String(projects.length) },
    { label: "Tasks done", value: `${done}/${total}`, tone: "accent" },
    { label: "Stalled", value: String(stalled), tone: stalled ? "bad" : "good", sub: stalled ? "need a small win" : "none" },
  ] });
  if (total > 0) panels.push({ type: "gauge", title: "Overall completion", value: Math.round((done / total) * 100), max: 100, label: `${Math.round((done / total) * 100)}%`, caption: `${done} of ${total} tasks across all projects`, tone: "accent" });
  panels.push({ type: "bars", title: "Completion by project", unit: "%", items: projects.filter((p) => p.tasksTotal > 0).slice(0, 8).map((p) => ({
    label: p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name, value: Math.round((p.tasksCompleted / p.tasksTotal) * 100), max: 100,
    note: `${p.tasksCompleted}/${p.tasksTotal}${p.name === activeName ? " · active" : ""}`, tone: HEALTH_TONE[p.health],
  })) });
  const present = STAGES.map((s) => ({ s, n: projects.filter((p) => p.stage === s).length }));
  if (projects.length > 1) panels.push({ type: "bars", title: "Where projects sit on the ladder", caption: "Idea to Revenue", items: present.map((x) => ({ label: x.s, value: x.n, max: Math.max(1, projects.length), tone: "neutral" as VisualTone })) });
  const staged = projects.filter((p) => typeof p.stagePct === "number");
  if (staged.length) panels.push({ type: "bars", title: "Progress through current stage", unit: "%", items: staged.slice(0, 8).map((p) => ({ label: p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name, value: p.stagePct as number, max: 100, note: p.stage, tone: "accent" as VisualTone })) });
  return { title: "Your project portfolio", subtitle: `${projects.length} project${projects.length === 1 ? "" : "s"}`, panels };
}

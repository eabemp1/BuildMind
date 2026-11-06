/**
 * lib/investor/visual.ts — a one-page investor snapshot, drawn from the founder's own record.
 *
 * Pure. Only numbers BuildMind actually holds appear, each with where it came from. Things BuildMind does not
 * track (retention, burn, runway, acquisition cost) are listed as left out, never estimated.
 */
import type { VisualPanel, VisualSpec } from "@/lib/visuals/spec";
import type { Rung } from "@/lib/pmf/ladder";

export interface InvestorInputs {
  projectName?: string;
  stage?: string | null;
  /** Live payment summaries only; callers drop test-mode and typed-in numbers. */
  revenue: Array<{ source: string; payingCustomers: number; recurringKnown?: boolean; mrr: Record<string, number>; last30d: Record<string, number>; paymentsLast30d: number }>;
  search?: { clicks: number; impressions: number } | null;
  github?: { repo: string; mergedPRs30d: number; commits30d: number; shipped: string[] } | null;
  milestones: { total: number; done: number };
  tasks: { total: number; done: number };
  people: { reached: number; talked: number };
  pmf?: { observed: number; total: number } | null;
}

type Item = { label: string; value: string; sub?: string; tone?: "good" | "accent" | "neutral" };
const money = (m: Record<string, number>) => Object.entries(m).filter(([, v]) => v > 0).map(([c, v]) => `${c} ${Math.round(v).toLocaleString("en-US")}`).join(" + ");

export function buildInvestorVisual(i: InvestorInputs, now: Date = new Date()): { visual: VisualSpec; shown: number } {
  const traction: Item[] = [];
  for (const r of i.revenue) {
    if (r.payingCustomers > 0) traction.push({ label: "Paying customers", value: String(r.payingCustomers), sub: r.source, tone: "good" });
    if (r.recurringKnown !== false && money(r.mrr)) traction.push({ label: "Monthly recurring revenue", value: money(r.mrr), sub: r.source, tone: "good" });
    if (money(r.last30d)) traction.push({ label: "Revenue, last 30 days", value: money(r.last30d), sub: `${r.paymentsLast30d} ${r.paymentsLast30d === 1 ? "payment" : "payments"}, ${r.source}` });
  }
  if (i.search && i.search.impressions > 0) traction.push({ label: "Google search clicks", value: String(i.search.clicks), sub: `${i.search.impressions.toLocaleString("en-US")} impressions, Search Console` });
  if (i.people.reached > 0) traction.push({ label: "Customers spoken to", value: String(i.people.talked), sub: `${i.people.reached} reached out to` });

  const activity: Item[] = [];
  if (i.milestones.total > 0) activity.push({ label: "Milestones done", value: `${i.milestones.done} of ${i.milestones.total}`, tone: "accent" });
  if (i.tasks.total > 0) activity.push({ label: "Tasks done", value: `${i.tasks.done} of ${i.tasks.total}` });
  if (i.github && (i.github.mergedPRs30d || i.github.commits30d)) activity.push({ label: "Shipped, last 30 days", value: `${i.github.mergedPRs30d} merged PRs`, sub: `${i.github.commits30d} commits, GitHub` });
  if (i.pmf) activity.push({ label: "PMF signs observed", value: `${i.pmf.observed} of ${i.pmf.total}`, sub: "evidence checklist, not a score" });
  if (i.stage) activity.push({ label: "Stage", value: i.stage });

  const panels: VisualPanel[] = [];
  if (traction.length) panels.push({ type: "stats", title: "Traction", items: traction });
  if (activity.length) panels.push({ type: "stats", title: "Execution", items: activity });
  if (i.github?.shipped?.length) panels.push({ type: "tree", title: "What shipped", root: i.github.repo, branches: i.github.shipped.slice(0, 6).map((s) => ({ label: s.slice(0, 120) })) });
  if (!panels.length) panels.push({ type: "callout", tone: "neutral", title: "Nothing to show yet", text: "Connect a payment tool, Search Console or GitHub, or log customer conversations, and this page fills in from them." });
  panels.push({ type: "callout", tone: "neutral", title: "Left out on purpose", text: "Retention, burn, runway and acquisition cost are not tracked by BuildMind, so they are not shown or estimated. Add them yourself before you send this." });
  return { shown: traction.length + activity.length, visual: { title: `${i.projectName ? `${i.projectName}: ` : ""}Investor snapshot`, subtitle: "Only what the record shows", generatedAt: now.toISOString(), panels } };
}

export type { Rung };

/**
 * lib/adminBriefing.ts — turns the raw admin dashboard payload into a briefing:
 * KPIs with deltas, a "needs attention" list, 30-day signups, recent signups.
 * Pure and unit tested; the page only draws it.
 */
export interface BUser { id: string; email: string; plan: "free" | "builder"; created_at: string; last_seen: string | null; projects_count: number }
export interface BInput {
  users: BUser[];
  mrr: { mrr: number; active_builders: number; new_this_month: number; churned_this_month: number };
  webhooks: { status: "success" | "failed" | "pending"; received_at: string; event: string; customer_email: string | null }[];
  activity: { date: string; dau: number; wau: number }[];
  quality: { qualityAlert: string | null };
  operator_gate: { briefing_open_rate: number; task_completion_rate: number };
}

export interface Kpi { key: string; label: string; value: string; delta: number | null; deltaLabel: string; spark: number[]; good: "up" | "down" }
export type Severity = "critical" | "warning" | "info";
export interface Attention { id: string; severity: Severity; title: string; detail: string; tab?: string }
export interface Briefing {
  kpis: Kpi[];
  attention: Attention[];
  signups30: { date: string; count: number }[];
  recent: { id: string; email: string; plan: "free" | "builder"; created_at: string; activated: boolean }[];
  totals: { users: number; builders: number; conversion: number };
}

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function signupSeries(users: BUser[], days: number, now: number): { date: string; count: number }[] {
  const m = new Map<string, number>();
  for (const u of users) m.set(u.created_at.slice(0, 10), (m.get(u.created_at.slice(0, 10)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(now - (days - 1 - i) * DAY);
    return { date, count: m.get(date) ?? 0 };
  });
}

export function buildBriefing(d: BInput, now = Date.now()): Briefing {
  const series = signupSeries(d.users, 30, now);
  const cur7 = series.slice(-7).reduce((s, x) => s + x.count, 0);
  const prev7 = series.slice(-14, -7).reduce((s, x) => s + x.count, 0);
  const builders = d.users.filter((u) => u.plan === "builder").length;
  const total = d.users.length;
  const conversion = total ? Math.round((builders / total) * 1000) / 10 : 0;
  const wau = d.activity.map((a) => a.wau);
  const wauNow = wau.at(-1) ?? 0;
  const wauPrev = wau.at(-8) ?? wau[0] ?? 0;
  const dau = d.activity.map((a) => a.dau);

  const kpis: Kpi[] = [
    { key: "signups", label: "Signups (7d)", value: String(cur7), delta: pctDelta(cur7, prev7), deltaLabel: "vs prior 7d", spark: series.slice(-14).map((x) => x.count), good: "up" },
    { key: "wau", label: "Weekly active", value: String(wauNow), delta: pctDelta(wauNow, wauPrev), deltaLabel: "vs 7d ago", spark: wau.slice(-14), good: "up" },
    { key: "dau", label: "Active today", value: String(dau.at(-1) ?? 0), delta: null, deltaLabel: "today", spark: dau.slice(-14), good: "up" },
    { key: "mrr", label: "MRR", value: `$${d.mrr.mrr.toLocaleString()}`, delta: null, deltaLabel: `${d.mrr.active_builders} builders`, spark: [], good: "up" },
    { key: "conv", label: "Free → Builder", value: `${conversion}%`, delta: null, deltaLabel: `${builders} of ${total}`, spark: [], good: "up" },
  ];

  const attention: Attention[] = [];
  const failed = d.webhooks.filter((w) => w.status === "failed" && now - new Date(w.received_at).getTime() < 7 * DAY);
  if (failed.length) attention.push({ id: "failed-pay", severity: "critical", title: `${failed.length} failed payment event${failed.length > 1 ? "s" : ""}`, detail: "Last 7 days. Check whether those founders lost access.", tab: "revenue" });
  if (d.quality.qualityAlert) attention.push({ id: "quality", severity: "warning", title: "AI quality alert", detail: d.quality.qualityAlert, tab: "ai" });
  const lastSignup = d.users.reduce((m, u) => Math.max(m, new Date(u.created_at).getTime()), 0);
  if (total > 0 && now - lastSignup > 3 * DAY) attention.push({ id: "quiet", severity: "warning", title: "No signups in 3+ days", detail: "Acquisition has gone quiet.", tab: "growth" });
  else if (prev7 >= 4 && cur7 < prev7 * 0.5) attention.push({ id: "drop", severity: "warning", title: "Signups halved week over week", detail: `${cur7} this week vs ${prev7} the week before.`, tab: "growth" });
  const atRisk = d.users.filter((u) => u.plan === "builder" && (!u.last_seen || now - new Date(u.last_seen).getTime() > 7 * DAY));
  if (atRisk.length) attention.push({ id: "churn", severity: "warning", title: `${atRisk.length} paying builder${atRisk.length > 1 ? "s" : ""} inactive 7d+`, detail: "Churn risk. A personal note now is cheap.", tab: "users" });
  if (d.mrr.churned_this_month > 0) attention.push({ id: "churned", severity: "info", title: `${d.mrr.churned_this_month} churned this month`, detail: "Cancelled subscriptions.", tab: "revenue" });
  if (d.operator_gate.briefing_open_rate < 35) attention.push({ id: "open", severity: "info", title: `Briefing open rate ${d.operator_gate.briefing_open_rate}%`, detail: "Target is 35%+.", tab: "engagement" });
  if (d.operator_gate.task_completion_rate < 55) attention.push({ id: "tasks", severity: "info", title: `Task completion ${d.operator_gate.task_completion_rate}%`, detail: "Target is 55%+.", tab: "engagement" });
  const order = { critical: 0, warning: 1, info: 2 } as const;
  attention.sort((a, b) => order[a.severity] - order[b.severity]);

  const recent = [...d.users]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((u) => ({ id: u.id, email: u.email, plan: u.plan, created_at: u.created_at, activated: u.projects_count > 0 }));

  return { kpis, attention, signups30: series, recent, totals: { users: total, builders, conversion } };
}

/**
 * lib/funnel/report.ts — where founders drop off.
 *
 *   landing visitors -> signups -> first real action -> back within 7 days
 *
 * Pure. Visitors are distinct browsers (not page loads) with a landing_view. Signups are accounts created in
 * the window, from the auth list, so the number is exact. A first real action is a completed Today task. A
 * return is any activity on a later day, up to day 7 after signup; only accounts old enough to have had
 * 7 days count towards that rate. QA accounts and QA browsers are left out of every number.
 */
export interface Visit { vid: string | null; source: string; at: string }
export interface Account { id: string; email: string | null; createdAt: string }
export interface SignupTouch { userId: string; source: string; at: string }
export interface Activity { userId: string; type: string; at: string }

export interface FunnelInput {
  now: Date; days: number;
  visits: Visit[]; accounts: Account[]; signupTouches: SignupTouch[]; activity: Activity[];
  isExcluded: (a: Account) => boolean;
}

export interface FunnelRow { source: string; visitors: number; signups: number; firstAction: number; returnEligible: number; returned: number }
export interface FunnelReport { days: number; total: FunnelRow; bySource: FunnelRow[]; excludedAccounts: number; diagnosis: string; enoughData: boolean }

const DAY = 86_400_000;
const dayIndex = (iso: string) => Math.floor(Date.parse(iso) / DAY);
/** Event types that count as being back. A task, a reflection, or opening the app. */
const BACK = new Set(["task_completed", "reflection_done", "app_open", "login", "coach_session", "task_accepted"]);

export function buildFunnel(i: FunnelInput): FunnelReport {
  const since = i.now.getTime() - i.days * DAY;
  const accounts = i.accounts.filter((a) => Date.parse(a.createdAt) >= since && Date.parse(a.createdAt) <= i.now.getTime());
  const kept = accounts.filter((a) => !i.isExcluded(a));

  // A source is credited only when its signup event came within two days of the account being made.
  const byUser = new Map<string, string>();
  for (const t of [...i.signupTouches].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const a = kept.find((x) => x.id === t.userId);
    if (a && !byUser.has(a.id) && Math.abs(Date.parse(t.at) - Date.parse(a.createdAt)) < 2 * DAY) byUser.set(a.id, t.source || "unknown");
  }

  const acts = new Map<string, Activity[]>();
  for (const a of i.activity) { const l = acts.get(a.userId) ?? []; l.push(a); acts.set(a.userId, l); }

  const rows = new Map<string, FunnelRow>();
  const row = (s: string) => { let r = rows.get(s); if (!r) { r = { source: s, visitors: 0, signups: 0, firstAction: 0, returnEligible: 0, returned: 0 }; rows.set(s, r); } return r; };

  const seen = new Set<string>();
  for (const v of i.visits) {
    if (!v.vid || Date.parse(v.at) < since) continue;
    if (seen.has(v.vid)) continue;
    seen.add(v.vid);
    row(v.source || "direct").visitors++;
  }

  for (const a of kept) {
    const r = row(byUser.get(a.id) ?? "unknown");
    r.signups++;
    const mine = acts.get(a.id) ?? [];
    if (mine.some((e) => e.type === "task_completed" && Date.parse(e.at) >= Date.parse(a.createdAt))) r.firstAction++;
    if (i.now.getTime() - Date.parse(a.createdAt) >= 7 * DAY) {
      r.returnEligible++;
      const d0 = dayIndex(a.createdAt);
      if (mine.some((e) => BACK.has(e.type) && dayIndex(e.at) > d0 && dayIndex(e.at) <= d0 + 7)) r.returned++;
    }
  }

  const bySource = [...rows.values()].sort((a, b) => b.visitors + b.signups - (a.visitors + a.signups));
  const sum = (k: keyof Omit<FunnelRow, "source">) => bySource.reduce((n, r) => n + r[k], 0);
  const total: FunnelRow = { source: "All sources", visitors: sum("visitors"), signups: sum("signups"), firstAction: sum("firstAction"), returnEligible: sum("returnEligible"), returned: sum("returned") };
  return { days: i.days, total, bySource, excludedAccounts: accounts.length - kept.length, diagnosis: diagnose(total), enoughData: total.signups >= 20 };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Names the stage that loses the largest share. Says so plainly when the numbers are too small to call. */
export function diagnose(t: FunnelRow): string {
  if (t.visitors === 0 && t.signups === 0) return "No visits or signups in this window, so there is nothing to compare yet.";
  const stages = [
    { name: "signup problem", text: "visitors are not creating accounts", rate: pct(t.signups, t.visitors), from: t.visitors },
    { name: "first-use problem", text: "new accounts are not finishing a first task", rate: pct(t.firstAction, t.signups), from: t.signups },
    { name: "return problem", text: "founders who finish a task are not coming back within 7 days", rate: pct(t.returned, t.returnEligible), from: t.returnEligible },
  ].filter((s) => s.rate !== null);
  if (t.visitors < 50) {
    const traffic = `Only ${t.visitors} distinct visitors, so traffic is the first limit.`;
    return stages.length ? `${traffic} ${low(stages)}` : traffic;
  }
  return stages.length ? low(stages) : "Not enough accounts old enough to judge yet.";
}

function low(stages: Array<{ name: string; text: string; rate: number | null; from: number }>): string {
  const small = stages.filter((s) => s.from < 20);
  const usable = stages.filter((s) => s.from >= 20);
  if (!usable.length) return `Too few people at each stage to call it (${stages.map((s) => `${s.from} at the ${s.name.replace(" problem", "")} stage`).join(", ")}). Treat the percentages as a first look.`;
  const worst = usable.reduce((a, b) => ((a.rate as number) <= (b.rate as number) ? a : b));
  return `Weakest stage: ${worst.name}, where ${worst.text} (${worst.rate}% get through).${small.length ? " Some later stages have under 20 people, so read them loosely." : ""}`;
}

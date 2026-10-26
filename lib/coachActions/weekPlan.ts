/**
 * Week plan: spreads the founder's real open tasks over the next working days.
 * Pure and deterministic. Nothing is saved and no task is changed; Today still picks the daily task.
 *
 * Order: tasks from earlier milestones first, then oldest first. Tasks untouched for STALE_TASK_DAYS go last and are
 * labelled, never silently dropped. How many tasks a day gets depends on energy: today uses the founder's own energy
 * check-in when it is from today; the other days assume a normal day, because energy cannot be known ahead of time.
 */
import { isStaleOpenTask } from "@/lib/staleTasks";
import type { BacklogMilestone, BacklogTaskRow } from "./backlog";

export type EnergyLevel = "fresh" | "ok" | "low" | "wiped";

export const PER_DAY: Record<EnergyLevel, number> = { fresh: 3, ok: 2, low: 1, wiped: 1 };
const NORMAL_DAY = 2;
const WORK_DAYS = 5;

export interface PlannedTask { id: string; title: string; milestone: string; stale: boolean }
export interface PlannedDay { date: string; label: string; isToday: boolean; tasks: PlannedTask[] }
export interface WeekPlan { days: PlannedDay[]; openTotal: number; planned: number; staleCount: number; energy: EnergyLevel | null }

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The next working days, starting today unless today is a weekend. UTC, like the rest of the coach actions. */
export function workingDays(now: Date, count = WORK_DAYS): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Energy counts only if it was reported today. */
export function energyToday(report: { level?: string; at?: string } | null | undefined, now: Date): EnergyLevel | null {
  if (!report?.at || !["fresh", "ok", "low", "wiped"].includes(String(report.level))) return null;
  return report.at.slice(0, 10) === now.toISOString().slice(0, 10) ? (report.level as EnergyLevel) : null;
}

export function planWeek(
  milestones: BacklogMilestone[],
  tasks: BacklogTaskRow[],
  energy: EnergyLevel | null,
  now: Date,
): WeekPlan {
  const order = new Map(milestones.map((m, i) => [m.id, i]));
  const title = new Map(milestones.map((m) => [m.id, m.title]));
  const open = tasks.filter((t) => !t.is_completed && order.has(t.milestone_id));

  const ranked = open
    .map((t) => ({ t, stale: isStaleOpenTask(t, now) }))
    .sort((a, b) =>
      Number(a.stale) - Number(b.stale) ||
      (order.get(a.t.milestone_id) ?? 0) - (order.get(b.t.milestone_id) ?? 0) ||
      Date.parse(a.t.created_at) - Date.parse(b.t.created_at),
    );

  const days = workingDays(now).map((d, i): PlannedDay => ({
    date: d.toISOString().slice(0, 10),
    label: `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
    isToday: d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10),
    tasks: [],
  }));

  let cursor = 0;
  for (const day of days) {
    const cap = day.isToday && energy ? PER_DAY[energy] : NORMAL_DAY;
    while (day.tasks.length < cap && cursor < ranked.length) {
      const { t, stale } = ranked[cursor++];
      day.tasks.push({ id: t.id, title: t.title, milestone: title.get(t.milestone_id) ?? "", stale });
    }
  }

  return {
    days: days.filter((d) => d.tasks.length > 0),
    openTotal: open.length,
    planned: cursor,
    staleCount: ranked.filter((r) => r.stale).length,
    energy,
  };
}

/**
 * lib/server/founderSnapshot.ts
 *
 * ONE read-only snapshot of "where the founder stands right now", built from
 * the same canonical sources every other surface uses:
 *   - momentum / streak / trend  → getFounderScorecard (founder_context)
 *   - week activity              → reflexion_learning_log (Today-flow rows only,
 *                                   credited to the completion day) + action_logs
 *   - overdue milestones         → milestones.target_date
 *   - avoidance / inactivity     → founder_context
 *
 * Why it exists: the Cofounder Pulse used /api/pulse/metrics (pulse_events),
 * which is empty for most founders and returns 0 — so the co-founder said
 * "Momentum is at 0" while Today and Progress said 31. Anything that talks
 * about momentum must read THIS (or the scorecard) instead.
 *
 * Every query is independent and failure-tolerant; a missing value is null,
 * never a fabricated 0.
 */
import { daysSinceActive } from "@/lib/streak";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFounderScorecard } from "@/lib/scorecard";
import { isTodayFlowSession } from "@/lib/todayFlowSessions";

export interface FounderSnapshot {
  momentum: number | null;
  momentumDelta: number | null;
  momentumTrend: "up" | "down" | "flat" | "unknown";
  momentumLabel: string | null;
  streak: number;
  activeDaysThisWeek: number;
  /** Mon..Sun of the current week: which days had a completed action (future days are done:false). */
  weekDays: Array<{ date: string; done: boolean; isToday: boolean; isFuture: boolean }>;
  daysElapsedThisWeek: number;
  activeDaysLastWeekSamePoint: number;
  completedToday: boolean;
  pendingActionTitle: string | null;
  daysInactive: number | null;
  overdueMilestones: number;
  worstOverdue: { title: string; daysLate: number } | null;
  topAvoidance: string | null;
  /** True when there is not enough history for momentum to mean anything. */
  calibrating: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
function weekStartMonday(d: Date): string {
  const dow = d.getUTCDay();
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dayKey(m);
}

export async function getFounderSnapshot(userId: string, projectId?: string, now: Date = new Date()): Promise<FounderSnapshot> {
  const admin = createAdminClient();
  const today = dayKey(now);
  const weekStart = weekStartMonday(now);
  const lastWeekStart = dayKey(new Date(new Date(`${weekStart}T00:00:00.000Z`).getTime() - 7 * DAY));
  const daysElapsed = Math.min(7, Math.floor((now.getTime() - new Date(`${weekStart}T00:00:00.000Z`).getTime()) / DAY) + 1);

  const [scoreRes, logsRes, ctxRes, msRes, alRes] = await Promise.allSettled([
    getFounderScorecard(userId),
    admin.from("reflexion_learning_log")
      .select("outcome, action_shown, created_at, outcome_recorded_at, session_id")
      .eq("user_id", userId).gte("created_at", `${lastWeekStart}T00:00:00.000Z`)
      .order("created_at", { ascending: false }).limit(200),
    admin.from("founder_context").select("days_inactive, last_checkin_date, avoidance_zones, tasks_completed_total").eq("user_id", userId).maybeSingle(),
    (() => {
      let q = admin.from("milestones").select("title, target_date, status").eq("user_id", userId)
        .neq("status", "completed").neq("status", "abandoned").not("target_date", "is", null);
      if (projectId) q = q.eq("project_id", projectId);
      return q;
    })(),
    admin.from("action_logs").select("outcome, created_at").eq("user_id", userId)
      .gte("created_at", `${lastWeekStart}T00:00:00.000Z`).limit(200),
  ]);

  const score = scoreRes.status === "fulfilled" ? scoreRes.value : null;
  const logs = (logsRes.status === "fulfilled" ? (logsRes.value.data ?? []) : [])
    .filter((r: { session_id?: string | null }) => isTodayFlowSession(r.session_id)) as Array<{
      outcome: string | null; action_shown: string | null; created_at: string | null; outcome_recorded_at: string | null;
    }>;
  const actionLogs = (alRes.status === "fulfilled" ? (alRes.value.data ?? []) : []) as Array<{ outcome: string | null; created_at: string | null }>;
  const ctx = ctxRes.status === "fulfilled" ? (ctxRes.value.data as Record<string, unknown> | null) : null;
  const milestones = (msRes.status === "fulfilled" ? (msRes.value.data ?? []) : []) as Array<{ title: string | null; target_date: string | null }>;

  const doneDays: string[] = [];
  for (const r of logs) if (r.outcome === "completed") doneDays.push((r.outcome_recorded_at ?? r.created_at ?? "").slice(0, 10));
  for (const a of actionLogs) if (a.outcome === "completed") doneDays.push((a.created_at ?? "").slice(0, 10));
  const thisWeek = new Set(doneDays.filter((d) => d >= weekStart));
  const lastWeek = new Set(doneDays.filter((d) => d >= lastWeekStart && d < weekStart));

  const pending = logs.find((r) => r.outcome === "pending" && (r.created_at ?? "").slice(0, 10) === today && r.action_shown);

  const overdue = milestones
    .map((m) => ({ title: m.title ?? "Milestone", daysLate: Math.floor((now.getTime() - new Date(`${m.target_date}T00:00:00.000Z`).getTime()) / DAY) }))
    .filter((m) => m.daysLate >= 1)
    .sort((a, b) => b.daysLate - a.daysLate);

  const zones = Array.isArray(ctx?.avoidance_zones) ? (ctx!.avoidance_zones as unknown[]).filter((z): z is string => typeof z === "string") : [];
  const totalDone = typeof ctx?.tasks_completed_total === "number" ? (ctx.tasks_completed_total as number) : (score?.tasksCompletedTotal ?? 0);

  return {
    momentum: score ? Math.round(score.momentum) : null,
    momentumDelta: score?.momentumDelta ?? null,
    momentumTrend: score?.momentumTrend ?? "unknown",
    momentumLabel: score?.momentumLabel?.label ?? null,
    streak: score?.streak ?? 0,
    activeDaysThisWeek: thisWeek.size,
    weekDays: Array.from({ length: 7 }, (_, i) => {
      const date = dayKey(new Date(new Date(`${weekStart}T00:00:00.000Z`).getTime() + i * DAY));
      return { date, done: thisWeek.has(date), isToday: date === today, isFuture: date > today };
    }),
    daysElapsedThisWeek: daysElapsed,
    activeDaysLastWeekSamePoint: [...lastWeek].filter((d) => {
      const idx = Math.floor((new Date(`${d}T00:00:00.000Z`).getTime() - new Date(`${lastWeekStart}T00:00:00.000Z`).getTime()) / DAY);
      return idx < daysElapsed;
    }).length,
    completedToday: thisWeek.has(today),
    pendingActionTitle: pending?.action_shown ?? null,
    daysInactive: daysSinceActive(ctx?.last_checkin_date as string | null | undefined, typeof ctx?.days_inactive === "number" ? (ctx.days_inactive as number) : null),
    overdueMilestones: overdue.length,
    worstOverdue: overdue[0] ?? null,
    topAvoidance: zones[0] ?? null,
    calibrating: totalDone < 3,
  };
}

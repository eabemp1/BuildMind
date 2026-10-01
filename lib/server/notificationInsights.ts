/**
 * lib/server/notificationInsights.ts
 *
 * Builds notifications that carry REAL information from the founder's data
 * (today's task, this week's pace, momentum movement, overdue milestones,
 * stage readiness, avoidance) instead of generic nudges.
 *
 * Read-only: every query is a SELECT, nothing is written. Each item has a
 * stable `dedupeKey` so the client can update an existing notification in
 * place when the numbers change rather than stacking duplicates.
 *
 * Design rules:
 *  - Every item must state at least one concrete number or name from the data.
 *    If there is nothing concrete to say, the item is omitted.
 *  - Completion counting uses the same Today-flow filter as the Progress page
 *    (lib/todayFlowSessions.ts) so the two can never disagree.
 *  - Each query is independent and failure-tolerant — a missing column or
 *    table drops that one insight, never the whole response.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isTodayFlowSession } from "@/lib/todayFlowSessions";

export type InsightNotifType =
  | "today_action"
  | "reflect_pending"
  | "weekly_pace"
  | "momentum_shift"
  | "milestone_overdue"
  | "stage_ready"
  | "avoidance_pattern"
  | "streak_risk";

export interface InsightNotification {
  dedupeKey: string;
  type: InsightNotifType;
  emoji: string;
  title: string;
  body: string;
  priority: "low" | "medium" | "high" | "urgent";
  actionLabel?: string;
  actionHref?: string;
  /** Milliseconds from now until the notification should auto-expire. */
  expiresInMs: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekStartMonday(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return dayKey(monday);
}

function clip(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

interface LogRow {
  outcome: string | null;
  action_shown: string | null;
  created_at: string | null;
  outcome_recorded_at: string | null;
  session_id: string | null;
}

export async function buildInsightNotifications(
  userId: string,
  projectId?: string,
  now: Date = new Date(),
): Promise<InsightNotification[]> {
  const admin = createAdminClient();
  const items: InsightNotification[] = [];
  const today = dayKey(now);
  const weekStart = weekStartMonday(now);
  const lastWeekStart = dayKey(new Date(new Date(`${weekStart}T00:00:00.000Z`).getTime() - 7 * DAY));
  const fourteenAgoIso = `${lastWeekStart}T00:00:00.000Z`;

  const [logsRes, ctxRes, milestonesRes] = await Promise.allSettled([
    admin
      .from("reflexion_learning_log")
      .select("outcome, action_shown, created_at, outcome_recorded_at, session_id")
      .eq("user_id", userId)
      .gte("created_at", fourteenAgoIso)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("founder_context")
      .select("momentum_score, momentum_last_week, streak, avoidance_zones, pending_stage_transition, days_inactive")
      .eq("user_id", userId)
      .maybeSingle(),
    (() => {
      let q = admin
        .from("milestones")
        .select("id, title, target_date, status, project_id")
        .eq("user_id", userId)
        .neq("status", "completed")
        .neq("status", "abandoned")
        .not("target_date", "is", null);
      if (projectId) q = q.eq("project_id", projectId);
      return q;
    })(),
  ]);

  const logs: LogRow[] = (logsRes.status === "fulfilled" ? (logsRes.value.data ?? []) : [])
    .filter((r: { session_id?: string | null }) => isTodayFlowSession(r.session_id)) as LogRow[];
  const ctx = ctxRes.status === "fulfilled" ? (ctxRes.value.data as Record<string, unknown> | null) : null;
  const milestones = (milestonesRes.status === "fulfilled" ? (milestonesRes.value.data ?? []) : []) as Array<{
    id: string; title: string | null; target_date: string | null; status: string | null;
  }>;

  // ── Completion days (this week vs last week), by the day it was completed ──
  const completedDay = (r: LogRow) => (r.outcome_recorded_at ?? r.created_at ?? "").slice(0, 10);
  const completed = logs.filter((r) => r.outcome === "completed");
  const thisWeekDays = new Set(completed.map(completedDay).filter((d) => d >= weekStart));
  const lastWeekDays = new Set(completed.map(completedDay).filter((d) => d >= lastWeekStart && d < weekStart));
  const completedToday = thisWeekDays.has(today);

  // The most recent still-pending recommendation shown today.
  const pendingToday = logs.find(
    (r) => r.outcome === "pending" && (r.created_at ?? "").slice(0, 10) === today && r.action_shown,
  );

  // 1. Today's action / close the loop ---------------------------------------
  if (completedToday) {
    const doneRow = completed.find((r) => completedDay(r) === today);
    items.push({
      dedupeKey: `reflect_pending:${today}`,
      type: "reflect_pending",
      emoji: "🧠",
      title: "Close the loop on today's win",
      body: doneRow?.action_shown
        ? `You finished “${clip(doneRow.action_shown)}”. Log what actually happened — tomorrow's task is built from it.`
        : "You completed today's action. Log what actually happened — tomorrow's task is built from it.",
      priority: "medium",
      actionLabel: "Reflect now →",
      actionHref: "/reflect",
      expiresInMs: 18 * HOUR,
    });
  } else if (pendingToday?.action_shown) {
    items.push({
      dedupeKey: `today_action:${today}`,
      type: "today_action",
      emoji: "🎯",
      title: "Today's action is waiting",
      body: `“${clip(pendingToday.action_shown)}” — one task, not started yet.`,
      priority: "high",
      actionLabel: "Open Today →",
      actionHref: "/today",
      expiresInMs: 16 * HOUR,
    });
  }

  // 2. Weekly pace -------------------------------------------------------------
  const elapsed = Math.min(7, Math.floor((now.getTime() - new Date(`${weekStart}T00:00:00.000Z`).getTime()) / DAY) + 1);
  if (thisWeekDays.size > 0 || lastWeekDays.size > 0) {
    const diff = thisWeekDays.size - Math.min(lastWeekDays.size, elapsed);
    const trend =
      diff > 0 ? `${plural(diff, "day")} ahead of the same point last week`
      : diff < 0 ? `${plural(Math.abs(diff), "day")} behind the same point last week`
      : "level with the same point last week";
    items.push({
      dedupeKey: `weekly_pace:${weekStart}`,
      type: "weekly_pace",
      emoji: diff < 0 ? "📉" : "📈",
      title: `${thisWeekDays.size} of ${elapsed} days active this week`,
      body: `You're ${trend} (last week: ${plural(lastWeekDays.size, "active day")}).`,
      priority: diff < 0 ? "medium" : "low",
      actionLabel: "See progress →",
      actionHref: "/progress",
      expiresInMs: 2 * DAY,
    });
  }

  // 3. Momentum + streak -------------------------------------------------------
  const momentum = typeof ctx?.momentum_score === "number" ? (ctx.momentum_score as number) : null;
  const momentumLast = typeof ctx?.momentum_last_week === "number" ? (ctx.momentum_last_week as number) : null;
  const streak = typeof ctx?.streak === "number" ? (ctx.streak as number) : 0;

  if (momentum !== null && momentumLast !== null && Math.abs(momentum - momentumLast) >= 5) {
    const delta = momentum - momentumLast;
    items.push({
      dedupeKey: `momentum_shift:${weekStart}`,
      type: "momentum_shift",
      emoji: delta > 0 ? "🚀" : "⚠️",
      title: `Momentum ${delta > 0 ? "up" : "down"} ${Math.abs(Math.round(delta))} points`,
      body: `Now ${Math.round(momentum)}/100, from ${Math.round(momentumLast)} last week.${delta < 0 ? " One completed action today starts reversing it." : ""}`,
      priority: delta < 0 ? "high" : "low",
      actionLabel: "Open Today →",
      actionHref: "/today",
      expiresInMs: 3 * DAY,
    });
  }

  if (streak >= 2 && !completedToday && now.getUTCHours() >= 14) {
    items.push({
      dedupeKey: `streak_risk:${today}`,
      type: "streak_risk",
      emoji: "🔥",
      title: `Your ${streak}-day streak ends tonight`,
      body: "No completed action logged today yet. One finished task keeps it alive.",
      priority: "high",
      actionLabel: "Save the streak →",
      actionHref: "/today",
      expiresInMs: 10 * HOUR,
    });
  }

  // 4. Overdue milestones ------------------------------------------------------
  const overdue = milestones
    .map((m) => ({ ...m, daysLate: Math.floor((now.getTime() - new Date(`${m.target_date}T00:00:00.000Z`).getTime()) / DAY) }))
    .filter((m) => m.daysLate >= 1)
    .sort((a, b) => b.daysLate - a.daysLate);
  if (overdue.length > 0) {
    const worst = overdue[0];
    let openTasks: number | null = null;
    try {
      const { count } = await admin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("milestone_id", worst.id)
        .eq("is_completed", false);
      openTasks = count ?? null;
    } catch { /* optional detail */ }
    items.push({
      dedupeKey: `milestone_overdue:${worst.id}`,
      type: "milestone_overdue",
      emoji: "⏳",
      title: `“${clip(worst.title ?? "A milestone", 50)}” is ${plural(worst.daysLate, "day")} past target`,
      body: `${openTasks !== null ? `${plural(openTasks, "task")} still open. ` : ""}${overdue.length > 1 ? `${overdue.length - 1} other milestone${overdue.length - 1 === 1 ? " is" : "s are"} also overdue. ` : ""}Re-date it or cut scope — don't let it drift.`,
      priority: worst.daysLate >= 7 ? "high" : "medium",
      actionLabel: "Review milestones →",
      actionHref: projectId ? `/projects/${projectId}` : "/projects",
      expiresInMs: 2 * DAY,
    });
  }

  // 5. Stage readiness ---------------------------------------------------------
  const pst = ctx?.pending_stage_transition as
    | { current_stage?: string; recommended_stage?: string; readiness_tier?: string; stage_milestones_completed?: number; stage_milestones_total?: number }
    | null | undefined;
  if (pst?.recommended_stage && pst.current_stage) {
    const checklistOnly = pst.readiness_tier === "checklist_only";
    items.push({
      dedupeKey: `stage_ready:${pst.current_stage}->${pst.recommended_stage}`,
      type: "stage_ready",
      emoji: checklistOnly ? "🧾" : "🏁",
      title: checklistOnly
        ? `${pst.current_stage} checklist done — evidence is thin`
        : `Ready to move from ${pst.current_stage} to ${pst.recommended_stage}`,
      body: `${pst.stage_milestones_completed ?? "?"}/${pst.stage_milestones_total ?? "?"} milestones complete.${checklistOnly ? " Add proof (a metric, artifact or experiment) before advancing." : " Review readiness and advance when you agree."}`,
      priority: "medium",
      actionLabel: "Check readiness →",
      actionHref: projectId ? `/projects/${projectId}` : "/projects",
      expiresInMs: 4 * DAY,
    });
  }

  // 6. Avoidance pattern -------------------------------------------------------
  const zones = Array.isArray(ctx?.avoidance_zones) ? (ctx!.avoidance_zones as unknown[]).filter((z): z is string => typeof z === "string") : [];
  if (zones.length > 0) {
    items.push({
      dedupeKey: `avoidance_pattern:${zones[0].toLowerCase()}`,
      type: "avoidance_pattern",
      emoji: "🪞",
      title: `You keep sidestepping: ${clip(zones[0], 40)}`,
      body: "It shows up repeatedly in your skipped and blocked tasks. Today's action is chosen to route through it — try the 10-minute version.",
      priority: "low",
      actionLabel: "Open Today →",
      actionHref: "/today",
      expiresInMs: 5 * DAY,
    });
  }

  return items;
}

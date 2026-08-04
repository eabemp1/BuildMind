/**
 * lib/weeklyPulseData.ts
 *
 * Extracted from app/api/ai/weekly-pulse/route.ts so the data computation
 * has exactly one home. app/api/card/weekly-pulse/route.ts (PNG export)
 * needs the identical data the JSON route returns — rather than duplicate
 * ~250 lines of Supabase queries a second time, both routes call
 * getWeeklyPulseData() and only differ in how they render the result.
 *
 * DATA SOURCES (confirmed by reading the actual live code, not inferred):
 *
 *  - Momentum / streak / xp / momentum trend: lib/scorecard.ts's
 *    getFounderScorecard() — the documented single source of truth.
 *  - Task completions THIS WEEK ("tasks completed", "un-ghosted",
 *    day-active-count): reflexion_learning_log, NOT the generic `tasks`
 *    table. Confirmed via grep that
 *    app/api/founder-context/task-complete/route.ts — the handler for
 *    Today's actual single-daily-action completion flow — never touches
 *    the `tasks` table at all. It only writes founder_context counters,
 *    the standalone score_history table, action_logs, and
 *    reflexion_learning_log. The `tasks` table is a separate, project/
 *    milestone-linked task list unrelated to Today's daily action. An
 *    earlier version of this file read the `tasks` table for these
 *    numbers, which is why completing a Today task never moved this
 *    week's completion count or Ghost Goals — it was reading a table
 *    Today's flow never writes to.
 *  - Real execution line (sparkline): the standalone `score_history` table
 *    (user_id, score, recorded_at) — populated automatically by the same
 *    task-complete handler above, unlike founder_context.score_history
 *    (jsonb), which only updates when a founder visits /reports or
 *    /overview (client-triggered, sparse in practice).
 *  - Ghost/target line: weekly_goals (target_score, tasks_done), keyed by
 *    project_id + week_start. tasks_done is incremented via
 *    app/api/weekly-goal/route.ts's `increment_tasks_done` flag, called
 *    from Today's check-in flow only on an actual completion — this too
 *    was broken until fixed (that endpoint previously required the caller
 *    to pass an absolute new value, which Today's check-in never did).
 *  - Milestone pacing: lib/milestonePacing.ts over milestones.target_date/
 *    status/created_at + the `tasks` table's milestone-linked rows. This
 *    genuinely is the project task list, a different concept from Today's
 *    daily action — kept as-is.
 *  - Backlog clearance (grading): also the generic `tasks` table, same
 *    reasoning as milestone pacing — measures carried-over PROJECT tasks,
 *    not Today completions. Not yet re-examined against the founder's
 *    "should use Today completions" feedback; flagged, not silently changed,
 *    since it's a distinct dimension from the ones explicitly reported broken.
 *  - Founder Archetype: read-only from founder_memory.personality_tags —
 *    never reclassified here.
 *  - Override reasons: reflexion_learning_log.outcome_note, same query as
 *    the completions fetch above (merged into one query — no longer a
 *    separate round-trip to the same table).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { callModelJSON, hasAIProvider } from "@/lib/ai-providers";
import { getFounderScorecard } from "@/lib/scorecard";
import { computeMilestonePacing, type MilestonePacingResult } from "@/lib/milestonePacing";
import { computeWeeklyGrades, type GradedDimension } from "@/lib/patternGrading";

export interface SparklinePoint { date: string; real: number | null; ghost: number | null; }

export interface WeeklyPulseResponse {
  is_quiet_week: boolean;
  momentum_score: number;
  momentum_delta: number | null;
  streak: number;
  tasks_completed: number;
  tasks_total: number;
  completion_rate: number;
  active_days: number;
  un_ghosted: string[];
  milestones: MilestonePacingResult[];
  archetype: string | null;
  day_of_week: Record<string, { completed: number; total: number }>;
  confidence_by_outcome: Record<string, number>;
  top_override_reason: string | null;
  weekly_goal: { goal_text: string; target_score: number; current_score: number; target_tasks: number; tasks_done: number; status: string } | null;
  sparkline: SparklinePoint[];
  grades: GradedDimension[];
  story: string;
  generated_at: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekStartMonday(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export async function getWeeklyPulseData(userId: string, projectId?: string): Promise<WeeklyPulseResponse> {
  const admin = createAdminClient();
  const now = new Date();
  const weekStart = weekStartMonday(now);
  // FIX: previously a rolling "now minus 7 days" window, while
  // weekly_goals (Ghost Goals, app/api/weekly-goal/route.ts) uses the
  // calendar week starting Monday. On any day other than Monday, those two
  // windows cover different date ranges — Ghost Goals only counts since
  // this Monday, while This Week's rolling window reached back into the
  // PREVIOUS calendar week too. That mismatch is why task counts between
  // Ghost Goals (Today) and This Week (Progress) could disagree, and why
  // it wasn't obvious which tasks were actually being reflected where.
  // Now both use the same Monday-anchored week.
  const weekAgoIso = `${weekStart}T00:00:00.000Z`;

  const [
    scorecardResult,
    scoreHistoryResult,
    memoryResult,
    weekTasksResult,
    backlogTasksResult,
    milestonesResult,
    weeklyGoalResult,
    reflectionsResult,
    actionLogsResult,
  ] = await Promise.allSettled([
    getFounderScorecard(userId),
    admin.from("score_history").select("score, recorded_at").eq("user_id", userId).gte("recorded_at", weekAgoIso).order("recorded_at", { ascending: true }),
    admin.from("founder_memory").select("avoidance_zones, personality_tags, insight_history").eq("user_id", userId).maybeSingle(),
    // FIX: previously queried the generic `tasks` table for this week's
    // completions and for the un-ghosted title matching. Confirmed via grep
    // that app/api/founder-context/task-complete/route.ts (Today's actual
    // completion handler) NEVER touches the `tasks` table at all — it only
    // writes founder_context counters, score_history, action_logs, and
    // reflexion_learning_log. The `tasks` table is a separate, project/
    // milestone-linked task list, unrelated to Today's single daily action.
    // That mismatch is why completing a Today task never moved this
    // week's completion count or Ghost Goals — this route was reading a
    // table Today's flow never writes to. reflexion_learning_log.action_shown
    // holds the real task text (confirmed via the same route's insert call),
    // so it also replaces the tasks-table title source for un-ghosted
    // matching below.
    admin.from("reflexion_learning_log").select("outcome, action_shown, outcome_note, created_at").eq("user_id", userId).gte("created_at", weekAgoIso),
    admin.from("tasks").select("id, status, updated_at").eq("user_id", userId).lt("created_at", weekAgoIso),
    (() => {
      let q = admin.from("milestones").select("id, title, target_date, status, created_at, project_id").eq("user_id", userId).neq("status", "abandoned");
      if (projectId) q = q.eq("project_id", projectId);
      return q;
    })(),
    projectId
      ? admin.from("weekly_goals").select("*").eq("project_id", projectId).eq("week_start", weekStart).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("reflections").select("confidence, outcome, created_at").eq("user_id", userId).gte("created_at", weekAgoIso),
    admin.from("action_logs").select("outcome, created_at").eq("user_id", userId).gte("created_at", weekAgoIso),
  ]);

  const scorecard = scorecardResult.status === "fulfilled" ? scorecardResult.value : null;
  const scoreHistory: Array<{ date: string; score: number }> =
    scoreHistoryResult.status === "fulfilled"
      ? (scoreHistoryResult.value.data ?? []).map((row: { score: number; recorded_at: string }) => ({
          date: row.recorded_at.slice(0, 10),
          score: row.score,
        }))
      : [];
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;
  // "weekTasks" here now means reflexion_learning_log rows for this week —
  // each represents one shown/answered Today action, not a `tasks` table row.
  const weekTasks = weekTasksResult.status === "fulfilled" ? (weekTasksResult.value.data ?? []) : [];
  const backlogTasks = backlogTasksResult.status === "fulfilled" ? (backlogTasksResult.value.data ?? []) : [];
  const milestoneRows = milestonesResult.status === "fulfilled" ? (milestonesResult.value.data ?? []) : [];
  const weeklyGoalRow = weeklyGoalResult.status === "fulfilled" ? (weeklyGoalResult.value as { data: any })?.data ?? null : null;
  const reflections = reflectionsResult.status === "fulfilled" ? (reflectionsResult.value.data ?? []) : [];
  const actionLogs = actionLogsResult.status === "fulfilled" ? (actionLogsResult.value.data ?? []) : [];
  // Override reasons now derived from the same weekTasks fetch (both come
  // from reflexion_learning_log) instead of a second, redundant query.
  const overrideLogs = weekTasks;

  const tasksCompleted = weekTasks.filter((t) => t.outcome === "completed").length;
  const tasksTotal = weekTasks.length;
  const completionRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const activeDaySet = new Set(
    weekTasks.filter((t) => t.outcome === "completed").map((t) => (t.created_at ?? "").slice(0, 10)),
  );
  const activeDays = activeDaySet.size;

  const backlogStillOpenOrClearedThisWeek = backlogTasks.filter(
    (t) => t.status !== "completed" || (t.updated_at ?? "") >= weekAgoIso,
  );
  const backlogTotal = backlogStillOpenOrClearedThisWeek.length;
  const backlogCleared = backlogStillOpenOrClearedThisWeek.filter(
    (t) => t.status === "completed" && (t.updated_at ?? "") >= weekAgoIso,
  ).length;

  const momentumScore = scorecard?.momentum ?? 50;
  const momentumDelta = scorecard?.momentumDelta ?? null;
  const streak = scorecard?.streak ?? 0;

  const personalityTags: string[] = Array.isArray(memory?.personality_tags) ? memory.personality_tags : [];
  const archetypeTag = personalityTags.find((t) => t.startsWith("archetype:"));
  const archetype = archetypeTag && archetypeTag !== "archetype:unclassified"
    ? archetypeTag.replace("archetype:", "")
    : null;

  const avoidanceZones: string[] = Array.isArray(memory?.avoidance_zones) ? memory.avoidance_zones : [];
  const completedTitles = weekTasks.filter((t) => t.outcome === "completed").map((t) => (t.action_shown ?? "").toLowerCase());
  const unGhosted = avoidanceZones.filter((zone) =>
    completedTitles.some((title) => title.includes(zone.toLowerCase()) || zone.toLowerCase().includes(title)),
  );

  const milestoneIds = milestoneRows.map((m) => m.id);
  const taskCountsByMilestone = new Map<string, { total: number; completed: number }>();
  if (milestoneIds.length > 0) {
    const { data: allTasksForMilestones } = await admin.from("tasks").select("milestone_id, status").in("milestone_id", milestoneIds);
    for (const t of allTasksForMilestones ?? []) {
      const key = t.milestone_id as string;
      const entry = taskCountsByMilestone.get(key) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (t.status === "completed") entry.completed += 1;
      taskCountsByMilestone.set(key, entry);
    }
  }
  const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
  const milestones = milestoneRows
    .filter((m) => m.status !== "completed")
    .map((m) => {
      const counts = taskCountsByMilestone.get(m.id) ?? { total: 0, completed: 0 };
      return computeMilestonePacing({
        id: m.id, title: m.title, targetDate: m.target_date, createdAt: m.created_at,
        status: m.status, tasksTotal: counts.total, tasksCompleted: counts.completed,
      });
    })
    .sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk])
    .slice(0, 4);

  const dayOfWeek: Record<string, { completed: number; total: number }> = {};
  DAYS.forEach((d) => { dayOfWeek[d] = { completed: 0, total: 0 }; });
  for (const log of actionLogs as Array<{ outcome?: string; created_at: string }>) {
    const day = DAYS[new Date(log.created_at).getDay()];
    dayOfWeek[day].total++;
    if (log.outcome === "completed") dayOfWeek[day].completed++;
  }

  const confByOutcome: Record<string, number[]> = {};
  for (const r of reflections as Array<{ confidence?: number; outcome?: string }>) {
    if (!r.outcome || r.confidence == null) continue;
    (confByOutcome[r.outcome] ??= []).push(r.confidence);
  }
  const confidenceByOutcome: Record<string, number> = {};
  for (const [k, vals] of Object.entries(confByOutcome)) {
    confidenceByOutcome[k] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  }

  const overrideReasonCounts: Record<string, number> = {};
  for (const log of overrideLogs as Array<{ outcome_note?: string | null }>) {
    if (log.outcome_note) overrideReasonCounts[log.outcome_note] = (overrideReasonCounts[log.outcome_note] ?? 0) + 1;
  }
  const topOverrideReason: string | null =
    Object.entries(overrideReasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const weeklyGoal = weeklyGoalRow
    ? {
        goal_text: weeklyGoalRow.goal_text, target_score: weeklyGoalRow.target_score,
        current_score: weeklyGoalRow.current_score, target_tasks: weeklyGoalRow.target_tasks,
        tasks_done: weeklyGoalRow.tasks_done, status: weeklyGoalRow.status,
      }
    : null;

  const last7 = scoreHistory.slice(-7);
  const startScore = last7[0]?.score ?? momentumScore;
  const sparkline: SparklinePoint[] = last7.map((entry, i) => {
    const ghost = weeklyGoal
      ? Math.round(startScore + ((weeklyGoal.target_score - startScore) * (i / Math.max(1, last7.length - 1))))
      : null;
    return { date: entry.date, real: entry.score, ghost };
  });

  const milestonesWithPacing = milestones.filter((m) => m.risk !== "unknown").length;
  const isQuietWeek = tasksTotal < 3 && milestonesWithPacing === 0;

  const grades = isQuietWeek ? [] : computeWeeklyGrades({
    tasksCompleted, tasksTotal, backlogTotal, backlogCleared, activeDaysThisWeek: activeDays,
    milestoneRisks: milestones.map((m) => m.risk), unGhostedCount: unGhosted.length,
    currentAvoidanceZoneCount: avoidanceZones.length,
  });

  let story: string;
  if (isQuietWeek) {
    story = tasksTotal === 0
      ? `Quiet week — nothing logged yet. Momentum's holding at ${momentumScore}/100, so nothing's slipping, it just paused. Pick one task for tomorrow to get this moving again.`
      : `A quieter week — ${tasksCompleted} of ${tasksTotal} task${tasksTotal === 1 ? "" : "s"} moved. Momentum's holding at ${momentumScore}/100. Pick one thing for next week and this resets.`;
  } else {
    story = `${tasksCompleted} of ${tasksTotal} tasks completed this week (${completionRate}%). Momentum: ${momentumScore}/100.`;
    if (hasAIProvider()) {
      try {
        const gradeLines = grades.filter((g) => g.grade !== "N/A").map((g) => `${g.label}: ${g.grade} — ${g.basis}`).join("\n");
        const factSheet = `
Hard facts (restate exact numbers if referenced — never estimate or invent):
- Tasks: ${tasksCompleted} of ${tasksTotal} completed this week (${completionRate}%), across ${activeDays} active day(s)
- Momentum: ${momentumScore}/100${momentumDelta !== null ? ` (${momentumDelta >= 0 ? "+" : ""}${momentumDelta} vs last week)` : ""}, streak ${streak} days
- Backlog: ${backlogCleared} of ${backlogTotal} carried-over tasks cleared this week
- Un-ghosted (previously avoided, tackled this week): ${unGhosted.length > 0 ? unGhosted.join(", ") : "none"}
- Milestone pacing: ${milestones.length > 0 ? milestones.map((m) => `${m.title} — ${m.reason}`).join("; ") : "no active milestones with a target date"}
- Grades: ${gradeLines || "not enough data yet for grading"}
${archetype ? `- Founder's established long-term archetype (context only, do not reclassify or restate as new): ${archetype}` : ""}
${topOverrideReason ? `- Most common reason for skipped/partial tasks this week: "${topOverrideReason}"` : ""}

Write a 2-3 sentence story-style summary of the founder's week. Brief, specific, a little personality — not a metrics recap. Reference at most 2-3 of the facts above, chosen for what's most notable. If an archetype is given, you may let it color the tone subtly but do not name a new one. Do not invent numbers, dates, or facts not listed above.`;

        const result = await callModelJSON<{ story: string }>([
          {
            role: "system",
            content: "You write brief, story-style weekly progress summaries for startup founders. Return JSON: { \"story\": string }. 2-3 sentences max. Ground every number exactly in what's provided — never estimate or invent.",
          },
          { role: "user", content: factSheet },
        ]);
        if (result?.story && result.story.length >= 20 && result.story.length <= 500) story = result.story;
      } catch {
        // Fall back to the deterministic sentence above.
      }
    }
  }

  if (story.length >= 20 && story.length <= 500) {
    try {
      const existingHistory = Array.isArray(memory?.insight_history) ? memory.insight_history : [];
      const history = [{ text: story, created_at: new Date().toISOString() }, ...existingHistory].slice(0, 10);
      await admin.from("founder_memory").upsert(
        { user_id: userId, insight_history: history, last_insight: story, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    } catch { /* non-fatal */ }
  }

  return {
    is_quiet_week: isQuietWeek,
    momentum_score: momentumScore, momentum_delta: momentumDelta, streak,
    tasks_completed: tasksCompleted, tasks_total: tasksTotal, completion_rate: completionRate,
    active_days: activeDays, un_ghosted: unGhosted, milestones, archetype,
    day_of_week: dayOfWeek, confidence_by_outcome: confidenceByOutcome, top_override_reason: topOverrideReason,
    weekly_goal: weeklyGoal, sparkline, grades, story, generated_at: new Date().toISOString(),
  };
}

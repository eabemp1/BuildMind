/**
 * app/api/ai/weekly-pulse/route.ts
 *
 * Backs the "This Week" tab in app/progress/page.tsx.
 *
 * CORRECTED SCOPE (v2): the founder's instruction was to BORROW existing
 * metrics and re-present them visually + narratively — not recompute new
 * ones. v1 of this route invented `execution_mode`/`un_ghosted` as new
 * derived categories with no home elsewhere. v2 fixes that: every number
 * below is read from wherever it's already tracked, cited inline. The only
 * new computation is lib/milestonePacing.ts (nothing else in the codebase
 * turns target_date + task counts into a projected date) and
 * lib/patternGrading.ts (nothing else grades these dimensions) — both
 * deterministic, no LLM involved, per the founder's "go by the rules"
 * instruction (no invented numbers a model could get wrong).
 *
 * DATA SOURCES, confirmed by reading the actual live code (not inferred
 * from schema comments — see the score_history note below for why that
 * distinction mattered):
 *
 *  - Momentum / streak / xp / momentum trend: lib/scorecard.ts's
 *    getFounderScorecard() — the documented single source of truth, same
 *    one /reports and app/insights/page.tsx already call.
 *  - Real execution line (sparkline): the STANDALONE `score_history` table
 *    (user_id, score, recorded_at), NOT founder_context.score_history
 *    (jsonb). An earlier draft of this route used the jsonb column,
 *    matching app/api/user/score-history/route.ts's GET handler — but
 *    grepping every writer of "score_history" found two independent write
 *    paths: app/api/founder-context/task-complete/route.ts writes the
 *    standalone table automatically on every task completion, while the
 *    jsonb column only gets written when a founder visits /reports or
 *    /overview (lib/scoring/index.ts's syncScoreHistory(), client-
 *    triggered). The jsonb column is sparse in practice (confirmed: only 1
 *    founder account had any jsonb score_history at all) while the
 *    standalone table is populated automatically. This route reads the
 *    standalone table for that reason. NOT independently SQL-confirmed to
 *    have exactly the columns assumed (user_id, score, recorded_at) —
 *    that's taken from the writer's own upsert call, not a live schema
 *    check; flagged as a follow-up query, not asserted as verified.
 *  - Ghost/target line: weekly_goals (target_score, tasks_done, etc.),
 *    keyed by project_id + week_start — same table/shape as
 *    app/api/weekly-goal/route.ts. Requires a project_id; when the founder
 *    has no active project selected, the ghost line is simply omitted
 *    (not faked).
 *  - Milestone pacing: lib/milestonePacing.ts over milestones.target_date/
 *    status/created_at + tasks under each milestone. Real inputs, new pure
 *    math (nothing else computes this).
 *  - Founder Archetype: read-only from founder_memory.personality_tags
 *    (the "archetype:<value>" tag lib/founderArchetype.ts already writes).
 *    NEVER reclassified here — that would corrupt the slow-forming signal
 *    Patterns/coaching prompts depend on.
 *  - Un-ghosted items: founder_memory.avoidance_zones cross-referenced
 *    against this week's completed task titles. Named "un-ghosted" (not
 *    "Ghost Goals Caught") specifically to avoid colliding with
 *    components/GhostGoalBanner.tsx's different, already-shipped "Ghost
 *    Goal" feature (a single weekly score/task target on the Today page).
 *  - Day-of-week completion, confidence-by-outcome, override reasons: same
 *    queries app/insights/page.tsx already runs (reflections, action_logs),
 *    scoped to 7 days instead of 30 — this week's slice of the same
 *    Patterns computation, not a new pipeline. NOTE: `action_logs` does not
 *    appear in supabase/schema-idempotent.sql at all; app/insights/page.tsx
 *    queries it directly and is presumably live against an uncommitted
 *    migration (the repo has documented this drift pattern before). This
 *    route mirrors that page's query rather than assuming a schema I
 *    haven't verified — if action_logs doesn't exist live, this degrades
 *    to empty arrays, not an error.
 *  - Backlog clearance: tasks.created_at/status/updated_at only — no
 *    "accepted" outcome value exists anywhere in the committed schema, so
 *    that concept (from a first-draft grading idea) was dropped in favor
 *    of this, which uses only confirmed columns.
 *
 * Deliberately a separate endpoint from app/api/ai/weekly-report/route.ts
 * (the /reports export/reporting surface) — different product surface,
 * must keep working unmodified.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModelJSON, hasAIProvider } from "@/lib/ai-providers";
import { getFounderScorecard } from "@/lib/scorecard";
import { computeMilestonePacing, type MilestonePacingResult } from "@/lib/milestonePacing";
import { computeWeeklyGrades, type GradedDimension } from "@/lib/patternGrading";

export const maxDuration = 30;

interface SparklinePoint { date: string; real: number | null; ghost: number | null; }

interface WeeklyPulseResponse {
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
  archetype: string | null;       // read-only, e.g. "validation-avoider" — never set here
  day_of_week: Record<string, { completed: number; total: number }>;
  confidence_by_outcome: Record<string, number>;
  top_override_reason: string | null;
  weekly_goal: { goal_text: string; target_score: number; current_score: number; target_tasks: number; tasks_done: number; status: string } | null;
  sparkline: SparklinePoint[];    // real vs ghost, for the two-line chart
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const projectId: string | undefined =
      typeof body?.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoIso = weekAgo.toISOString();
    const weekStart = weekStartMonday(now);

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
      overrideLogsResult,
    ] = await Promise.allSettled([
      getFounderScorecard(user.id),
      // FIX: originally read founder_context.score_history (jsonb). Confirmed
      // via grep that TWO independent write paths exist for "daily score":
      //   1. app/api/founder-context/task-complete/route.ts writes to the
      //      STANDALONE `score_history` table, automatically, on every task
      //      completion server-side.
      //   2. app/api/user/score-history/route.ts (POST) writes to
      //      founder_context.score_history (jsonb) — but only ever gets
      //      called by lib/scoring/index.ts's syncScoreHistory(), which is
      //      only triggered client-side when a founder visits /reports or
      //      /overview. Not automatic, not reliable.
      // This is why the founder's SQL check showed only 1 founder with any
      // jsonb score_history at all. Reading the standalone table instead —
      // same concept, but the source that's actually populated in practice.
      // NOT YET independently confirmed via SQL that this table has the
      // exact columns assumed below (user_id, score, recorded_at) — that's
      // taken from task-complete/route.ts's own upsert call, not a live
      // schema check. Flagged to the founder as a follow-up query.
      admin.from("score_history").select("score, recorded_at").eq("user_id", user.id).gte("recorded_at", weekAgoIso).order("recorded_at", { ascending: true }),
      admin.from("founder_memory").select("avoidance_zones, personality_tags, insight_history").eq("user_id", user.id).maybeSingle(),
      admin.from("tasks").select("id, title, status, milestone_id, created_at, updated_at").eq("user_id", user.id).gte("updated_at", weekAgoIso),
      // Backlog: tasks that existed before this week (for Backlog Clearance grading).
      admin.from("tasks").select("id, status, updated_at").eq("user_id", user.id).lt("created_at", weekAgoIso),
      (() => {
        let q = admin.from("milestones").select("id, title, target_date, status, created_at, project_id").eq("user_id", user.id).neq("status", "abandoned");
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })(),
      projectId
        ? admin.from("weekly_goals").select("*").eq("project_id", projectId).eq("week_start", weekStart).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.from("reflections").select("confidence, outcome, created_at").eq("user_id", user.id).gte("created_at", weekAgoIso),
      // Best-effort: action_logs isn't in the committed schema (see header note).
      // If it doesn't exist live, this rejects and we fall back to empty below.
      // FIX: previously selected `outcome_note`, which the founder's SQL
      // check (information_schema.columns) confirms does NOT exist on
      // action_logs — only outcome/created_at/user_id came back. Selecting
      // a nonexistent column fails the whole PostgREST query, which meant
      // this Promise was rejecting entirely and silently zeroing out
      // day-of-week data too, not just the override-reason feature. Fixed
      // to select only confirmed columns; override-reason tracking is
      // removed below until a real text field for it is confirmed to exist.
      admin.from("action_logs").select("outcome, created_at").eq("user_id", user.id).gte("created_at", weekAgoIso),
      // FIX: same correction as app/insights/page.tsx — the real override-
      // reason data lives in reflexion_learning_log.outcome_note (written
      // by lib/learning.ts's recordActionOutcome), not action_logs.
      admin.from("reflexion_learning_log").select("outcome_note").eq("user_id", user.id)
        .eq("outcome", "overridden").not("outcome_note", "is", null).gte("created_at", weekAgoIso),
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
    const weekTasks = weekTasksResult.status === "fulfilled" ? (weekTasksResult.value.data ?? []) : [];
    const backlogTasks = backlogTasksResult.status === "fulfilled" ? (backlogTasksResult.value.data ?? []) : [];
    const milestoneRows = milestonesResult.status === "fulfilled" ? (milestonesResult.value.data ?? []) : [];
    const weeklyGoalRow = weeklyGoalResult.status === "fulfilled" ? (weeklyGoalResult.value as { data: any })?.data ?? null : null;
    const reflections = reflectionsResult.status === "fulfilled" ? (reflectionsResult.value.data ?? []) : [];
    const actionLogs = actionLogsResult.status === "fulfilled" ? (actionLogsResult.value.data ?? []) : [];
    const overrideLogs = overrideLogsResult.status === "fulfilled" ? (overrideLogsResult.value.data ?? []) : [];

    // ── Core task stats (real, from the tasks table) ──────────────────────
    const tasksCompleted = weekTasks.filter((t) => t.status === "completed").length;
    const tasksTotal = weekTasks.length;
    const completionRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
    const activeDaySet = new Set(
      weekTasks.filter((t) => t.status === "completed").map((t) => (t.updated_at ?? "").slice(0, 10)),
    );
    const activeDays = activeDaySet.size;

    // ── Backlog clearance (real, from the same tasks table) ───────────────
    const backlogStillOpenOrClearedThisWeek = backlogTasks.filter(
      (t) => t.status !== "completed" || (t.updated_at ?? "") >= weekAgoIso,
    );
    const backlogTotal = backlogStillOpenOrClearedThisWeek.length;
    const backlogCleared = backlogStillOpenOrClearedThisWeek.filter(
      (t) => t.status === "completed" && (t.updated_at ?? "") >= weekAgoIso,
    ).length;

    // ── Momentum / streak (borrowed from lib/scorecard.ts, not recomputed) ─
    const momentumScore = scorecard?.momentum ?? 50;
    const momentumDelta = scorecard?.momentumDelta ?? null;
    const streak = scorecard?.streak ?? 0;

    // ── Founder Archetype (read-only — never classified here) ─────────────
    const personalityTags: string[] = Array.isArray(memory?.personality_tags) ? memory.personality_tags : [];
    const archetypeTag = personalityTags.find((t) => t.startsWith("archetype:"));
    const archetype = archetypeTag && archetypeTag !== "archetype:unclassified"
      ? archetypeTag.replace("archetype:", "")
      : null;

    // ── Un-ghosted this week (avoidance_zones cross-ref, borrowed data) ────
    const avoidanceZones: string[] = Array.isArray(memory?.avoidance_zones) ? memory.avoidance_zones : [];
    const completedTitles = weekTasks.filter((t) => t.status === "completed").map((t) => (t.title ?? "").toLowerCase());
    const unGhosted = avoidanceZones.filter((zone) =>
      completedTitles.some((title) => title.includes(zone.toLowerCase()) || zone.toLowerCase().includes(title)),
    );

    // ── Milestone pacing (real inputs, new deterministic math) ─────────────
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
    const milestones = milestoneRows
      .filter((m) => m.status !== "completed")
      .map((m) => {
        const counts = taskCountsByMilestone.get(m.id) ?? { total: 0, completed: 0 };
        return computeMilestonePacing({
          id: m.id, title: m.title, targetDate: m.target_date, createdAt: m.created_at,
          status: m.status, tasksTotal: counts.total, tasksCompleted: counts.completed,
        });
      })
      .sort((a, b) => ({ high: 0, medium: 1, low: 2, unknown: 3 }[a.risk] - { high: 0, medium: 1, low: 2, unknown: 3 }[b.risk]))
      .slice(0, 4);

    // ── Day-of-week completion + confidence-by-outcome + override reasons
    //    (same computation app/insights/page.tsx runs, scoped to 7 days) ────
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

    // Override-reason tracking — now sourced from reflexion_learning_log
    // (the real, working table, confirmed via lib/learning.ts's
    // recordActionOutcome), not action_logs (which never had this data).
    const overrideReasonCounts: Record<string, number> = {};
    for (const log of overrideLogs as Array<{ outcome_note?: string | null }>) {
      if (log.outcome_note) overrideReasonCounts[log.outcome_note] = (overrideReasonCounts[log.outcome_note] ?? 0) + 1;
    }
    const topOverrideReason: string | null =
      Object.entries(overrideReasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // ── Weekly goal / ghost line (borrowed, real, project-scoped) ──────────
    const weeklyGoal = weeklyGoalRow
      ? {
          goal_text: weeklyGoalRow.goal_text, target_score: weeklyGoalRow.target_score,
          current_score: weeklyGoalRow.current_score, target_tasks: weeklyGoalRow.target_tasks,
          tasks_done: weeklyGoalRow.tasks_done, status: weeklyGoalRow.status,
        }
      : null;

    // ── Sparkline: real line from score_history, ghost line linearly
    //    interpolated across the week toward target_score (only when a
    //    weekly goal exists for the active project — never fabricated). ────
    const last7 = scoreHistory.slice(-7);
    const startScore = last7[0]?.score ?? momentumScore;
    const sparkline: SparklinePoint[] = last7.map((entry, i) => {
      const ghost = weeklyGoal
        ? Math.round(startScore + ((weeklyGoal.target_score - startScore) * (i / Math.max(1, last7.length - 1))))
        : null;
      return { date: entry.date, real: entry.score, ghost };
    });

    // ── Grading (deterministic, lib/patternGrading.ts) ─────────────────────
    // ── Quiet-week detection (deterministic — never let the AI decide when
    //    data is too thin to say anything trustworthy). Threshold: fewer
    //    than 3 tasks touched AND no milestones with real pacing data.
    //    Below this, grading would be mostly N/A and the story would have
    //    almost nothing real to work with — skip the AI call rather than
    //    let it strain for a "good story" out of near-empty facts. ────────
    const milestonesWithPacing = milestones.filter((m) => m.risk !== "unknown").length;
    const isQuietWeek = tasksTotal < 3 && milestonesWithPacing === 0;

    const grades = isQuietWeek ? [] : computeWeeklyGrades({
      tasksCompleted, tasksTotal, backlogTotal, backlogCleared, activeDaysThisWeek: activeDays,
      milestoneRisks: milestones.map((m) => m.risk), unGhostedCount: unGhosted.length,
      currentAvoidanceZoneCount: avoidanceZones.length,
    });

    // ── Story synthesis — every number is a hard fact the model restates,
    //    never estimates. Archetype given as read-only tone context, not a
    //    fact to restate as new. ───────────────────────────────────────────
    let story: string;
    if (isQuietWeek) {
      // Deterministic, honest quiet-week copy — no AI call, nothing to
      // strain for out of near-empty facts. Acknowledges the lull without
      // implying failure, and gives one clear next step rather than a page
      // full of N/A grades.
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

    // ── Persist into founder_memory.insight_history (existing append-log,
    //    capped at 10 entries there) — makes this week feed longer-run
    //    founder context, same mechanism Patterns/coaching prompts read. ────
    if (story.length >= 20 && story.length <= 500) {
      try {
        const existingHistory = Array.isArray(memory?.insight_history) ? memory.insight_history : [];
        const history = [{ text: story, created_at: new Date().toISOString() }, ...existingHistory].slice(0, 10);
        await admin.from("founder_memory").upsert(
          { user_id: user.id, insight_history: history, last_insight: story, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      } catch { /* non-fatal */ }
    }

    const response: WeeklyPulseResponse = {
      is_quiet_week: isQuietWeek,
      momentum_score: momentumScore, momentum_delta: momentumDelta, streak,
      tasks_completed: tasksCompleted, tasks_total: tasksTotal, completion_rate: completionRate,
      active_days: activeDays, un_ghosted: unGhosted, milestones, archetype,
      day_of_week: dayOfWeek, confidence_by_outcome: confidenceByOutcome, top_override_reason: topOverrideReason,
      weekly_goal: weeklyGoal, sparkline, grades, story, generated_at: new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, data: response });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "weekly_pulse_failed" }, { status: 500 });
  }
}

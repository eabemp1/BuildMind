/**
 * lib/data/reports.ts
 *
 * Report and dashboard metrics queries — extracted from lib/data/projects.ts
 * to bring that file below 600 lines.
 *
 * Exports:
 *   getWeeklyReportMetrics
 *   getDashboardOverview
 *   calculateDashboardStats
 */

"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser, getProjectSummaries } from "@/lib/data/projects";
import { computeStartupScore } from "@/lib/scoring";
import type { BuildMindProject, DashboardOverview, WeeklyReportMetrics } from "@/lib/buildmind.types";

const REPORT_COLORS = [
  "var(--bm-accent)",
  "#A78BFA",
  "var(--bm-amber)",
  "var(--bm-teal)",
  "var(--bm-text3)",
];

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function dayIndexFromIso(iso: string) {
  return (new Date(iso).getDay() + 6) % 7;
}

export async function getWeeklyReportMetrics(activeProjectId?: string): Promise<WeeklyReportMetrics> {
  const user = await getCurrentUser();
  const empty: WeeklyReportMetrics = {
    score: 0,
    previousScore: 0,
    weeklyScores: [0, 0, 0, 0, 0, 0, 0],
    taskData: [0, 0, 0, 0, 0, 0, 0],
    tasksCompletedThisWeek: 0,
    tasksCompletedPreviousWeek: 0,
    activeStreakDays: 0,
    momentumScore: null,
    focusData: [],
    wins: [],
    nextFocus: [],
    intention_vs_execution_rate: null,
    previous_intention_vs_execution_rate: null,
    execution_trend: "flat",
    avoidance_pattern: null,
  };
  if (!user) return empty;

  const supabase = createClient();
  let founderContextRow: { streak?: number | null; momentum_score?: number | null } | null = null;
  try {
    const { data } = await supabase
      .from("founder_context")
      .select("streak, momentum_score")
      .eq("user_id", user.id)
      .maybeSingle();
    founderContextRow = data;
  } catch { /* non-fatal */ }
  const serverMomentumScore: number | null =
    typeof founderContextRow?.momentum_score === "number"
      ? founderContextRow.momentum_score
      : null;

  let scoreHistoryRows: Array<{ score: number; recorded_at: string }> = [];
  try {
    const { data } = await supabase
      .from("score_history")
      .select("score, recorded_at")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(7);
    scoreHistoryRows = data ?? [];
  } catch { /* non-fatal */ }
  // If score_history table has no rows, fall back to the JSONB column in founder_context
  if (scoreHistoryRows.length === 0 && founderContextRow) {
    try {
      const { data: jsonbCtx } = await supabase
        .from("founder_context")
        .select("score_history")
        .eq("user_id", user.id)
        .maybeSingle();
      const jsonbHistory = (jsonbCtx as { score_history?: Array<{ date: string; score: number }> } | null)
        ?.score_history ?? [];
      if (jsonbHistory.length > 0) {
        scoreHistoryRows = jsonbHistory.map((entry) => ({
          score: entry.score,
          recorded_at: entry.date,
        }));
      }
    } catch { /* non-fatal */ }
  }

  const allSummaries = await getProjectSummaries();
  const summaries = activeProjectId
    ? allSummaries.filter((project) => project.id === activeProjectId)
    : allSummaries;
  if (!summaries.length) return empty;

  const projectIds = summaries.map((p) => p.id);
  const score = Math.round(
    summaries.reduce((sum, project) => sum + computeStartupScore(project), 0) / summaries.length,
  );

  // Batch project IDs to avoid URL length limits
  let allMilestones: Array<{ id: string; project_id: string; title: string; is_completed?: boolean; updated_at?: string; created_at: string }> = [];
  const BATCH_SIZE = 20;
  
  for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
    const batchIds = projectIds.slice(i, i + BATCH_SIZE);
    const milestonesQuery = supabase
      .from("milestones")
      .select("id, project_id, title, is_completed, updated_at, created_at");
    const { data: milestones } = await (batchIds.length === 1
      ? milestonesQuery.eq("project_id", batchIds[0])
      : milestonesQuery.in("project_id", batchIds));
    if (milestones) allMilestones = allMilestones.concat(milestones);
  }

  const milestoneIds = allMilestones.map((m) => m.id);
  const milestoneToProject = new Map<string, string>();
  const milestoneTitle = new Map<string, string>();
  allMilestones.forEach((m) => {
    milestoneToProject.set(m.id, m.project_id);
    milestoneTitle.set(m.id, m.title);
  });

  // Batch milestone IDs to avoid URL length limits
  let allTasks: Array<{ id: string; title: string; milestone_id: string; is_completed: boolean; created_at: string; updated_at: string }> = [];
  
  if (milestoneIds.length > 0) {
    for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
      const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
      const tasksQuery = supabase
        .from("tasks")
        .select("id, title, milestone_id, is_completed, created_at, updated_at");
      const { data: tasks } = await (batchIds.length === 1
        ? tasksQuery.eq("milestone_id", batchIds[0])
        : tasksQuery.in("milestone_id", batchIds));
      if (tasks) allTasks = allTasks.concat(tasks);
    }
  }
  const { data: tasks } = { data: allTasks };

  const start = weekStart();
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - 7);

  // Also count completions from reflexion_learning_log (today-page check-ins).
  // This is the primary way founders log "done" — it doesn't always map 1:1
  // to a task row, so we count it as a separate signal and merge.
  let reflexionRows: Array<{ action_shown?: string | null; outcome_recorded_at?: string | null }> = [];
  let reflexionCompletedTitles: string[] = [];
  try {
    let reflexionQuery = supabase
      .from("reflexion_learning_log")
      .select("action_shown, outcome_recorded_at")
      .eq("outcome", "completed")
      .gte("outcome_recorded_at", previousStart.toISOString());
    if (activeProjectId) reflexionQuery = reflexionQuery.eq("project_id", activeProjectId);
    const { data } = await reflexionQuery;
    reflexionRows = data ?? [];
    reflexionCompletedTitles = reflexionRows
      .map((row) => row.action_shown)
      .filter((title): title is string => Boolean(title))
      .slice(0, 3);
  } catch { /* non-fatal — table may not exist in all envs */ }

  const taskData = [0, 0, 0, 0, 0, 0, 0];
  let tasksCompletedPreviousWeek = 0;
  const completedDates = new Set<string>();
  const focusCounts = new Map<string, number>();
  const reflexionCompletionsByDay: number[] = [0, 0, 0, 0, 0, 0, 0];

  (tasks ?? []).forEach((task) => {
    if (!task.is_completed) return;
    const completedAt = task.updated_at ?? task.created_at;
    const completedDate = new Date(completedAt);
    const projectId = milestoneToProject.get(task.milestone_id);
    const project = summaries.find((s) => s.id === projectId);
    const focusLabel = project?.startup_stage ?? milestoneTitle.get(task.milestone_id) ?? "Execution";
    focusCounts.set(focusLabel, (focusCounts.get(focusLabel) ?? 0) + 1);
    completedDates.add(completedDate.toLocaleDateString("en-CA"));

    if (completedDate >= start) taskData[dayIndexFromIso(completedAt)] += 1;
    if (completedDate >= previousStart && completedDate < start) tasksCompletedPreviousWeek += 1;
  });

  reflexionRows.forEach((row) => {
    if (!row.outcome_recorded_at) return;
    const completedDate = new Date(row.outcome_recorded_at);
    if (completedDate >= start) {
      reflexionCompletionsByDay[dayIndexFromIso(row.outcome_recorded_at)] += 1;
    }
    if (completedDate >= previousStart && completedDate < start) {
      tasksCompletedPreviousWeek += 1;
    }
    completedDates.add(completedDate.toLocaleDateString("en-CA"));
  });

  reflexionCompletionsByDay.forEach((count, i) => {
    taskData[i] += count;
  });

  // Also get reflection dates for the chart — these represent actual active days.
  try {
    const weekAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekReflections } = await supabase
      .from("reflections")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", weekAgoDate);

    (weekReflections ?? []).forEach((r) => {
      const dayIdx = dayIndexFromIso(r.created_at);
      if (dayIdx >= 0 && dayIdx < 7) {
        taskData[dayIdx] = Math.max(taskData[dayIdx] ?? 0, 1);
      }
    });
  } catch {
    // Non-fatal: reports still render from task rows.
  }

  let computedStreakFromDates = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (completedDates.has(d.toLocaleDateString("en-CA"))) computedStreakFromDates += 1;
    else if (i > 0) break;
  }
  const dbStreak = typeof founderContextRow?.streak === "number" ? founderContextRow.streak : 0;
  const activeStreakDays = Math.max(dbStreak, computedStreakFromDates);

  const tasksCompletedThisWeek = taskData.reduce((sum, count) => sum + count, 0);
  const milestonesCompletedThisWeek = (allMilestones ?? []).filter((m) => {
    if (!m.is_completed) return false;
    const completedAt = new Date(m.updated_at ?? m.created_at);
    return completedAt >= start;
  }).length;
  const previousScore = Math.max(0, score - tasksCompletedThisWeek - milestonesCompletedThisWeek * 2);
  const historyByDate = new Map<string, number>();
  scoreHistoryRows.forEach((row) => {
    const dateKey = new Date(row.recorded_at).toLocaleDateString("en-CA");
    if (!historyByDate.has(dateKey)) {
      historyByDate.set(dateKey, row.score);
    }
  });

  const weeklyScores: number[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toLocaleDateString("en-CA");
    return historyByDate.get(key) ?? (i === 6 ? score : previousScore);
  });

  const focusData = Array.from(focusCounts.entries()).map(([label, value], index) => ({
    label,
    value,
    color: REPORT_COLORS[index % REPORT_COLORS.length],
  }));

  // Use real completed task titles instead of just counts.
  const completedTaskTitles = (tasks ?? [])
    .filter((task) => {
      if (!task.is_completed) return false;
      const completedAt = new Date(task.updated_at ?? task.created_at);
      return completedAt >= start;
    })
    .map((task) => task.title)
    .filter(Boolean)
    .slice(0, 3);

  const realCompletedTitles = [...completedTaskTitles, ...reflexionCompletedTitles]
    .filter(Boolean)
    .slice(0, 3);

  const wins = [
    ...realCompletedTitles,
    realCompletedTitles.length === 0 && tasksCompletedThisWeek > 0
      ? `Completed ${tasksCompletedThisWeek} action${tasksCompletedThisWeek !== 1 ? "s" : ""} this week`
      : null,
    milestonesCompletedThisWeek > 0
      ? `Closed ${milestonesCompletedThisWeek} milestone${milestonesCompletedThisWeek !== 1 ? "s" : ""}`
      : null,
    activeStreakDays > 0 ? `${activeStreakDays}-day streak` : null,
    score > previousScore ? `Score up ${score - previousScore} pts` : null,
  ].filter(Boolean) as string[];

  const nextFocus = (tasks ?? [])
    .filter((task) => !task.is_completed)
    .slice(0, 3)
    .map((task) => task.title || "Complete the next project task");

  // ── Intention vs execution rate ─────────────────────────────────────────
  // Total tasks shown (created) this week vs completed this week
  const totalTasksCreatedThisWeek = (tasks ?? []).filter((task) => {
    const created = new Date(task.created_at);
    return created >= start;
  }).length;
  const intention_vs_execution_rate =
    totalTasksCreatedThisWeek > 0
      ? Math.round((tasksCompletedThisWeek / totalTasksCreatedThisWeek) * 100)
      : null;

  // Previous week rate for trend
  const totalTasksCreatedPrevWeek = (tasks ?? []).filter((task) => {
    const created = new Date(task.created_at);
    return created >= previousStart && created < start;
  }).length;
  const previous_intention_vs_execution_rate =
    totalTasksCreatedPrevWeek > 0
      ? Math.round((tasksCompletedPreviousWeek / totalTasksCreatedPrevWeek) * 100)
      : null;

  const execution_trend: "up" | "down" | "flat" =
    intention_vs_execution_rate != null && previous_intention_vs_execution_rate != null
      ? intention_vs_execution_rate > previous_intention_vs_execution_rate + 5
        ? "up"
        : intention_vs_execution_rate < previous_intention_vs_execution_rate - 5
        ? "down"
        : "flat"
      : "flat";

  // Avoidance pattern: detect if a stage type dominates incomplete tasks
  const incompleteByStage = new Map<string, number>();
  (tasks ?? []).filter((t) => !t.is_completed).forEach((t) => {
    const projectId = milestoneToProject.get(t.milestone_id);
    const project = summaries.find((s) => s.id === projectId);
    const stage = project?.startup_stage ?? "unknown";
    incompleteByStage.set(stage, (incompleteByStage.get(stage) ?? 0) + 1);
  });
  const topIncompleteStage = Array.from(incompleteByStage.entries()).sort((a, b) => b[1] - a[1])[0];
  const avoidance_pattern =
    topIncompleteStage && topIncompleteStage[1] >= 3
      ? `${topIncompleteStage[1]} incomplete ${topIncompleteStage[0]}-stage tasks`
      : null;

  return {
    score, previousScore, weeklyScores, taskData,
    tasksCompletedThisWeek, tasksCompletedPreviousWeek,
    activeStreakDays, momentumScore: serverMomentumScore,
    focusData, wins, nextFocus,
    intention_vs_execution_rate,
    previous_intention_vs_execution_rate,
    execution_trend,
    avoidance_pattern,
  };
}

export async function getDashboardOverview(activeProjectId?: string): Promise<DashboardOverview> {
  const user = await getCurrentUser();
  if (!user)
    return { activeProjects: 0, completedTasks: 0, milestonesCompleted: 0, aiUsage: 0, recentActivity: [], founderStreakDays: 0 };
  const supabase = createClient();

  let projectsQuery = supabase
    .from("projects")
    .select("id, description, startup_stage, target_users")
    .eq("user_id", user.id);
  if (activeProjectId) projectsQuery = projectsQuery.eq("id", activeProjectId);
  const { data: projects } = await projectsQuery;
  const projectIds = (projects ?? []).map((p) => p.id);

  // Batch project IDs to avoid URL length limits
  let allMilestones: Array<{ id: string; project_id: string; status: string }> = [];
  const BATCH_SIZE = 20;
  
  if (projectIds.length > 0) {
    for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
      const batchIds = projectIds.slice(i, i + BATCH_SIZE);
      const milestonesQuery = supabase.from("milestones").select("id, project_id, status");
      const { data: milestones } = await (batchIds.length === 1
        ? milestonesQuery.eq("project_id", batchIds[0])
        : milestonesQuery.in("project_id", batchIds));
      if (milestones) allMilestones = allMilestones.concat(milestones);
    }
  }
  const { data: milestones } = { data: allMilestones };

  const milestoneIds = (milestones ?? []).map((m) => m.id);
  
  // Batch milestone IDs to avoid URL length limits
  let allTasks: Array<{ id: string; milestone_id: string; is_completed: boolean; created_at: string; updated_at: string }> = [];
  
  if (milestoneIds.length > 0) {
    for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
      const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
      const tasksQuery = supabase.from("tasks").select("id, milestone_id, is_completed, created_at, updated_at");
      const { data: tasks } = await (batchIds.length === 1
        ? tasksQuery.eq("milestone_id", batchIds[0])
        : tasksQuery.in("milestone_id", batchIds));
      if (tasks) allTasks = allTasks.concat(tasks);
    }
  }
  const { data: tasks } = { data: allTasks };

  const toLocalDateStr = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
  const projectCompletedTasks = (tasks ?? []).filter((t) => t.is_completed).length;
  let todayCompletedTasks = 0;
  let todayCompletedDates: string[] = [];
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    let learningQuery = supabase
      .from("reflexion_learning_log")
      .select("outcome_recorded_at")
      .eq("user_id", user.id)
      .eq("outcome", "completed")
      .gte("outcome_recorded_at", fourteenDaysAgo);
    if (activeProjectId) learningQuery = learningQuery.eq("project_id", activeProjectId);
    const { data: learningRows } = await learningQuery;

    let reflectionsQuery = supabase
      .from("reflections")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo);
    const { data: completedReflections } = await reflectionsQuery;

    todayCompletedDates = [
      ...(learningRows ?? []).map((row) => row.outcome_recorded_at).filter(Boolean),
      ...(completedReflections ?? []).map((row) => row.created_at).filter(Boolean),
    ];
    todayCompletedTasks = new Set(todayCompletedDates.map((date) => toLocalDateStr(date))).size;
  } catch {
    // Non-fatal: dashboard can still render project-task counts.
  }

  const completedTasks = Math.max(projectCompletedTasks, todayCompletedTasks);
  const tasksByMilestone = new Map<string, Array<{ is_completed: boolean }>>();
  (tasks ?? []).forEach((task) => {
    const list = tasksByMilestone.get(task.milestone_id) ?? [];
    list.push(task);
    tasksByMilestone.set(task.milestone_id, list);
  });
  const completedMilestones = (milestones ?? []).filter((milestone) => {
    if (milestone.status === 'completed') return true;
    const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
    return milestoneTasks.length > 0 && milestoneTasks.every((task) => task.is_completed);
  }).length;

  const completedDates = new Set(
    [
      ...(tasks ?? [])
      .filter((t) => t.is_completed && (t.updated_at || t.created_at))
        .map((t) => toLocalDateStr(t.updated_at ?? t.created_at)),
      ...todayCompletedDates.map((date) => toLocalDateStr(date)),
    ],
  );

  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (completedDates.has(toLocalDateStr(d.toISOString()))) streak++;
    else if (i > 0) break;
  }

  // Primary query — columns that exist in all deployments
  const { data: founderContext } = await supabase
    .from("founder_context")
    .select("streak, avoidance_zones, consecutive_tasks_completed, tasks_completed_total, days_inactive")
    .eq("user_id", user.id)
    .maybeSingle();
  // Extended query — columns added by this migration; non-fatal if they don't exist yet
  let learnedPatterns: Record<string, unknown> = {};
  try {
    const { data: extCtx } = await supabase
      .from("founder_context")
      .select("learned_patterns")
      .eq("user_id", user.id)
      .maybeSingle();
    learnedPatterns = (extCtx as { learned_patterns?: Record<string, unknown> } | null)?.learned_patterns ?? {};
  } catch { /* column not yet migrated — non-fatal */ }
  const { data: founderMemory } = await supabase
    .from("founder_memory")
    .select("avoidance_zones, archetype_confidence, last_insight, archetype")
    .eq("user_id", user.id)
    .maybeSingle();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentReflections } = await supabase
    .from("reflections")
    .select("confidence, outcome, what_tried, what_happened, what_learned, created_at")
    .eq("user_id", user.id)
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(14);
  const contextRow = founderContext as { streak?: number | null; avoidance_zones?: string[] | null } | null;
  const dbStreak = contextRow?.streak;
  const serverStreak = Math.max(
    typeof dbStreak === "number" ? dbStreak : 0,
    streak,
  );

  const today = new Date().toLocaleDateString("en-CA");
  const { data: behaviorRows } = await supabase
    .from("user_behavior_state")
    .select("key, value")
    .eq("user_id", user.id)
    .in("key", ["checkin_done_date", "reflect_done_date"]);
  const behavior = Object.fromEntries((behaviorRows ?? []).map((row) => [row.key, row.value])) as {
    checkin_done_date?: string;
    reflect_done_date?: string;
  };
  const todayDone = behavior.checkin_done_date === today;
  const reflectionDoneToday = behavior.reflect_done_date === today;

  let daysSinceLastReflection: number | null = null;
  const { data: lastReflection } = await supabase
    .from("reflections")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastReflection?.created_at) {
    daysSinceLastReflection = Math.floor(
      (Date.now() - new Date(lastReflection.created_at).getTime()) / 86400000,
    );
  }

  // ── Cadence Score (0–100) ─────────────────────────────────────────────────
  // Measures execution quality over the last 14 days.
  // Every signal is time-gated — going inactive drops the score.
  // Profile completeness is NOT rewarded here; only behaviour counts.

  const contextData = contextRow as {
    streak?: number | null;
    avoidance_zones?: string[] | null;
    consecutive_tasks_completed?: number | null;
    tasks_completed_total?: number | null;
    days_inactive?: number | null;
  } | null;

  // Signal 1 — Active days in last 14 (max 30pts)
  // Count unique days that have a reflection in the last 14 days.
  // Uses recentReflections already fetched above.
  const activeDaysLast14 = new Set(
    (recentReflections ?? []).map((r) =>
      new Date(r.created_at).toLocaleDateString("en-CA")
    )
  ).size;
  const activeDaysScore = Math.round((Math.min(activeDaysLast14, 7) / 7) * 30);

  // Signal 2 — Reflection depth in last 14 days (max 25pts)
  // A reflection with what_tried + what_happened filled = deep (2pts each)
  // A reflection with just a note = shallow (1pt each)
  // Max 25pts across all recent reflections.
  const reflectionDepthScore = Math.min(25, (recentReflections ?? []).reduce((sum, r) => {
    const hasDeepFields = (r.what_tried && r.what_tried.trim().length > 10) ||
                          (r.what_happened && r.what_happened.trim().length > 10);
    return sum + (hasDeepFields ? 2 : 1);
  }, 0));

  // Signal 3 — Average confidence in last 14 days (max 20pts)
  // Confidence 1-5 from today-page check-ins. Avg >= 3.5 = full points.
  const confidenceValues = (recentReflections ?? [])
    .map((r) => r.confidence)
    .filter((c): c is number => typeof c === "number" && c > 0);
  const avgConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0;
  const confidenceScore = confidenceValues.length > 0
    ? Math.round((Math.min(avgConfidence, 5) / 5) * 20)
    : 0;

  // Signal 4 — Behavioural patterns detected (max 15pts)
  // founder_memory.avoidance_zones = BuildMind has enough data to identify patterns
  // founder_memory.archetype set = deep enough behavioural model exists
  // founder_context.learned_patterns non-empty = learning loop has fired
  const memoryData = founderMemory as {
    avoidance_zones?: string[] | null;
    archetype_confidence?: number | null;
    last_insight?: string | null;
    archetype?: string | null;
  } | null;
  const hasAvoidanceZones = (memoryData?.avoidance_zones?.length ?? 0) > 0;
  const hasArchetype = !!(memoryData?.archetype && memoryData.archetype.trim().length > 0);
  const hasLearnedPatterns = !!(
    learnedPatterns &&
    typeof learnedPatterns === "object" &&
    Object.keys(learnedPatterns).length > 0
  );
  const patternScore =
    (hasAvoidanceZones ? 6 : 0) +
    (hasArchetype ? 5 : 0) +
    (hasLearnedPatterns ? 4 : 0);

  // Signal 5 — Inactivity penalty (subtracts up to 20pts)
  // days_inactive > 3 starts reducing the score.
  // This is the critical signal: the score decays when you go quiet.
  const daysInactive = contextData?.days_inactive ?? 0;
  const inactivityPenalty = daysInactive <= 3
    ? 0
    : daysInactive <= 7
    ? 10
    : daysInactive <= 14
    ? 20
    : 30; // Can push below 0, clamped at end

  const cadenceScore = Math.min(100, Math.max(0,
    activeDaysScore + reflectionDepthScore + confidenceScore + patternScore - inactivityPenalty
  ));

  const { data: notifications } = await supabase
    .from("notifications").select("message").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(5);

  return {
    activeProjects: projectIds.length, completedTasks, milestonesCompleted: completedMilestones,
    aiUsage: 0,
    recentActivity: (notifications ?? []).map((n) => n.message),
    founderStreakDays: serverStreak,
    avoidanceZones: contextRow?.avoidance_zones ?? [],
    aiAdviceQuality: cadenceScore,
    todayDone,
    reflectionDoneToday,
    daysSinceLastReflection,
  };
}

export function calculateDashboardStats(projects: BuildMindProject[]) {
  const activeProjects = projects.length;
  return {
    activeProjects,
    startupScoreAvg: activeProjects
      ? Math.round(projects.reduce((sum, p) => sum + computeStartupScore(p), 0) / activeProjects)
      : 0,
    aiUsage: activeProjects ? "Active" : "Getting started",
  };
}

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

export async function getWeeklyReportMetrics(): Promise<WeeklyReportMetrics> {
  const user = await getCurrentUser();
  const empty: WeeklyReportMetrics = {
    score: 0,
    previousScore: 0,
    weeklyScores: [0, 0, 0, 0, 0, 0, 0],
    taskData: [0, 0, 0, 0, 0, 0, 0],
    tasksCompletedThisWeek: 0,
    tasksCompletedPreviousWeek: 0,
    activeStreakDays: 0,
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
  const summaries = await getProjectSummaries();
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

  // Also count completions from reflexion_learning_log (today-page check-ins).
  // This is the primary way founders log "done" — it doesn't always map 1:1
  // to a task row, so we count it as a separate signal and merge.
  let reflexionCompletionsThisWeek = 0;
  try {
    const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: reflexionRows } = await supabase
      .from("reflexion_learning_log")
      .select("outcome_recorded_at")
      .eq("outcome", "completed")
      .gte("outcome_recorded_at", weekAgoISO);
    reflexionCompletionsThisWeek = (reflexionRows ?? []).length;
  } catch { /* non-fatal — table may not exist in all envs */ }

  const start = weekStart();
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - 7);
  const taskData = [0, 0, 0, 0, 0, 0, 0];
  let tasksCompletedPreviousWeek = 0;
  const completedDates = new Set<string>();
  const focusCounts = new Map<string, number>();

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

  let activeStreakDays = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (completedDates.has(d.toLocaleDateString("en-CA"))) activeStreakDays += 1;
    else if (i > 0) break;
  }

  // Merge task completions (from project tasks) with reflexion log completions (from today page).
  // Use whichever is higher — they may overlap for users who complete tasks in both places.
  const tasksCompletedThisWeek = Math.max(
    taskData.reduce((sum, count) => sum + count, 0),
    reflexionCompletionsThisWeek,
  );
  const milestonesCompletedThisWeek = (allMilestones ?? []).filter((m) => {
    if (!m.is_completed) return false;
    const completedAt = new Date(m.updated_at ?? m.created_at);
    return completedAt >= start;
  }).length;
  const previousScore = Math.max(0, score - tasksCompletedThisWeek - milestonesCompletedThisWeek * 2);
  const weeklyScores = taskData.reduce<number[]>((scores, count, index) => {
    const base = index === 0 ? previousScore : scores[index - 1];
    scores.push(Math.min(100, base + count + (index === 6 ? milestonesCompletedThisWeek * 2 : 0)));
    return scores;
  }, []);

  const focusData = Array.from(focusCounts.entries()).map(([label, value], index) => ({
    label,
    value,
    color: REPORT_COLORS[index % REPORT_COLORS.length],
  }));

  const wins = [
    tasksCompletedThisWeek > 0 ? `Completed ${tasksCompletedThisWeek} task${tasksCompletedThisWeek === 1 ? "" : "s"}` : null,
    milestonesCompletedThisWeek > 0 ? `Completed ${milestonesCompletedThisWeek} milestone${milestonesCompletedThisWeek === 1 ? "" : "s"}` : null,
    activeStreakDays > 0 ? `${activeStreakDays}-day activity streak` : null,
    score > previousScore ? `Startup score up by ${score - previousScore}` : null,
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
    activeStreakDays, focusData, wins, nextFocus,
    intention_vs_execution_rate,
    previous_intention_vs_execution_rate,
    execution_trend,
    avoidance_pattern,
  };
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const user = await getCurrentUser();
  if (!user)
    return { activeProjects: 0, completedTasks: 0, milestonesCompleted: 0, aiUsage: 0, recentActivity: [], founderStreakDays: 0 };
  const supabase = createClient();

  const { data: projects } = await supabase
    .from("projects").select("id").eq("user_id", user.id);
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

  const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;
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

  const toLocalDateStr = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
  const completedDates = new Set(
    (tasks ?? [])
      .filter((t) => t.is_completed && (t.updated_at || t.created_at))
      .map((t) => toLocalDateStr(t.updated_at ?? t.created_at)),
  );

  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (completedDates.has(toLocalDateStr(d.toISOString()))) streak++;
    else if (i > 0) break;
  }

  const { data: founderContext } = await supabase
    .from("founder_context")
    .select("streak")
    .eq("user_id", user.id)
    .maybeSingle();
  const serverStreak = Number(
    (founderContext as { streak?: number } | null)?.streak
      ?? streak,
  );

  const { data: notifications } = await supabase
    .from("notifications").select("message").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(5);

  return {
    activeProjects: projectIds.length, completedTasks, milestonesCompleted: completedMilestones,
    aiUsage: 0, recentActivity: (notifications ?? []).map((n) => n.message), founderStreakDays: serverStreak,
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

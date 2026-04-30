/**
 * lib/data/projects.ts
 *
 * Supabase data access for projects, milestones, and tasks.
 * Extracted from lib/buildmind.ts to separate DB I/O from business logic.
 *
 * Imported by:
 *   lib/buildmind.ts   (re-exported for backwards compatibility)
 *   app/api/ai/* routes
 */

"use client";

import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { inferStageFromMilestones } from "@/lib/stages";
import { computeStartupScore } from "@/lib/scoring";
import type {
  BuildMindProject,
  ProjectSummary,
  BuildMindMilestone,
  BuildMindTask,
  DashboardOverview,
  WeeklyReportMetrics,
} from "@/lib/buildmind.types";

export function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((v) => String(v)).filter(Boolean);
}

function isInvalidRefreshToken(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown; status?: unknown };
  return (
    maybeError.code === "refresh_token_not_found" ||
    (maybeError.status === 400 &&
      typeof maybeError.message === "string" &&
      maybeError.message.toLowerCase().includes("invalid refresh token"))
  );
}

export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isInvalidRefreshToken(error)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }
    throw error;
  }
  return data.user ?? null;
}

export async function ensureUserProfile(user: {
  id: string;
  email?: string | null;
}) {
  const supabase = createClient();
  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("id,email")
    .eq("id", user.id)
    .maybeSingle();
  if (selectError) return { id: user.id, email: user.email ?? "" };

  if (!existing) {
    const { error: insertError } = await supabase.from("users").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_completed: false,
    });
    if (insertError && insertError.code !== "23505") {
      return { id: user.id, email: user.email ?? "" };
    }
  }

  return { id: user.id, email: user.email ?? "" };
}

export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", userId)
    .single();
  if (error) {
    const { data: userData } = await supabase.auth.getUser();
    return userData.user?.user_metadata?.onboarding_completed === true;
  }
  return Boolean(data?.onboarding_completed);
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  const supabase = createClient();
  await supabase.auth.updateUser({
    data: { onboarding_completed: true },
  });
  await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", userId);
}

export async function getProjectsForCurrentUser(): Promise<BuildMindProject[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...(p as BuildMindProject),
    validation_strengths: normalizeTextArray(p.validation_strengths),
    validation_weaknesses: normalizeTextArray(p.validation_weaknesses),
    validation_suggestions: normalizeTextArray(p.validation_suggestions),
  }));
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createClient();

  let { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (projectsError) throw projectsError;
  if (!projects?.length) return [];

  const projectIds = projects.map((p) => p.id);
  const { data: milestones } = await supabase
    .from("milestones")
    .select("id, title, project_id, is_completed, order_index")
    .in("project_id", projectIds);

  const milestoneIds = (milestones ?? []).map((m) => m.id);
  const { data: tasks } = milestoneIds.length
    ? await supabase
        .from("tasks")
        .select("id, milestone_id, is_completed, created_at")
        .in("milestone_id", milestoneIds)
    : { data: [] };

  const milestoneToProject = new Map<string, string>();
  const milestoneIdToTitle = new Map<string, string>();
  (milestones ?? []).forEach((m) => {
    milestoneToProject.set(m.id, m.project_id);
    milestoneIdToTitle.set(m.id, m.title);
  });

  const stats = new Map<
    string,
    { tasksCompleted: number; tasksTotal: number; lastActivity: string }
  >();
  projects.forEach((p) =>
    stats.set(p.id, {
      tasksCompleted: 0,
      tasksTotal: 0,
      lastActivity: p.created_at,
    }),
  );

  (tasks ?? []).forEach((task) => {
    const projectId = milestoneToProject.get(task.milestone_id);
    if (!projectId) return;
    const current = stats.get(projectId)!;
    stats.set(projectId, {
      tasksCompleted: current.tasksCompleted + (task.is_completed ? 1 : 0),
      tasksTotal: current.tasksTotal + 1,
      lastActivity:
        task.created_at && task.created_at > current.lastActivity
          ? task.created_at
          : current.lastActivity,
    });
  });

  return projects.map((project) => {
    const current = stats.get(project.id) ?? {
      tasksCompleted: 0,
      tasksTotal: 0,
      lastActivity: project.created_at,
    };
    const progress = current.tasksTotal
      ? Math.round((current.tasksCompleted / current.tasksTotal) * 100)
      : 0;

    const projectMilestones = (milestones ?? []).filter(
      (m) => m.project_id === project.id,
    );
    const projectTasks = (tasks ?? []).filter(
      (t) => milestoneToProject.get(t.milestone_id) === project.id,
    );
    const computedStage = inferStageFromMilestones(
      projectMilestones,
      projectTasks.map((t) => ({
        milestone_id: t.milestone_id,
        is_completed: t.is_completed,
      })),
      milestoneIdToTitle,
    );

    const displayStage = computedStage || project.startup_stage || "Idea";
    const validationStrengths = normalizeTextArray(project.validation_strengths);

    return {
      id: project.id,
      title: project.title,
      description: project.description,
      created_at: project.created_at,
      industry: project.industry ?? null,
      startup_stage: displayStage,
      validation_score: project.validation_score ?? null,
      execution_score: project.execution_score ?? null,
      momentum_score: project.momentum_score ?? null,
      validation_strengths: validationStrengths,
      tasksCompleted: current.tasksCompleted,
      tasksTotal: current.tasksTotal,
      progress,
      lastActivity: current.lastActivity,
    };
  });
}

export async function updateProjectStage(
  projectId: string,
  stage: string,
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("projects")
    .update({ startup_stage: stage })
    .eq("id", projectId);
}

export async function getProjectDetail(projectId: string): Promise<{
  project: BuildMindProject;
  milestones: BuildMindMilestone[];
  tasks: BuildMindTask[];
}> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (projectError) throw projectError;

  const { data: milestones, error: milestoneError } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });
  if (milestoneError) throw milestoneError;

  const milestoneIds = (milestones ?? []).map((m) => m.id);
  const { data: tasks, error: tasksError } = milestoneIds.length
    ? await supabase
        .from("tasks")
        .select("*")
        .in("milestone_id", milestoneIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (tasksError) throw tasksError;

  return {
    project: {
      ...(project as BuildMindProject),
      validation_strengths: normalizeTextArray(project.validation_strengths),
      validation_weaknesses: normalizeTextArray(project.validation_weaknesses),
      validation_suggestions: normalizeTextArray(project.validation_suggestions),
    },
    milestones: (milestones ?? []) as BuildMindMilestone[],
    tasks: (tasks ?? []) as BuildMindTask[],
  };
}

export async function createProjectWithRoadmap(params: {
  project_name: string;
  idea_description: string;
  target_users: string;
  problem: string;
  startup_stage?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  await ensureUserProfile(user);
  const supabase = createClient();

  let { data: createdProject, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: params.project_name,
      description: params.idea_description,
      target_users: params.target_users,
      problem: params.problem,
      startup_stage: params.startup_stage ?? "Idea",
      validation_strengths: [],
      validation_weaknesses: [],
      validation_suggestions: [],
    })
    .select("*")
    .single();

  if (projectError && projectError.message?.includes("validation_")) {
    const fallback = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: params.project_name,
        description: params.idea_description,
        target_users: params.target_users,
        problem: params.problem,
        startup_stage: params.startup_stage ?? "Idea",
      })
      .select("*")
      .single();
    createdProject = fallback.data;
    projectError = fallback.error;
  }

  if (projectError) throw projectError;

  try {
    await fetch("/api/ai/generate-roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        projectId: createdProject.id,
        title: params.project_name,
        idea_description: params.idea_description,
        target_users: params.target_users,
        problem: params.problem,
        startup_stage: params.startup_stage ?? "Idea",
      }),
    });
  } catch {
    // Roadmap generation failed — project still created, user can retry
  }

  await supabase.auth.updateUser({
    data: { onboarding_completed: true },
  });

  await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  trackEvent("project_created");
  return createdProject;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const user = await getCurrentUser();
  if (!user)
    return {
      activeProjects: 0,
      completedTasks: 0,
      milestonesCompleted: 0,
      aiUsage: 0,
      recentActivity: [],
      founderStreakDays: 0,
    };
  const supabase = createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id);
  const projectIds = (projects ?? []).map((p) => p.id);

  const { data: milestones } = projectIds.length
    ? await supabase
        .from("milestones")
        .select("id, is_completed")
        .in("project_id", projectIds)
    : { data: [] };

  const completedMilestones = (milestones ?? []).filter((m) => m.is_completed)
    .length;
  const milestoneIds = (milestones ?? []).map((m) => m.id);

  const { data: tasks } = milestoneIds.length
    ? await supabase
        .from("tasks")
        .select("id, is_completed, created_at, updated_at")
        .in("milestone_id", milestoneIds)
    : { data: [] };

  const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;

  // BUG FIX: `today` was referenced but never defined. Use proper Date instance.
  const toLocalDateStr = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA");

  const completedDates = new Set(
    (tasks ?? [])
      .filter((t) => t.is_completed && (t.updated_at || t.created_at))
      .map((t) => toLocalDateStr(t.updated_at ?? t.created_at)),
  );

  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (completedDates.has(toLocalDateStr(d.toISOString()))) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("message")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    activeProjects: projectIds.length,
    completedTasks,
    milestonesCompleted: completedMilestones,
    aiUsage: 0,
    recentActivity: (notifications ?? []).map((n) => n.message),
    founderStreakDays: streak,
  };
}

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
  };
  if (!user) return empty;

  const supabase = createClient();
  const summaries = await getProjectSummaries();
  if (!summaries.length) return empty;

  const projectIds = summaries.map((p) => p.id);
  const score = Math.round(
    summaries.reduce((sum, project) => sum + computeStartupScore(project), 0) / summaries.length,
  );

  const { data: milestones } = await supabase
    .from("milestones")
    .select("id, project_id, title, is_completed, updated_at, created_at")
    .in("project_id", projectIds);
  const milestoneIds = (milestones ?? []).map((m) => m.id);
  const milestoneToProject = new Map<string, string>();
  const milestoneTitle = new Map<string, string>();
  (milestones ?? []).forEach((m) => {
    milestoneToProject.set(m.id, m.project_id);
    milestoneTitle.set(m.id, m.title);
  });

  const { data: tasks } = milestoneIds.length
    ? await supabase
        .from("tasks")
        .select("id, title, milestone_id, is_completed, created_at, updated_at")
        .in("milestone_id", milestoneIds)
    : { data: [] };

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

  const tasksCompletedThisWeek = taskData.reduce((sum, count) => sum + count, 0);
  const milestonesCompletedThisWeek = (milestones ?? []).filter((m) => {
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

  return {
    score,
    previousScore,
    weeklyScores,
    taskData,
    tasksCompletedThisWeek,
    tasksCompletedPreviousWeek,
    activeStreakDays,
    focusData,
    wins,
    nextFocus,
  };
}

export function calculateDashboardStats(projects: BuildMindProject[]) {
  const activeProjects = projects.length;
  return {
    activeProjects,
    startupScoreAvg: activeProjects
      ? Math.round(
          projects.reduce((sum, p) => sum + computeStartupScore(p), 0) /
            activeProjects,
        )
      : 0,
    aiUsage: activeProjects ? "Active" : "Getting started",
  };
}

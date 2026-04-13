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
} from "@/lib/buildmind.types";

export function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((v) => String(v)).filter(Boolean);
}

export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
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
  if (selectError) throw selectError;

  if (!existing) {
    const { error: insertError } = await supabase.from("users").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_completed: false,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
  }
}

export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", userId)
    .single();
  if (error) return false;
  return Boolean(data?.onboarding_completed);
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  const supabase = createClient();
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

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select(
      "id,title,description,created_at,industry,startup_stage,validation_score,execution_score,momentum_score,validation_strengths",
    )
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

  const { data: createdProject, error: projectError } = await supabase
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

  // AI usage
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("month", monthKey)
    .single();

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
    aiUsage: usage?.count ?? 0,
    recentActivity: (notifications ?? []).map((n) => n.message),
    founderStreakDays: streak,
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

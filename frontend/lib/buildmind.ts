"use client";

import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";

export type BuildMindProject = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  industry: string | null;
  target_market: string | null;
  problem_type: string | null;
  revenue_model: string | null;
  startup_stage: string | null;
  validation_score: number | null;
  execution_score: number | null;
  momentum_score: number | null;
  target_users: string | null;
  problem: string | null;
  validation_strengths: string[];
  validation_weaknesses: string[];
  validation_suggestions: string[];
  created_at: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  industry?: string | null;
  startup_stage?: string | null;
  validation_score?: number | null;
  execution_score?: number | null;
  momentum_score?: number | null;
  validation_strengths: string[];
  tasksCompleted: number;
  tasksTotal: number;
  progress: number;
  lastActivity: string;
};

export type BuildMindMilestone = {
  id: string;
  project_id: string;
  title: string;
  stage: string;
  order_index: number;
  created_at: string;
  status?: string | null;
  is_completed?: boolean | null;
};

export type BuildMindTask = {
  id: string;
  milestone_id: string;
  title: string;
  notes: string | null;
  is_completed: boolean;
  created_at: string;
};

export type DashboardOverview = {
  activeProjects: number;
  completedTasks: number;
  milestonesCompleted: number;
  aiUsage: number;
  recentActivity: string[];
  founderStreakDays: number;
};

export type BuildMindNotification = {
  id: string;
  user_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

// ─── Stage order ───────────────────────────────────────────────────
const STAGE_ORDER = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

/**
 * Infer the correct startup stage from milestone completion data.
 * This replaces the old heuristic that just counted validation_strengths.
 *
 * Logic:
 * - Map milestone titles to stage names
 * - Find the last milestone that is fully complete
 * - The current stage is the NEXT one after the last complete milestone
 * - If none complete → "Idea"
 * - If all complete → "Revenue"
 */
export function inferStageFromMilestones(
  milestones: Array<{ title: string; is_completed: boolean | null; order_index: number }>,
  tasks: Array<{ milestone_id: string; is_completed: boolean }>,
  milestoneIdMap: Map<string, string> // milestoneId → milestoneTitle
): string {
  if (!milestones.length) return "Idea";

  // Sort by order_index
  const sorted = [...milestones].sort((a, b) => a.order_index - b.order_index);

  // A milestone is "complete" if is_completed=true OR all its tasks are done
  const isMilestoneComplete = (m: typeof sorted[0] & { id?: string }): boolean => {
    if (m.is_completed) return true;
    // Check task completion
    const milestoneTasks = tasks.filter((t) => milestoneIdMap.get(t.milestone_id) === m.title);
    if (!milestoneTasks.length) return false;
    return milestoneTasks.every((t) => t.is_completed);
  };

  // Find last complete milestone index
  let lastCompleteIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i] as typeof sorted[0] & { id?: string };
    if (isMilestoneComplete(m)) {
      lastCompleteIdx = i;
    }
  }

  // Current stage = next after last complete
  if (lastCompleteIdx === -1) return "Idea";
  if (lastCompleteIdx >= sorted.length - 1) return "Revenue";

  const nextMilestone = sorted[lastCompleteIdx + 1];
  // Try to match to a known stage name
  const title = (nextMilestone.title ?? "").toLowerCase();
  if (title.includes("idea")) return "Idea";
  if (title.includes("valid")) return "Validation";
  if (title.includes("mvp") || title.includes("prototype")) return "MVP";
  if (title.includes("launch")) return "Launch";
  if (title.includes("growth") || title.includes("revenue")) return "Revenue";
  // Fallback: use the title itself
  return nextMilestone.title;
}

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((v) => String(v)).filter(Boolean);
}

export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function ensureUserProfile(user: { id: string; email?: string | null }) {
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
  await supabase.from("users").update({ onboarding_completed: true }).eq("id", userId);
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
    .select("id,title,description,created_at,industry,startup_stage,validation_score,execution_score,momentum_score,validation_strengths")
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
    ? await supabase.from("tasks").select("id, milestone_id, is_completed, created_at").in("milestone_id", milestoneIds)
    : { data: [] };

  // Build lookup maps
  const milestoneToProject = new Map<string, string>();
  const milestoneIdToTitle = new Map<string, string>();
  (milestones ?? []).forEach((m) => {
    milestoneToProject.set(m.id, m.project_id);
    milestoneIdToTitle.set(m.id, m.title);
  });

  // Per-project stats
  const stats = new Map<string, { tasksCompleted: number; tasksTotal: number; lastActivity: string }>();
  projects.forEach((p) => stats.set(p.id, { tasksCompleted: 0, tasksTotal: 0, lastActivity: p.created_at }));

  (tasks ?? []).forEach((task) => {
    const projectId = milestoneToProject.get(task.milestone_id);
    if (!projectId) return;
    const current = stats.get(projectId)!;
    stats.set(projectId, {
      tasksCompleted: current.tasksCompleted + (task.is_completed ? 1 : 0),
      tasksTotal: current.tasksTotal + 1,
      lastActivity: task.created_at && task.created_at > current.lastActivity ? task.created_at : current.lastActivity,
    });
  });

  return projects.map((project) => {
    const current = stats.get(project.id) ?? { tasksCompleted: 0, tasksTotal: 0, lastActivity: project.created_at };
    const progress = current.tasksTotal ? Math.round((current.tasksCompleted / current.tasksTotal) * 100) : 0;

    // FIX: compute the real current stage from actual milestone/task data
    const projectMilestones = (milestones ?? []).filter((m) => m.project_id === project.id);
    const projectTasks = (tasks ?? []).filter((t) => milestoneToProject.get(t.milestone_id) === project.id);
    const computedStage = inferStageFromMilestones(
      projectMilestones,
      projectTasks.map((t) => ({ milestone_id: t.milestone_id, is_completed: t.is_completed })),
      milestoneIdToTitle
    );

    // Always prefer computed stage from milestones/tasks to avoid stale DB values
    const displayStage = computedStage || project.startup_stage || "Idea";

    return {
      id: project.id,
      title: project.title,
      description: project.description,
      created_at: project.created_at,
      industry: project.industry ?? null,
      startup_stage: displayStage,  // FIX: always returns a real stage
      validation_score: project.validation_score ?? null,
      execution_score: project.execution_score ?? null,
      momentum_score: project.momentum_score ?? null,
      validation_strengths: normalizeTextArray(project.validation_strengths),
      tasksCompleted: current.tasksCompleted,
      tasksTotal: current.tasksTotal,
      progress,
      lastActivity: current.lastActivity,
    };
  });
}

/**
 * updateProjectStage — writes the current computed stage back to the DB.
 * Call this after task completion so the stage persists across sessions.
 */
export async function updateProjectStage(projectId: string, stage: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("projects").update({ startup_stage: stage }).eq("id", projectId);
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
    .from("projects").select("*").eq("id", projectId).eq("user_id", user.id).single();
  if (projectError) throw projectError;

  const { data: milestones, error: milestoneError } = await supabase
    .from("milestones").select("*").eq("project_id", projectId).order("order_index", { ascending: true });
  if (milestoneError) throw milestoneError;

  const milestoneIds = (milestones ?? []).map((m) => m.id);
  const { data: tasks, error: tasksError } = milestoneIds.length
    ? await supabase.from("tasks").select("*").in("milestone_id", milestoneIds).order("created_at", { ascending: true })
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

  // Create the project first
  const { data: createdProject, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: params.project_name,
      description: params.idea_description,
      target_users: params.target_users,
      problem: params.problem,
      startup_stage: params.startup_stage ?? "Idea", // initial stage can be chosen
      validation_strengths: [],
      validation_weaknesses: [],
      validation_suggestions: [],
    })
    .select("*")
    .single();
  if (projectError) throw projectError;

  // Generate roadmap via API (uses Groq if available, fallback otherwise)
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

  // Mark onboarding complete
  await supabase.from("users").update({ onboarding_completed: true }).eq("id", user.id);

  trackEvent("project_created");
  return createdProject;
}

export async function completeTask(taskId: string): Promise<{ newStage: string | null }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();

  // Mark task complete
  await supabase.from("tasks").update({ is_completed: true }).eq("id", taskId);

  // Check if the parent milestone is now fully complete
  const { data: task } = await supabase.from("tasks").select("milestone_id").eq("id", taskId).single();
  if (!task) return { newStage: null };

  const { data: sibling } = await supabase.from("tasks").select("is_completed").eq("milestone_id", task.milestone_id);
  const allDone = (sibling ?? []).every((t) => t.is_completed);

  if (allDone) {
    // Mark milestone complete
    await supabase.from("milestones").update({ is_completed: true }).eq("id", task.milestone_id);

    // Re-compute stage and write it back
    const { data: milestone } = await supabase.from("milestones").select("project_id").eq("id", task.milestone_id).single();
    if (milestone) {
      const summaries = await getProjectSummaries();
      const updated = summaries.find((s) => s.id === milestone.project_id);
      if (updated?.startup_stage) {
        await updateProjectStage(milestone.project_id, updated.startup_stage);
        return { newStage: updated.startup_stage };
      }
    }
  }

  return { newStage: null };
}

export async function updateTaskStatus(taskId: string, isCompleted: boolean, notes?: string) {
  const supabase = createClient();
  const { data: taskRow, error: taskError } = await supabase
    .from("tasks")
    .select("id, milestone_id, is_completed")
    .eq("id", taskId)
    .single();
  if (taskError) throw taskError;

  const { data: milestoneTasks, error: milestoneError } = await supabase
    .from("tasks")
    .select("id, is_completed")
    .eq("milestone_id", taskRow.milestone_id);
  if (milestoneError) throw milestoneError;

  const wasMilestoneComplete =
    (milestoneTasks ?? []).length > 0 && (milestoneTasks ?? []).every((t) => t.is_completed);

  const { error } = await supabase
    .from("tasks")
    .update({ is_completed: isCompleted, notes: notes ?? null })
    .eq("id", taskId);
  if (error) throw error;

  const nowTasks = (milestoneTasks ?? []).map((t) =>
    t.id === taskRow.id ? { ...t, is_completed: isCompleted } : t
  );
  const isMilestoneComplete = nowTasks.length > 0 && nowTasks.every((t) => t.is_completed);

  if (isCompleted && !taskRow.is_completed) {
    await createNotificationForCurrentUser("task_completed", "Task marked as completed.");
    trackEvent("task_completed");
  }

  if (isMilestoneComplete && !wasMilestoneComplete) {
    await createNotificationForCurrentUser("milestone_completed", "Milestone completed. Great momentum!");
    trackEvent("milestone_completed");

    // Re-compute stage and write it back so the UI advances
    const { data: milestone } = await supabase
      .from("milestones")
      .select("project_id")
      .eq("id", taskRow.milestone_id)
      .single();
    if (milestone?.project_id) {
      const summaries = await getProjectSummaries();
      const updated = summaries.find((s) => s.id === milestone.project_id);
      if (updated?.startup_stage) {
        await updateProjectStage(milestone.project_id, updated.startup_stage);
      }
    }
  }
}

export async function updateMilestoneForCurrentUser(
  milestoneId: string,
  payload: { title?: string; stage?: string; order_index?: number }
): Promise<BuildMindMilestone> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("milestones")
    .update(payload)
    .eq("id", milestoneId)
    .select("*")
    .single();
  if (error) throw error;
  return data as BuildMindMilestone;
}

export async function deleteProjectForCurrentUser(projectId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("user_id", user.id);
  if (error) throw error;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const user = await getCurrentUser();
  if (!user) return { activeProjects: 0, completedTasks: 0, milestonesCompleted: 0, aiUsage: 0, recentActivity: [], founderStreakDays: 0 };
  const supabase = createClient();

  const { data: projects } = await supabase.from("projects").select("id").eq("user_id", user.id);
  const projectIds = (projects ?? []).map((p) => p.id);

  const { data: milestones } = projectIds.length
    ? await supabase.from("milestones").select("id, is_completed").in("project_id", projectIds)
    : { data: [] };

  const completedMilestones = (milestones ?? []).filter((m) => m.is_completed).length;
  const milestoneIds = (milestones ?? []).map((m) => m.id);

  const { data: tasks } = milestoneIds.length
    ? await supabase.from("tasks").select("id, is_completed, created_at").in("milestone_id", milestoneIds)
    : { data: [] };

  const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;

  // Compute streak from task completion dates
  const completedDates = new Set(
    (tasks ?? [])
      .filter((t) => t.is_completed && t.created_at)
      .map((t) => new Date(t.created_at).toDateString())
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (completedDates.has(d.toDateString())) streak++;
    else if (i > 0) break;
  }

  const { data: usage } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("month", `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`)
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
      ? Math.round(projects.reduce((sum, p) => sum + computeStartupScore(p), 0) / activeProjects)
      : 0,
    aiUsage: activeProjects ? "Active" : "Getting started",
  };
}

export function computeStartupScore(summary: {
  progress?: number | null;
  validation_strengths?: string[] | null;
  execution_score?: number | null;
}): number {
  const base = summary.execution_score ?? 0;
  const strengthBoost = (summary.validation_strengths ?? []).length * 8;
  const progress = summary.progress ?? 0;
  return Math.min(100, Math.round(Math.max(base, progress + strengthBoost)));
}

async function createNotification(userId: string, type: string, message: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("notifications").insert({ user_id: userId, type, message, is_read: false });
}

export async function createNotificationForCurrentUser(type: string, message: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await createNotification(user.id, type, message);
}

export async function getNotificationsForCurrentUser(): Promise<BuildMindNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BuildMindNotification[];
}

export async function markNotificationAsRead(notificationId: string) {
  const supabase = createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
}

export async function clearNotificationsForCurrentUser(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = createClient();
  await supabase.from("notifications").delete().eq("user_id", user.id);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = createClient();
  const { count } = await supabase
    .from("notifications").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("is_read", false);
  return count ?? 0;
}

export async function getAICoachAdvice(projectId: string): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const res = await fetch("/api/ai/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, userId: user.id }),
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  const advice = body?.data?.advice;
  return Array.isArray(advice) ? advice.map(String) : [];
}

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

type ValidationResult = {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
};

type RoadmapResult = Array<{ milestone: string; tasks: string[] }>;

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
    if (insertError) throw insertError;
    return;
  }

  if ((user.email ?? "") && existing.email !== user.email) {
    const { error: updateError } = await supabase
      .from("users")
      .update({ email: user.email })
      .eq("id", user.id);
    if (updateError) throw updateError;
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

export async function setOnboardingCompleted(userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", userId);
  if (error) throw error;
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
  return (data ?? []).map((row) => ({
    ...row,
    validation_strengths: normalizeTextArray(row.validation_strengths),
    validation_weaknesses: normalizeTextArray(row.validation_weaknesses),
    validation_suggestions: normalizeTextArray(row.validation_suggestions),
  })) as BuildMindProject[];
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createClient();
  const projects = await getProjectsForCurrentUser();
  if (!projects.length) return [];

  const projectIds = projects.map((project) => project.id);
  const { data: milestones, error: milestoneError } = await supabase
    .from("milestones")
    .select("id, project_id, created_at")
    .in("project_id", projectIds);
  if (milestoneError) throw milestoneError;

  const milestoneList = milestones ?? [];
  const milestoneIds = milestoneList.map((milestone) => milestone.id);
  const { data: tasks, error: taskError } = milestoneIds.length
    ? await supabase.from("tasks").select("id, milestone_id, is_completed, created_at").in("milestone_id", milestoneIds)
    : { data: [], error: null };
  if (taskError) throw taskError;

  const milestoneToProject = new Map<string, string>();
  milestoneList.forEach((milestone) => {
    milestoneToProject.set(milestone.id, milestone.project_id);
  });

  const stats = new Map<
    string,
    { tasksCompleted: number; tasksTotal: number; lastActivity: string }
  >();
  projects.forEach((project) => {
    stats.set(project.id, { tasksCompleted: 0, tasksTotal: 0, lastActivity: project.created_at });
  });

  (tasks ?? []).forEach((task) => {
    const projectId = milestoneToProject.get(task.milestone_id);
    if (!projectId) return;
    const current = stats.get(projectId);
    if (!current) return;
    const tasksTotal = current.tasksTotal + 1;
    const tasksCompleted = current.tasksCompleted + (task.is_completed ? 1 : 0);
    const lastActivity = task.created_at && task.created_at > current.lastActivity ? task.created_at : current.lastActivity;
    stats.set(projectId, { tasksCompleted, tasksTotal, lastActivity });
  });

  return projects.map((project) => {
    const current = stats.get(project.id) ?? { tasksCompleted: 0, tasksTotal: 0, lastActivity: project.created_at };
    const progress = current.tasksTotal ? Math.round((current.tasksCompleted / current.tasksTotal) * 100) : 0;
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      created_at: project.created_at,
      industry: project.industry ?? null,
      startup_stage: project.startup_stage ?? null,
      validation_score: project.validation_score ?? null,
      execution_score: project.execution_score ?? null,
      momentum_score: project.momentum_score ?? null,
      validation_strengths: project.validation_strengths,
      tasksCompleted: current.tasksCompleted,
      tasksTotal: current.tasksTotal,
      progress,
      lastActivity: current.lastActivity,
    };
  });
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
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  await ensureUserProfile(user);
  const supabase = createClient();

  const validation = await generateValidation({
    idea: params.idea_description,
    targetUsers: params.target_users,
    problem: params.problem,
  });

  const { data: createdProject, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: params.project_name,
      description: params.idea_description,
      target_users: params.target_users,
      problem: params.problem,
      validation_strengths: validation.strengths,
      validation_weaknesses: validation.weaknesses,
      validation_suggestions: validation.suggestions,
    })
    .select("*")
    .single();
  if (projectError) throw projectError;

  const roadmap = await generateRoadmap({
    title: params.project_name,
    idea: params.idea_description,
    targetUsers: params.target_users,
    problem: params.problem,
  });

  for (let i = 0; i < roadmap.length; i += 1) {
    const milestone = roadmap[i];
    const { data: createdMilestone, error: milestoneError } = await supabase
      .from("milestones")
      .insert({
        project_id: createdProject.id,
        title: milestone.milestone,
        stage: milestone.milestone,
        order_index: i,
      })
      .select("*")
      .single();
    if (milestoneError) throw milestoneError;

    const tasksPayload = milestone.tasks.map((task) => ({
      milestone_id: createdMilestone.id,
      title: task,
      notes: null,
      is_completed: false,
    }));
    if (tasksPayload.length) {
      const { error: taskError } = await supabase.from("tasks").insert(tasksPayload);
      if (taskError) throw taskError;
    }
  }

  await createNotification(user.id, "project_created", `Project "${params.project_name}" created successfully.`);
  await setOnboardingCompleted(user.id);
  trackEvent("project_created", { project_name: params.project_name });

  return createdProject as BuildMindProject;
}

export async function createProjectBasic(payload: { title: string; description: string; target_users: string; problem: string }) {
  return createProjectWithRoadmap({
    project_name: payload.title,
    idea_description: payload.description,
    target_users: payload.target_users,
    problem: payload.problem,
  });
}

export async function deleteProjectForCurrentUser(projectId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (error) throw error;
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
    t.id === taskRow.id ? { ...t, is_completed: isCompleted } : t,
  );
  const isMilestoneComplete = nowTasks.length > 0 && nowTasks.every((t) => t.is_completed);

  if (isCompleted && !taskRow.is_completed) {
    await createNotificationForCurrentUser("task_completed", "Task marked as completed.");
    trackEvent("task_completed");
  }

  if (isMilestoneComplete && !wasMilestoneComplete) {
    await createNotificationForCurrentUser("milestone_completed", "Milestone completed. Great momentum!");
    trackEvent("milestone_completed");
  }
}

export async function updateMilestoneForCurrentUser(
  milestoneId: string,
  payload: { title?: string; stage?: string; order_index?: number },
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

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const user = await getCurrentUser();
  if (!user) {
    return { activeProjects: 0, completedTasks: 0, milestonesCompleted: 0, aiUsage: 0, recentActivity: [], founderStreakDays: 0 };
  }
  const supabase = createClient();
  const projects = await getProjectsForCurrentUser();
  const projectIds = projects.map((p) => p.id);

  const { data: milestones } = projectIds.length
    ? await supabase.from("milestones").select("id, stage, project_id").in("project_id", projectIds)
    : { data: [] };
  const milestoneIds = (milestones ?? []).map((m) => m.id);
  const { data: tasks } = milestoneIds.length
    ? await supabase.from("tasks").select("id,is_completed,milestone_id").in("milestone_id", milestoneIds)
    : { data: [] };

  const milestoneTaskMap = new Map<string, { total: number; completed: number }>();
  (tasks ?? []).forEach((task) => {
    const current = milestoneTaskMap.get(task.milestone_id) ?? { total: 0, completed: 0 };
    milestoneTaskMap.set(task.milestone_id, {
      total: current.total + 1,
      completed: current.completed + (task.is_completed ? 1 : 0),
    });
  });

  const completedMilestones = (milestones ?? []).filter((m) => {
    const stats = milestoneTaskMap.get(m.id);
    return stats ? stats.total > 0 && stats.completed === stats.total : false;
  }).length;

  const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;

  const { data: usage } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("month", monthKey())
    .single();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("message,type,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const completionDays = new Set<string>();
  (notifications ?? []).forEach((n) => {
    if (n.type !== "task_completed") return;
    const date = new Date(n.created_at);
    if (Number.isNaN(date.valueOf())) return;
    completionDays.add(date.toISOString().slice(0, 10));
  });
  const today = new Date();
  const todayKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let streak = 0;
  for (let i = 0; i < 60; i += 1) {
    const day = new Date(todayKey);
    day.setUTCDate(todayKey.getUTCDate() - i);
    const key = day.toISOString().slice(0, 10);
    if (!completionDays.has(key)) break;
    streak += 1;
  }

  return {
    activeProjects: projects.length,
    completedTasks,
    milestonesCompleted: completedMilestones,
    aiUsage: usage?.count ?? 0,
    recentActivity: (notifications ?? []).slice(0, 5).map((n) => n.message),
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

export async function getNotificationsForCurrentUser(): Promise<BuildMindNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BuildMindNotification[];
}

export async function markNotificationAsRead(notificationId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
  if (error) throw error;
}

export async function clearNotificationsForCurrentUser(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = createClient();
  const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
  if (error) throw error;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);
  if (error) return 0;
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
  if (!res.ok) throw new Error("Failed to generate BuildMini advice");
  const body = await res.json();
  return normalizeTextArray(body?.data?.advice);
}

async function generateValidation(payload: { idea: string; targetUsers: string; problem: string }): Promise<ValidationResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      strengths: ["Clear startup direction."],
      weaknesses: ["Validation data is still limited."],
      suggestions: ["Interview 10 potential users before building."],
    };
  }
  try {
    const res = await fetch("/api/ai/validate-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, userId: user.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = String(body?.error || "Failed to validate startup idea");
      throw new Error(message);
    }
    const body = await res.json();
    return {
      strengths: normalizeTextArray(body?.data?.strengths),
      weaknesses: normalizeTextArray(body?.data?.weaknesses),
      suggestions: normalizeTextArray(body?.data?.suggestions),
    };
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("limit")) {
      throw err;
    }
    return {
      strengths: ["Problem statement is clear and specific."],
      weaknesses: ["Target segment assumptions need interviews."],
      suggestions: [
        "Run customer discovery calls this week.",
        "Define one primary user persona.",
        "Validate willingness to pay with a landing page test.",
      ],
    };
  }
}

async function generateRoadmap(payload: { title: string; idea: string; targetUsers: string; problem: string }): Promise<RoadmapResult> {
  const user = await getCurrentUser();
  const fallbackRoadmap: RoadmapResult = [
    { milestone: "Idea", tasks: ["Define one-sentence value proposition.", "Draft user persona and problem hypothesis."] },
    { milestone: "Validation", tasks: ["Interview 10 target users.", "Test problem urgency with simple survey."] },
    { milestone: "MVP", tasks: ["Build smallest useful feature set.", "Release to 5 early adopters."] },
    { milestone: "Launch", tasks: ["Publish landing page.", "Run first acquisition channel experiment."] },
    { milestone: "Growth", tasks: ["Measure retention weekly.", "Prioritize top feedback loop."] },
  ];

  if (!user) return fallbackRoadmap;
  try {
    const res = await fetch("/api/ai/generate-roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, userId: user.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = String(body?.error || "Failed to generate roadmap");
      throw new Error(message);
    }
    const body = await res.json();
    if (!Array.isArray(body?.data?.roadmap)) {
      return fallbackRoadmap;
    }
    const parsed = body.data.roadmap.map((item: { milestone?: string; tasks?: unknown[] }) => ({
      milestone: String(item?.milestone ?? "Milestone"),
      tasks: normalizeTextArray(item?.tasks),
    }));
    return parsed.length ? parsed : fallbackRoadmap;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("limit")) {
      throw err;
    }
    return fallbackRoadmap;
  }
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

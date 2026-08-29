"use client";

/**
 * lib/buildmind.ts — re-export shim (v13)
 *
 * This file is intentionally thin. All logic has been split into focused modules:
 *
 *   lib/buildmind.types.ts   — domain types (no client dependency)
 *   lib/stages/index.ts      — stage inference from milestone/task data
 *   lib/scoring/index.ts     — startup score computation
 *   lib/data/projects.ts     — Supabase data access (projects, milestones, tasks)
 *   lib/notifications.ts     — notification helpers (unchanged)
 *   lib/achievements.ts      — achievement helpers (unchanged)
 *
 * All existing import paths (e.g. `import { getCurrentUser } from "@/lib/buildmind"`)
 * continue to work with zero changes to call-sites.
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  BuildMindProject,
  ProjectSummary,
  BuildMindMilestone,
  BuildMindTask,
  DashboardOverview,
  BuildMindNotification,
} from "@/lib/buildmind.types";

// ── Stage logic ────────────────────────────────────────────────────────────────
export {
  STAGE_ORDER,
  normalizeStage,
  inferStageFromMilestones,
  stageRank,
} from "@/lib/stages";

// ── Scoring ────────────────────────────────────────────────────────────────────
export { computeStartupScore, computeScoreDelta, applyScoreDelta } from "@/lib/scoring";

// ── Data access ────────────────────────────────────────────────────────────────
export {
  getCurrentUser,
  ensureUserProfile,
  getOnboardingStatus,
  markOnboardingComplete,
  getProjectsForCurrentUser,
  getProjectSummaries,
  updateProjectStage,
  getProjectDetail,
  createProjectWithRoadmap,
  updateProjectDetails,
  getDashboardOverview,
  getWeeklyReportMetrics,
  calculateDashboardStats,
} from "@/lib/data/projects";

// ── Notifications ──────────────────────────────────────────────────────────────
export {
  createNotificationForCurrentUser,
  getNotificationsForCurrentUser,
  markNotificationAsRead,
  clearNotificationsForCurrentUser,
  getUnreadNotificationCount,
} from "@/lib/notifications";

// ── AI Coach helper ─────────────────────────────────────────────────────────
import { getCurrentUser } from "@/lib/data/projects";

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

// ── Task / Milestone mutations (touch multiple tables) ──────────────────────
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { getProjectSummaries, updateProjectStage } from "@/lib/data/projects";
import { observeTaskEvent } from "@/lib/founderMemory";

export async function completeTask(taskId: string): Promise<{ newStage: string | null }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();

  const { data: task } = await supabase
    .from("tasks").select("title, milestone_id").eq("id", taskId).maybeSingle();
  if (!task) return { newStage: null };

  await supabase.from("tasks").update({ is_completed: true }).eq("id", taskId);
  observeTaskEvent(task.title ?? "task", "completed").catch((err) => console.warn("[buildmind] observeTaskEvent failed:", err)); // non-blocking memory update

  const { data: sibling } = await supabase
    .from("tasks").select("is_completed").eq("milestone_id", task.milestone_id);
  const allDone = (sibling ?? []).every((t) => t.is_completed);

  if (allDone) {
    await supabase.from("milestones").update({ status: 'completed' }).eq("id", task.milestone_id);
    const { data: milestone } = await supabase
      .from("milestones").select("project_id").eq("id", task.milestone_id).maybeSingle();
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
    .from("tasks").select("id, title, milestone_id, is_completed").eq("id", taskId).maybeSingle();
  if (taskError) throw taskError;
  if (!taskRow) throw new Error("Task not found");

  const { data: milestoneTasks, error: milestoneError } = await supabase
    .from("tasks").select("id, is_completed").eq("milestone_id", taskRow.milestone_id);
  if (milestoneError) throw milestoneError;

  const wasMilestoneComplete =
    (milestoneTasks ?? []).length > 0 && (milestoneTasks ?? []).every((t) => t.is_completed);

  const { error } = await supabase
    .from("tasks").update({
      is_completed: isCompleted,
      notes: notes ?? null,
      // Explicitly set updated_at so reports can use it as completion_date.
      // Supabase doesn't auto-update this column unless a DB trigger exists.
      updated_at: new Date().toISOString(),
    }).eq("id", taskId);
  if (error) throw error;

  const nowTasks = (milestoneTasks ?? []).map((t) =>
    t.id === taskRow.id ? { ...t, is_completed: isCompleted } : t
  );
  const isMilestoneComplete = nowTasks.length > 0 && nowTasks.every((t) => t.is_completed);

  if (isCompleted && !taskRow.is_completed) {
    trackEvent("task_completed");
    observeTaskEvent(taskRow.title ?? "task", "completed").catch((err) => console.warn("[buildmind] observeTaskEvent failed:", err));
  } else if (!isCompleted && taskRow.is_completed) {
    observeTaskEvent(taskRow.title ?? "task", "skipped").catch((err) => console.warn("[buildmind] observeTaskEvent failed:", err));
  }

  if (isMilestoneComplete && !wasMilestoneComplete) {
    trackEvent("milestone_completed");
  }

  if (isMilestoneComplete !== wasMilestoneComplete) {
    await supabase
      .from("milestones")
      .update({
        status: isMilestoneComplete ? 'completed' : 'in_progress',
      })
      .eq("id", taskRow.milestone_id);
  }

  if (isMilestoneComplete && !wasMilestoneComplete) {
    const { data: milestone } = await supabase
      .from("milestones").select("project_id").eq("id", taskRow.milestone_id).maybeSingle();
    if (milestone?.project_id) {
      const summaries = await getProjectSummaries();
      const updated = summaries.find((s) => s.id === milestone.project_id);
      if (updated?.startup_stage) await updateProjectStage(milestone.project_id, updated.startup_stage);
    }
  }
}

export async function updateMilestoneForCurrentUser(
  milestoneId: string,
  payload: {
    title?: string;
    stage?: string;
    order_index?: number;
    // From supabase/migrations/20260731000000_milestone_estimates_stall_detection.sql,
    // confirmed live.
    difficulty?: number | null;
    estimated_days?: number | null;
    estimate_is_provisional?: boolean;
    started_at?: string | null;
  }
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("milestones").update(payload).eq("id", milestoneId).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteProjectForCurrentUser(projectId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();
  const { error } = await supabase
    .from("projects").delete().eq("id", projectId).eq("user_id", user.id);
  if (error) throw error;
}

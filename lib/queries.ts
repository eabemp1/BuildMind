"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProjectWithRoadmap,
  deleteProjectForCurrentUser,
  getAICoachAdvice,
  getDashboardOverview,
  getWeeklyReportMetrics,
  clearNotificationsForCurrentUser,
  getNotificationsForCurrentUser,
  getProjectDetail,
  getProjectsForCurrentUser,
  getProjectSummaries,
  markNotificationAsRead,
  updateTaskStatus,
  type BuildMindNotification,
  type ProjectSummary,
  type BuildMindTask,
} from "@/lib/buildmind";
import { ACTIVE_PROJECT_CHANGED_EVENT, getActiveProjectId, syncActiveProjectIdFromServer } from "@/lib/api";
import { observeTaskEvent } from "@/lib/founderMemory";
// A5 FIX: founderContext imports removed — momentumOnTaskComplete/updateFounderContext were the
// client-side momentum writers that raced with the server. Server is now sole authority.

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  overviewRoot: ["dashboard-overview"] as const,
  overview: (projectId?: string | null) => ["dashboard-overview", projectId ?? "all"] as const,
  weeklyReportRoot: ["weekly-report"] as const,
  weeklyReport: (projectId?: string | null) => ["weekly-report", projectId ?? "all"] as const,
  notifications: ["notifications"] as const,
  coach: (projectId: string) => ["coach", projectId] as const,
  projectSummaries: ["project-summaries"] as const,
  scorecard: ["founder-scorecard"] as const,
};

export function selectActiveProject(summaries: ProjectSummary[], activeProjectId?: string | null) {
  if (!summaries.length) return null;
  const storedProject = activeProjectId
    ? summaries.find((project) => project.id === activeProjectId)
    : null;
  if (storedProject) return storedProject;
  return summaries.reduce((a, b) =>
    new Date(b.lastActivity).getTime() > new Date(a.lastActivity).getTime() ? b : a
  );
}

export function useActiveProjectId() {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => getActiveProjectId());

  useEffect(() => {
    const refresh = () => setActiveProjectIdState(getActiveProjectId());
    refresh();
    syncActiveProjectIdFromServer().then(setActiveProjectIdState).catch(() => {});
    window.addEventListener("storage", refresh);
    window.addEventListener(ACTIVE_PROJECT_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ACTIVE_PROJECT_CHANGED_EVENT, refresh);
    };
  }, []);

  return activeProjectId;
}

export function useActiveProject(summaries: ProjectSummary[]) {
  const activeProjectId = useActiveProjectId();
  return useMemo(() => selectActiveProject(summaries, activeProjectId), [summaries, activeProjectId]);
}

export function useProjectsQuery() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: getProjectsForCurrentUser });
}

export function useProjectDetailQuery(projectId: string) {
  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => getProjectDetail(projectId),
    enabled: Boolean(projectId),
  });
}

export function useProjectSummariesQuery() {
  return useQuery({
    queryKey: queryKeys.projectSummaries,
    queryFn: getProjectSummaries,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useDashboardOverviewQuery(projectId?: string | null) {
  return useQuery({
    queryKey: queryKeys.overview(projectId),
    queryFn: () => getDashboardOverview(projectId ?? undefined),
  });
}

export function useWeeklyReportMetricsQuery(projectId?: string | null) {
  return useQuery({
    queryKey: queryKeys.weeklyReport(projectId),
    queryFn: () => getWeeklyReportMetrics(projectId ?? undefined),
  });
}

export function useNotificationsQuery() {
  return useQuery({ queryKey: queryKeys.notifications, queryFn: getNotificationsForCurrentUser });
}

export function useCreateProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectWithRoadmap,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      void qc.invalidateQueries({ queryKey: queryKeys.projectSummaries });
      void qc.invalidateQueries({ queryKey: queryKeys.overviewRoot });
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useDeleteProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => deleteProjectForCurrentUser(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      void qc.invalidateQueries({ queryKey: queryKeys.projectSummaries });
      void qc.invalidateQueries({ queryKey: queryKeys.overviewRoot });
    },
  });
}

export function useMarkNotificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => Promise.resolve(markNotificationAsRead(id)),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = qc.getQueryData<BuildMindNotification[]>(queryKeys.notifications) ?? [];
      qc.setQueryData<BuildMindNotification[]>(
        queryKeys.notifications,
        previous.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.notifications, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useClearNotificationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => Promise.resolve(clearNotificationsForCurrentUser()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

/**
 * useUpdateTaskMutation — marks a task complete/incomplete.
 * On success, invalidates project detail AND project summaries
 * so the stage updates everywhere immediately.
 */
export function useUpdateTaskMutation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { taskId: string; isCompleted: boolean; notes?: string }) =>
      updateTaskStatus(payload.taskId, payload.isCompleted, payload.notes),
    onMutate: async (variables) => {
      // Optimistic update: flip the task in cache immediately
      await qc.cancelQueries({ queryKey: queryKeys.project(projectId) });
      const prev = qc.getQueryData(queryKeys.project(projectId));
      qc.setQueryData(queryKeys.project(projectId), (old: ReturnType<typeof getProjectDetail> extends Promise<infer T> ? T : never) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) =>
            t.id === variables.taskId ? { ...t, is_completed: variables.isCompleted, notes: variables.notes ?? t.notes } : t
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.project(projectId), ctx.prev);
    },
    onSuccess: async (_data, variables) => {
      if (variables?.isCompleted) {
        void observeTaskEvent(
          qc.getQueryData<{ tasks: BuildMindTask[] }>(queryKeys.project(projectId))
            ?.tasks.find(t => t.id === variables.taskId)?.title ?? "task",
          "completed"
        );
        // A5 FIX: Remove the client-side momentum write. Previously the client
        // read ctx.momentum_score, computed a new value, and wrote it to BOTH
        // founder_context AND projects — racing with the server-side
        // task-complete endpoint doing the same thing. Last TCP packet won,
        // silently discarding whichever write arrived earlier.
        //
        // Server is now the single authority for momentum_score:
        // /api/founder-context/task-complete reads the DB-fresh score and
        // writes the authoritative new value. The client must NOT write momentum
        // — it only invalidates its cache so it re-fetches the server value.
        //
        // observeTaskEvent() above still runs client-side (behavioral signals
        // only; it does NOT touch momentum_score).
        void fetch("/api/founder-context/task-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          cache: "no-store",
        }).catch((err) => console.warn("[queries] task-complete ping failed:", err));
      }
    },
    onSettled: () => {
      // Invalidate everything so stage recomputes everywhere
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void qc.invalidateQueries({ queryKey: queryKeys.projectSummaries });
      void qc.invalidateQueries({ queryKey: queryKeys.overviewRoot });
    },
  });
}

export function useAICoachQuery(projectId: string) {
  return useQuery({
    queryKey: queryKeys.coach(projectId),
    queryFn: () => getAICoachAdvice(projectId),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

/**
 * useFounderScorecardQuery — THE canonical source for momentum, streak, xp,
 * executionScore, and projectScore across the whole app.
 *
 * FIX: overview, reports, today, and project-detail pages each
 * independently reconstructed a score by pulling XP/streak from browser
 * localStorage (getXP()/getStoredStreak()) and calling computeStartupScore()
 * themselves — four separate assemblies of the same number, each able to
 * drift from the others depending on when that page's local cache last
 * synced. This is the confirmed, reported cause of momentum/score
 * disagreeing between weekly reports and the dashboard/execution pages.
 *
 * Every page migrated to this hook now reads the exact same server-computed
 * value from GET /api/founder-context/scorecard (backed by
 * lib/scorecard.ts's getFounderScorecard(), the same function
 * task-complete/streak/xp routes already write through) — one number,
 * everywhere, always.
 */
export function useFounderScorecardQuery(validationStrengths: string[] = []) {
  return useQuery({
    queryKey: [...queryKeys.scorecard, validationStrengths.join(",")],
    queryFn: async () => {
      const params = validationStrengths.length
        ? `?validationStrengths=${encodeURIComponent(validationStrengths.join(","))}`
        : "";
      const res = await fetch(`/api/founder-context/scorecard${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load scorecard");
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Could not load scorecard");
      return json.data as {
        momentum: number;
        streak: number;
        xp: number;
        executionScore: number;
        tasksCompletedTotal: number;
        tasksCompletedToday: number;
        projectScore: number;
        momentumLabel: { label: string; color: string; emoji: string };
        isDecaying: boolean;
        momentumDelta: number | null;
        momentumTrend: "up" | "down" | "flat" | "unknown";
      };
    },
    staleTime: 60_000,
  });
                                                }

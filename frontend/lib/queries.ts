"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProjectWithRoadmap,
  deleteProjectForCurrentUser,
  getAICoachAdvice,
  getDashboardOverview,
  clearNotificationsForCurrentUser,
  getNotificationsForCurrentUser,
  getProjectDetail,
  getProjectsForCurrentUser,
  getProjectSummaries,
  markNotificationAsRead,
  type BuildMindNotification,
} from "@/lib/buildmind";

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  overview: ["dashboard-overview"] as const,
  notifications: ["notifications"] as const,
  coach: (projectId: string) => ["coach", projectId] as const,
  projectSummaries: ["project-summaries"] as const,
};

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: getProjectsForCurrentUser,
  });
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
  });
}

export function useDashboardOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: getDashboardOverview,
  });
}

export function useNotificationsQuery() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: getNotificationsForCurrentUser,
  });
}

export function useCreateProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectWithRoadmap,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      void qc.invalidateQueries({ queryKey: queryKeys.projectSummaries });
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
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
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useMarkNotificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = qc.getQueryData<BuildMindNotification[]>(queryKeys.notifications) ?? [];
      qc.setQueryData<BuildMindNotification[]>(
        queryKeys.notifications,
        previous.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.notifications, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useClearNotificationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearNotificationsForCurrentUser,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useCoachAdviceQuery(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.coach(projectId ?? ""),
    queryFn: () => getAICoachAdvice(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}

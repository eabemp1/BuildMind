/**
 * lib/buildmind.types.ts
 *
 * Shared type definitions for BuildMind domain objects.
 * Extracted from lib/buildmind.ts to allow importing types without
 * pulling in Supabase client or "use client" directive on server paths.
 */

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

export type WeeklyReportMetrics = {
  score: number;
  previousScore: number;
  weeklyScores: number[];
  taskData: number[];
  tasksCompletedThisWeek: number;
  tasksCompletedPreviousWeek: number;
  activeStreakDays: number;
  focusData: { label: string; value: number; color: string }[];
  wins: string[];
  nextFocus: string[];
};

export type BuildMindNotification = {
  id: string;
  user_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

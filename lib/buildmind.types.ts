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
  name?: string | null;
  title: string;
  description: string | null;
  created_at: string;
  industry?: string | null;
  stage?: string | null;
  startup_summary?: string | null;
  startup_stage?: string | null;
  current_mrr?: number | null;
  mrr?: number | null;
  validation_score?: number | null;
  execution_score?: number | null;
  momentum_score?: number | null;
  validation_strengths: string[];
  tasksCompleted: number;
  tasksTotal: number;
  progress: number;
  lastActivity: string;
  problem?: string | null;
  target_users?: string | null;
  // Populated by getProjectSummaries — used by Today page & AI routes
  pendingMilestones?: string[];
  pendingTasks?: string[];
  completion_rate?: number;
};

export type BuildMindMilestone = {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
  // Legacy fields - no longer in schema but kept for backwards compatibility in client code
  stage?: string;
  order_index?: number;
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
  avoidanceZones?: string[];
  founderName?: string | null;
};

export type FounderMemory = {
  user_id: string;
  avoidance_zones?: string[] | null;
  strengths?: string[] | null;
  personality_tags?: string[] | null;
  last_insight?: string | null;
  last_week_summary: string | null;
  initial_analysis: string | null;
  pending_milestone_break: string | null;
  intention_vs_execution_rate: number | null;
  previous_intention_vs_execution_rate: number | null;
  execution_trend: "up" | "down" | "flat";
  avoidance_pattern: string | null;
};

export type WeeklyReportMetrics = {
  score: number;
  previousScore: number;
  weeklyScores: number[];
  taskData: number[];
  tasksCompletedThisWeek: number;
  tasksCompletedPreviousWeek: number;
  intention_vs_execution_rate: number | null;
  previous_intention_vs_execution_rate: number | null;
  execution_trend: "up" | "down" | "flat";
  avoidance_pattern: string | null;
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

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
  aiAdviceQuality?: number;
  todayDone?: boolean;
  reflectionDoneToday?: boolean;
  daysSinceLastReflection?: number | null;
};

export type WeeklyReportMetrics = {
  score: number;
  previousScore: number;
  weeklyScores: number[];
  taskData: number[];
  tasksCompletedThisWeek: number;
  tasksCompletedPreviousWeek: number;
  activeStreakDays: number;
  momentumScore: number | null;
  // Lifetime XP — single source of truth, mirrors lib/scorecard.ts getFounderScorecard().xp.
  // Previously this field didn't exist at all, which is why the Weekly Report's
  // "Total XP" tile always called getXP() (a client-side localStorage cache that
  // only gets populated by a separate, unrelated syncXP() call) instead of reading
  // real server data through this metrics object like every other tile does.
  totalXP: number;
  focusData: { label: string; value: number; color: string }[];
  wins: string[];
  nextFocus: string[];
  // ── Weekly loop feed fields ───────────────────────────────────────────────
  // The single number that matters: what you committed vs what you did
  intention_vs_execution_rate: number | null; // 0-100%
  previous_intention_vs_execution_rate: number | null; // previous week for trend
  execution_trend: "up" | "down" | "flat";
  // Avoidance pattern detected this week (if any)
  avoidance_pattern: string | null;
//ISO date strings (YYYY-MM-DD) of every active day in the last 4 weeks.
//Powers the DotCalendar on the Reports page.
   activeDays: string[];
 };

export type BuildMindNotification = {
  id: string;
  user_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

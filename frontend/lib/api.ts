"use client";

import axios, { AxiosError } from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "evolvai_jwt";
const ACTIVE_PROJECT_ID_KEY = "evolvai_active_project_id";
const HAS_LOGGED_IN_KEY = "evolvai_has_logged_in";
const TOUR_SHOW_KEY = "evolvai_show_tour";
const TOUR_SEEN_KEY = "evolvai_tour_seen";
const ONBOARDED_KEY = "evolvai_onboarded";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

export type AuthData = {
  access_token: string;
  token_type: string;
};

export type UserData = {
  id: number;
  username?: string | null;
  email: string;
  bio?: string | null;
  avatar_url?: string | null;
  onboarding_completed?: boolean;
  role?: "admin" | "user";
  created_at: string;
};

export type TaskData = {
  id: number;
  description: string;
  is_completed: boolean;
  completed_at: string | null;
};

export type MilestoneData = {
  id: number;
  title: string;
  week_number: number;
  is_completed: boolean;
  tasks: TaskData[];
};

export type ProjectData = {
  id: number;
  user_id: number;
  title: string;
  description: string;
  created_at: string;
  milestones: MilestoneData[];
  is_public?: boolean;
  likes?: number;
  followers?: number;
};

export type DashboardScoreSnapshot = {
  id: number;
  score: number;
  calculated_at: string;
};

export type DashboardData = {
  user_id: number;
  project_count: number;
  milestone_count: number;
  task_count: number;
  task_completion_rate: number;
  weekly_consistency: number;
  milestone_completion_rate: number;
  feedback_positivity_ratio: number;
  execution_score: number;
  score_history: DashboardScoreSnapshot[];
};

export type ScoringData = {
  execution_score: number;
  components: {
    task_completion_rate: number;
    weekly_consistency: number;
    milestone_completion_rate: number;
    feedback_positivity_ratio: number;
  };
  history: DashboardScoreSnapshot[];
};

export type ExecutionScoreAnalyticsData = {
  score: number;
  completion_rate: number;
  weekly_consistency: number;
  velocity: number;
  focus_score: number;
  chart_data: {
    execution_score_trend: Array<{ date: string; score: number }>;
    weekly_task_completion: Array<{ date: string; tasks_completed: number }>;
    milestone_progress: Array<{ date: string; milestones_completed: number }>;
  };
};

export type WeeklyReportData = {
  start_date: string;
  end_date: string;
  execution_score_trend: Array<{ date: string; score: number }>;
  weekly_task_completion: Array<{ date: string; completion_rate: number; tasks_completed: number }>;
  milestone_achievement: Array<{ date: string; count: number }>;
  tasks_completed_this_week: number;
  feedback: { positive: number; negative: number; positive_ratio: number };
};

export type ReminderPreferenceData = {
  user_id: number;
  reminder_time: string;
  enabled: boolean;
  updated_at: string;
  last_triggered_at: string | null;
};

export type ActivityData = {
  id: number;
  user_id: number;
  activity_type: string;
  reference_id: number | null;
  created_at: string;
};

export type NotificationData = {
  id: number;
  user_id: number;
  type: string;
  message: string;
  reference_id: number | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationPreferenceData = {
  user_id: number;
  feedback_received: boolean;
  milestone_completed: boolean;
  task_assigned: boolean;
  updated_at: string;
};

export type BuildmindDashboardData = {
  execution_score: number;
  execution_streak: number;
  journey_progress: number;
  active_projects: Array<{ id: number; title: string; progress: number; stage: string }>;
  recent_activity: ActivityData[];
  notifications: NotificationData[];
  next_actions: Array<{ task_id: number; title: string; priority: string; due_date: string | null }>;
  weekly_progress: { tasks_completed: number; milestones_completed: number };
};

export type ProjectFeedbackData = {
  id: number;
  user_id: number;
  project_id: number | null;
  task_id: number | null;
  feedback_type: string | null;
  rating: number | null;
  category: string | null;
  comment: string | null;
  created_at: string;
};

export type FeedbackGateStatusData = {
  feedback_given: number;
  required: number;
  unlocked: boolean;
  message: string;
};

export type AdminAnalyticsData = {
  total_users: number;
  total_projects: number;
  total_milestones: number;
  total_tasks: number;
  daily_active_users: number;
  user_growth: Array<{ date: string; count: number }>;
  project_creation_trends: Array<{ date: string; count: number }>;
  task_completion_rates: Array<{ label: string; rate: number }>;
};

export type AdminUserData = {
  id: number;
  username: string | null;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  project_count: number;
};

export type AdminProjectData = {
  id: number;
  user_id: number;
  title: string;
  progress: number;
  stage: string;
  is_archived: boolean;
  created_at: string;
  owner_email: string;
  milestones_count: number;
};

export type AdminAiUsageData = {
  user_id: number;
  user_email: string;
  requests: number;
  tokens_used: number;
  last_activity: string | null;
};

export type NewsletterSubscriberData = {
  id: number;
  email: string;
  subscribed: boolean;
  created_at: string;
};

export type PublicProjectUpdateData = {
  id: number;
  project_id: number;
  user_id: number;
  content: string;
  created_at: string;
};

export type PublicProjectCommentData = {
  id: number;
  project_id: number;
  author_name?: string | null;
  content: string;
  created_at: string;
};

export type PublicProjectData = {
  id: number;
  title: string;
  description: string | null;
  progress: number;
  milestones_completed: number;
  milestones_total: number;
  likes: number;
  followers: number;
  is_public: boolean;
  founder_name: string;
  founder_username?: string | null;
  created_at: string;
};

export type PublicProjectDetailData = {
  id: number;
  title: string;
  description: string | null;
  problem?: string | null;
  target_users?: string | null;
  progress: number;
  likes: number;
  followers: number;
  is_public: boolean;
  founder_name: string;
  founder_username?: string | null;
  created_at: string;
  milestones: Array<{
    id: number;
    title: string;
    status: string;
    is_completed: boolean;
    tasks: Array<{ id: number; title: string; is_completed: boolean }>;
  }>;
  updates: PublicProjectUpdateData[];
  comments?: PublicProjectCommentData[];
};

export type FounderProfileData = {
  id: number;
  username?: string | null;
  email: string;
  bio?: string | null;
  avatar_url?: string | null;
  followers: number;
  projects: PublicProjectData[];
  recent_updates: PublicProjectUpdateData[];
};

export type SearchResultsData = {
  projects: Array<{ id: number; title: string }>;
  milestones: Array<{ id: number; title: string; project_id: number }>;
  tasks: Array<{ id: number; title: string; project_id: number }>;
};

export type FounderWeeklyReportData = {
  week_start_date: string;
  projects_count: number;
  milestones_completed: number;
  tasks_completed: number;
  ai_summary?: string | null;
  ai_risks?: string | null;
  ai_suggestions?: string | null;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

function normalizeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<{ detail?: string; error?: string }>;
    return e.response?.data?.detail || e.response?.data?.error || e.message;
  }
  return "Request failed";
}

async function unwrap<T>(request: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const response = await request;
    return response.data.data;
  } catch (err) {
    throw new Error(normalizeError(err));
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDED_KEY) === "1";
}

export function setOnboarded(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDED_KEY, "1");
}

export function shouldShowTour(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TOUR_SHOW_KEY) === "1";
}

export function markTourSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  window.localStorage.removeItem(TOUR_SHOW_KEY);
}

export function getActiveProjectId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setActiveProjectId(projectId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(projectId));
}

export async function registerUser(email: string, password: string): Promise<UserData> {
  return unwrap(api.post<ApiEnvelope<UserData>>("/auth/register", { email, password }));
}

export async function loginUser(email: string, password: string): Promise<AuthData> {
  const data = await unwrap(api.post<ApiEnvelope<AuthData>>("/auth/login", { email, password }));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, data.access_token);
    const hasLoggedIn = window.localStorage.getItem(HAS_LOGGED_IN_KEY) === "1";
    if (!hasLoggedIn && window.localStorage.getItem(TOUR_SEEN_KEY) !== "1") {
      window.localStorage.setItem(TOUR_SHOW_KEY, "1");
    }
    window.localStorage.setItem(HAS_LOGGED_IN_KEY, "1");
  }
  return data;
}

export async function getProjects(): Promise<ProjectData[]> {
  return unwrap(api.get<ApiEnvelope<ProjectData[]>>("/projects"));
}

export async function createProject(title: string, description: string): Promise<ProjectData> {
  return unwrap(api.post<ApiEnvelope<ProjectData>>("/projects", { title, description }));
}

export async function updateProject(
  projectId: number,
  payload: {
    title?: string;
    description?: string;
    problem?: string;
    target_users?: string;
    progress?: number;
  },
): Promise<ProjectData> {
  return unwrap(api.patch<ApiEnvelope<ProjectData>>(`/projects/${projectId}`, payload));
}

export async function deleteProject(projectId: number): Promise<{ message: string }> {
  return unwrap(api.delete<ApiEnvelope<{ message: string }>>(`/projects/${projectId}`));
}

export async function archiveProject(projectId: number): Promise<{ id: number; is_archived: boolean; archived_at: string | null }> {
  return unwrap(api.post<ApiEnvelope<{ id: number; is_archived: boolean; archived_at: string | null }>>(`/projects/${projectId}/archive`));
}

export async function generateRoadmap(projectId: number, goalDurationWeeks: number): Promise<ProjectData> {
  return unwrap(
    api.post<ApiEnvelope<ProjectData>>(`/projects/${projectId}/generate-roadmap`, {
      goal_duration_weeks: goalDurationWeeks,
    }),
  );
}

export async function getProject(projectId: number): Promise<ProjectData> {
  return unwrap(api.get<ApiEnvelope<ProjectData>>(`/projects/${projectId}`));
}

export async function completeTask(taskId: number): Promise<TaskData> {
  return unwrap(api.post<ApiEnvelope<TaskData>>(`/tasks/${taskId}/complete`));
}

export async function createFeedback(taskId: number, feedbackType: "positive" | "negative"): Promise<void> {
  await unwrap(api.post<ApiEnvelope<{ id: number }>>("/feedback", { task_id: taskId, feedback_type: feedbackType }));
}

export async function createProjectFeedback(projectId: number, rating: number, category: "product" | "UX" | "growth" | "monetization", comment: string): Promise<ProjectFeedbackData> {
  return unwrap(api.post<ApiEnvelope<ProjectFeedbackData>>("/feedback", { project_id: projectId, rating, category, comment }));
}

export async function getProjectFeedback(projectId: number): Promise<ProjectFeedbackData[]> {
  return unwrap(api.get<ApiEnvelope<ProjectFeedbackData[]>>(`/projects/${projectId}/feedback`));
}

export async function getFeedbackGateStatus(): Promise<FeedbackGateStatusData> {
  return unwrap(api.get<ApiEnvelope<FeedbackGateStatusData>>("/feedback/unlock-status"));
}

export async function requestProjectFeedback(projectId: number): Promise<{ project_id: number; requested: boolean; message: string }> {
  return unwrap(api.post<ApiEnvelope<{ project_id: number; requested: boolean; message: string }>>(`/projects/${projectId}/request-feedback`));
}

export async function getDashboard(): Promise<DashboardData> {
  return unwrap(api.get<ApiEnvelope<DashboardData>>("/dashboard"));
}

export async function getScoring(): Promise<ScoringData> {
  return unwrap(api.get<ApiEnvelope<ScoringData>>("/scoring"));
}

export async function getExecutionScoreAnalytics(): Promise<ExecutionScoreAnalyticsData> {
  try {
    const response = await api.get<ExecutionScoreAnalyticsData | ApiEnvelope<ExecutionScoreAnalyticsData>>("/analytics/execution-score");
    const body = response.data as ExecutionScoreAnalyticsData | ApiEnvelope<ExecutionScoreAnalyticsData>;
    if (typeof body === "object" && body !== null && "success" in body) {
      return (body as ApiEnvelope<ExecutionScoreAnalyticsData>).data;
    }
    return body as ExecutionScoreAnalyticsData;
  } catch (err) {
    throw new Error(normalizeError(err));
  }
}

export async function getWeeklyReport(): Promise<WeeklyReportData> {
  return unwrap(api.get<ApiEnvelope<WeeklyReportData>>("/report/weekly"));
}

export async function getReminderPreference(): Promise<ReminderPreferenceData | null> {
  return unwrap(api.get<ApiEnvelope<ReminderPreferenceData | null>>("/reminders"));
}

export async function saveReminderPreference(reminderTime: string, enabled: boolean): Promise<ReminderPreferenceData> {
  return unwrap(api.post<ApiEnvelope<ReminderPreferenceData>>("/reminders", { reminder_time: reminderTime, enabled }));
}

export async function getBuildmindDashboard(): Promise<BuildmindDashboardData> {
  return unwrap(api.get<ApiEnvelope<BuildmindDashboardData>>("/dashboard/buildmind"));
}

export async function getActivity(): Promise<ActivityData[]> {
  return unwrap(api.get<ApiEnvelope<ActivityData[]>>("/activity"));
}

export async function getNotifications(): Promise<NotificationData[]> {
  return unwrap(api.get<ApiEnvelope<NotificationData[]>>("/notifications"));
}

export async function markNotificationRead(notificationId: number): Promise<NotificationData> {
  return unwrap(api.patch<ApiEnvelope<NotificationData>>(`/notifications/${notificationId}/read`));
}

export async function getNotificationPreferences(): Promise<NotificationPreferenceData> {
  return unwrap(api.get<ApiEnvelope<NotificationPreferenceData>>("/notifications/preferences"));
}

export async function saveNotificationPreferences(
  feedbackReceived: boolean,
  milestoneCompleted: boolean,
  taskAssigned: boolean,
): Promise<NotificationPreferenceData> {
  return unwrap(
    api.post<ApiEnvelope<NotificationPreferenceData>>("/notifications/preferences", {
      feedback_received: feedbackReceived,
      milestone_completed: milestoneCompleted,
      task_assigned: taskAssigned,
    }),
  );
}

export async function subscribeNewsletter(email: string): Promise<NewsletterSubscriberData> {
  return unwrap(api.post<ApiEnvelope<NewsletterSubscriberData>>("/newsletter/subscribe", { email }));
}

export async function unsubscribeNewsletter(email: string): Promise<NewsletterSubscriberData> {
  return unwrap(api.post<ApiEnvelope<NewsletterSubscriberData>>("/newsletter/unsubscribe", { email }));
}

export async function getCurrentUser(): Promise<UserData> {
  return unwrap(api.get<ApiEnvelope<UserData>>("/auth/me"));
}

export async function updateCurrentUser(payload: {
  username?: string;
  bio?: string;
  avatar_url?: string;
  onboarding_completed?: boolean;
}): Promise<UserData> {
  return unwrap(api.patch<ApiEnvelope<UserData>>("/auth/me", payload));
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return unwrap(
    api.post<ApiEnvelope<{ message: string }>>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  );
}

export async function deleteCurrentAccount(): Promise<{ message: string }> {
  return unwrap(api.delete<ApiEnvelope<{ message: string }>>("/auth/me"));
}

export async function createTask(
  milestoneId: number,
  payload: { title: string; description: string; status?: string; priority?: string; due_date?: string | null },
): Promise<TaskData> {
  return unwrap(api.post<ApiEnvelope<TaskData>>(`/milestones/${milestoneId}/tasks`, payload));
}

export async function updateTask(
  taskId: number,
  payload: { title?: string; description?: string; status?: string; priority?: string; due_date?: string | null },
): Promise<TaskData> {
  return unwrap(api.patch<ApiEnvelope<TaskData>>(`/tasks/${taskId}`, payload));
}

export async function deleteTask(taskId: number): Promise<{ message: string }> {
  return unwrap(api.delete<ApiEnvelope<{ message: string }>>(`/tasks/${taskId}`));
}

export async function updateMilestone(
  milestoneId: number,
  payload: { title?: string; status?: string; order_index?: number },
): Promise<{ id: number; title: string; status: string; order_index: number; completed_at: string | null; is_completed: boolean }> {
  return unwrap(
    api.patch<
      ApiEnvelope<{ id: number; title: string; status: string; order_index: number; completed_at: string | null; is_completed: boolean }>
    >(`/milestones/${milestoneId}`, payload),
  );
}

export async function reorderMilestones(
  projectId: number,
  items: Array<{ milestone_id: number; order_index: number }>,
): Promise<Array<{ id: number; title: string; order_index: number; status: string }>> {
  return unwrap(api.post<ApiEnvelope<Array<{ id: number; title: string; order_index: number; status: string }>>>(`/projects/${projectId}/milestones/reorder`, { items }));
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  return unwrap(api.get<ApiEnvelope<AdminAnalyticsData>>("/admin/dashboard"));
}

export async function getAdminUsers(search?: string): Promise<AdminUserData[]> {
  return unwrap(api.get<ApiEnvelope<AdminUserData[]>>("/admin/users", { params: search ? { q: search } : undefined }));
}

export async function suspendAdminUser(userId: number): Promise<{ id: number; is_active: boolean }> {
  return unwrap(api.patch<ApiEnvelope<{ id: number; is_active: boolean }>>(`/admin/users/${userId}/suspend`));
}

export async function promoteAdminUser(userId: number): Promise<{ id: number; is_admin: boolean }> {
  return unwrap(api.patch<ApiEnvelope<{ id: number; is_admin: boolean }>>(`/admin/users/${userId}/promote`));
}

export async function deleteAdminUser(userId: number): Promise<{ message: string }> {
  return unwrap(api.delete<ApiEnvelope<{ message: string }>>(`/admin/users/${userId}`));
}

export async function getAdminProjects(stage?: string): Promise<AdminProjectData[]> {
  return unwrap(api.get<ApiEnvelope<AdminProjectData[]>>("/admin/projects", { params: stage ? { stage } : undefined }));
}

export async function getAdminFeedback(sort: "created_at" | "rating" = "created_at"): Promise<ProjectFeedbackData[]> {
  return unwrap(api.get<ApiEnvelope<ProjectFeedbackData[]>>("/admin/feedback", { params: { sort } }));
}

export async function deleteAdminFeedback(feedbackId: number): Promise<{ message: string }> {
  return unwrap(api.delete<ApiEnvelope<{ message: string }>>(`/admin/feedback/${feedbackId}`));
}

export async function getAdminNewsletter(): Promise<NewsletterSubscriberData[]> {
  return unwrap(api.get<ApiEnvelope<NewsletterSubscriberData[]>>("/admin/newsletter"));
}

export async function getAdminNewsletterExport(): Promise<{ emails: string[]; count: number }> {
  return unwrap(api.get<ApiEnvelope<{ emails: string[]; count: number }>>("/admin/newsletter/export"));
}

export async function getAdminActivity(): Promise<ActivityData[]> {
  return unwrap(api.get<ApiEnvelope<ActivityData[]>>("/admin/activity"));
}

export async function getAdminAiUsage(): Promise<AdminAiUsageData[]> {
  return unwrap(api.get<ApiEnvelope<AdminAiUsageData[]>>("/admin/ai-usage"));
}

export async function getAdminSystemSettings(): Promise<Array<{ key: string; value_json: string }>> {
  return unwrap(api.get<ApiEnvelope<Array<{ key: string; value_json: string }>>>("/admin/system-settings"));
}

export async function saveAdminSystemSetting(key: string, valueJson: string): Promise<{ key: string; value_json: string }> {
  return unwrap(api.post<ApiEnvelope<{ key: string; value_json: string }>>("/admin/system-settings", { key, value_json: valueJson }));
}

export async function sendAdminNotification(
  message: string,
  type = "platform_announcement",
): Promise<{ sent_count: number; message: string; type: string }> {
  return unwrap(api.post<ApiEnvelope<{ sent_count: number; message: string; type: string }>>("/admin/notifications", { message, type }));
}

export async function getPublicProjects(): Promise<PublicProjectData[]> {
  return unwrap(api.get<ApiEnvelope<PublicProjectData[]>>("/projects/public"));
}

export async function getPublicProject(projectId: number): Promise<PublicProjectDetailData> {
  return unwrap(api.get<ApiEnvelope<PublicProjectDetailData>>(`/projects/${projectId}/public`));
}

export async function likePublicProject(projectId: number): Promise<{ id: number; likes: number }> {
  return unwrap(api.post<ApiEnvelope<{ id: number; likes: number }>>(`/projects/${projectId}/like`));
}

export async function followPublicProject(projectId: number): Promise<{ id: number; followers: number }> {
  return unwrap(api.post<ApiEnvelope<{ id: number; followers: number }>>(`/projects/${projectId}/follow`));
}

export async function addProjectUpdate(projectId: number, content: string): Promise<PublicProjectUpdateData> {
  return unwrap(api.post<ApiEnvelope<PublicProjectUpdateData>>(`/projects/${projectId}/update`, { content }));
}

export async function addProjectComment(
  projectId: number,
  payload: { author_name?: string; content: string },
): Promise<PublicProjectCommentData> {
  return unwrap(api.post<ApiEnvelope<PublicProjectCommentData>>(`/projects/${projectId}/comment`, payload));
}

export async function getFounderProfile(username: string): Promise<FounderProfileData> {
  return unwrap(api.get<ApiEnvelope<FounderProfileData>>(`/founder/${username}`));
}

export async function searchGlobal(query: string): Promise<SearchResultsData> {
  return unwrap(api.get<ApiEnvelope<SearchResultsData>>("/search", { params: { q: query } }));
}

export async function getFounderWeeklyReport(): Promise<FounderWeeklyReportData> {
  return unwrap(api.get<ApiEnvelope<FounderWeeklyReportData>>("/reports/weekly"));
}

export async function getAICoachResponse(projectId: number, question: string): Promise<{ message: string }> {
  return unwrap(api.post<ApiEnvelope<{ message: string }>>("/ai/coach", { projectId, question }));
}

export async function generateMilestonesAI(idea: string): Promise<{ message: string; milestones: string[] }> {
  return unwrap(api.post<ApiEnvelope<{ message: string; milestones: string[] }>>("/ai/milestones", { idea }));
}

"use client";

import axios, { AxiosError } from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "evolvai_jwt";
const ACTIVE_PROJECT_ID_KEY = "evolvai_active_project_id";

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
  email: string;
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
  return unwrap(api.post<ApiEnvelope<UserData>>("/register", { email, password }));
}

export async function loginUser(email: string, password: string): Promise<AuthData> {
  const data = await unwrap(api.post<ApiEnvelope<AuthData>>("/login", { email, password }));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, data.access_token);
  }
  return data;
}

export async function createProject(title: string, description: string): Promise<ProjectData> {
  return unwrap(api.post<ApiEnvelope<ProjectData>>("/projects", { title, description }));
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

export async function getDashboard(): Promise<DashboardData> {
  return unwrap(api.get<ApiEnvelope<DashboardData>>("/dashboard"));
}

export async function getScoring(): Promise<ScoringData> {
  return unwrap(api.get<ApiEnvelope<ScoringData>>("/scoring"));
}

"use client";

import { storage } from "@/lib/storage";

// ─── localStorage keys ────────────────────────────────────────────────────────
const TOKEN_KEY             = "buildmind_jwt";
const HAS_LOGGED_IN_KEY     = "buildmind_has_logged_in";
const TOUR_SHOW_KEY         = "buildmind_show_tour";
const TOUR_SEEN_KEY         = "buildmind_tour_seen";

// User-scoped keys — accessed via storage module (namespaced per user)
const ONBOARDED_KEY         = "buildmind_onboarded";
const ACTIVE_PROJECT_ID_KEY = "buildmind_active_project_id";
export const ACTIVE_PROJECT_CHANGED_EVENT = "bm_active_project_changed";

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  // TOKEN_KEY is intentionally raw localStorage — it's read before any user
  // is authenticated, so the storage module's user-scoping cannot apply.
  return window.localStorage.getItem(TOKEN_KEY);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  // Same rationale as above — pre-auth global key.
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return storage.get(ONBOARDED_KEY) === "1";
}

export function setOnboarded(): void {
  if (typeof window === "undefined") return;
  storage.set(ONBOARDED_KEY, "1");
}

export function shouldShowTour(): boolean {
  if (typeof window === "undefined") return false;
  return storage.get(TOUR_SHOW_KEY) === "1";
}

export function markTourSeen(): void {
  if (typeof window === "undefined") return;
  storage.set(TOUR_SEEN_KEY, "1");
  storage.remove(TOUR_SHOW_KEY);
}

export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return storage.get(ACTIVE_PROJECT_ID_KEY);
}

export function setActiveProjectId(projectId: string): void {
  if (typeof window === "undefined") return;
  storage.set(ACTIVE_PROJECT_ID_KEY, projectId);
  window.dispatchEvent(new CustomEvent(ACTIVE_PROJECT_CHANGED_EVENT, { detail: { projectId } }));
}

/** Call after first successful login to trigger the product tour on next open. */
export function markFirstLogin(): void {
  if (typeof window === "undefined") return;
  const hasLoggedIn = storage.get(HAS_LOGGED_IN_KEY) === "1";
  if (!hasLoggedIn && storage.get(TOUR_SEEN_KEY) !== "1") {
    storage.set(TOUR_SHOW_KEY, "1");
  }
  storage.set(HAS_LOGGED_IN_KEY, "1");
}

// ─── Types (shared across the app) ───────────────────────────────────────────

export type SearchResultsData = {
  projects:   Array<{ id: string | number; title: string }>;
  milestones: Array<{ id: string | number; title: string; project_id: string | number }>;
  tasks:      Array<{ id: string | number; title: string; project_id: string | number }>;
};

export type PublicProjectCommentData = {
  id: number;
  project_id: number;
  author_name?: string | null;
  content: string;
  created_at: string;
};

export type PublicProjectUpdateData = {
  id: number;
  project_id: number;
  user_id: number;
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

export type BreakMyStartupAnalysis = {
    failureReasons: { num: number; title: string; body: string; evidence: string; severity?: "low" | "medium" | "high" | "fatal" | string }[];
  competitors: Array<{
    name: string;
    description: string;
    betterAt: string[];
    successRate: number;
    yourSuccessRate: number;
    source: string;
  }>;
  yourMoat?: string;
  closingStatement: string;
};

export type BreakMyStartupResult = {
  analysis: BreakMyStartupAnalysis;
  webSearchUsed: boolean;
  searchResultCount: number;
  competitors_scraped: boolean;
  /** "ddg" | "brave" | "ai_synthesised" | "none" — indicates whether competitor data was live-scraped or AI-inferred */
  competitor_data_source?: string;
  projectContext: {
    founder?: string;
    project?: {
      title?: string;
      description?: string;
      problem?: string;
      target_users?: string;
      stage?: string;
      days_in_stage?: number;
    };
    execution?: { score?: number; total_tasks?: number; completed_tasks?: number };
    validation?: { users_interviewed?: number };
  };
};

// ─── Next.js API route wrappers ───────────────────────────────────────────────
// These call internal /api/* routes, not any external backend.

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function breakMyStartup(projectId?: number): Promise<BreakMyStartupResult> {
  return apiFetch<BreakMyStartupResult>("/api/ai/break-my-startup", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function searchGlobal(query: string): Promise<SearchResultsData> {
  return apiFetch<SearchResultsData>(`/api/search?q=${encodeURIComponent(query)}`);
}

export async function getPublicProject(projectId: number): Promise<PublicProjectDetailData> {
  return apiFetch<PublicProjectDetailData>(`/api/projects/${projectId}/public`);
}

export async function addProjectComment(
  projectId: number,
  payload: { author_name?: string; content: string },
): Promise<PublicProjectCommentData> {
  return apiFetch<PublicProjectCommentData>(`/api/projects/${projectId}/comment`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getFounderProfile(username: string): Promise<FounderProfileData> {
  return apiFetch<FounderProfileData>(`/api/founder/${username}`);
}

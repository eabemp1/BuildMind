/**
 * lib/usePlan.ts — Server-authoritative plan hook
 *
 * WHY THIS EXISTS:
 *   lib/plan.ts getPlan() reads from localStorage["bm_plan"]. On a shared
 *   device (family phone, school computer), if User A logs out and User B
 *   logs in, User B inherits User A's plan tier and usage counts because
 *   localStorage is per-origin, not per-account.
 *
 *   This hook fetches plan from /api/billing/status (which reads Supabase
 *   auth user_metadata server-side) and is the single source of truth for
 *   all gating decisions. localStorage is used only as a cache for the
 *   initial paint — it is always overwritten by the server response.
 *
 * USAGE:
 *   const { plan, limits, isLoading } = usePlan();
 *   // plan is always server-verified after the first fetch
 *   // During loading, falls back to "free" (safe default — never over-grants)
 *
 * AI USAGE LIMITS:
 *   Daily AI message counts are namespaced by userId so they don't bleed
 *   between accounts: `bm_ai_${userId}_${dayKey}`.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePlan, PLAN_LIMITS, type Plan, type PlanLimits } from "@/lib/plan";
import { storage } from "@/lib/storage";

interface PlanState {
  plan: Plan;
  limits: PlanLimits;
  isLoading: boolean;
  userId: string | null;
  // Trial fields — from billing/status
  trialActive: boolean;
  trialExpired: boolean;
  trialDaysRemaining: number;
}

const DEFAULT_STATE: PlanState = {
  plan: "free",
  limits: PLAN_LIMITS.free,
  isLoading: true,
  userId: null,
  trialActive: false,
  trialExpired: false,
  trialDaysRemaining: 0,
};

// Module-level cache so repeated hook uses don't re-fetch within the same
// page session. Invalidated on userId change.
let cachedUserId: string | null = null;
let cachedPlan: Plan = "free";
let fetchPromise: Promise<{ plan: Plan; userId: string | null }> | null = null;

async function fetchPlanFromServer(): Promise<{ plan: Plan; userId: string | null; trialActive: boolean; trialExpired: boolean; trialDaysRemaining: number }> {
  try {
    // Get userId first from Supabase client (fast — uses local session)
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;

    if (!userId) {
      if (typeof window !== "undefined") {
        storage.onSignOut();
      }
      return { plan: "free", userId: null, trialActive: false, trialExpired: false, trialDaysRemaining: 0 };
    }

    // Fetch authoritative plan from server (reads Supabase auth metadata)
    const res = await fetch("/api/billing/status", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!res.ok) {
      // Server error — fall back to "free" (safe)
      return { plan: "free", userId, trialActive: false, trialExpired: false, trialDaysRemaining: 0 };
    }

    const payload = await res.json().catch(() => null) as {
      ok?: boolean;
      plan?: string;
      trial?: { active?: boolean; expired?: boolean; daysRemaining?: number };
    } | null;

    const plan = normalizePlan(payload?.ok ? (payload.plan ?? null) : null);
    const trialActive = payload?.trial?.active ?? false;
    const trialExpired = payload?.trial?.expired ?? false;
    const trialDaysRemaining = payload?.trial?.daysRemaining ?? 0;

    // Cache via scoped storage so it survives page refresh but is per-account.
    if (typeof window !== "undefined") {
      storage.onSignIn(userId);
      storage.setPlan(plan);
    }

    return { plan, userId, trialActive, trialExpired, trialDaysRemaining };
  } catch {
    return { plan: "free", userId: null };
  }
}

export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>(() => {
    // Synchronous initial state — can't call async here.
    // We read from localStorage immediately for a fast first paint,
    // but we do NOT trust the generic "bm_plan" key (could be another user's).
    // We'll get the userId asynchronously and swap to the namespaced key.
    return DEFAULT_STATE;
  });

  const refresh = useCallback(async () => {
    const applyPlan = ({ plan, userId, trialActive, trialExpired, trialDaysRemaining }: { plan: Plan; userId: string | null; trialActive: boolean; trialExpired: boolean; trialDaysRemaining: number }) => {
      cachedUserId = userId;
      cachedPlan = plan;
      setState({
        plan,
        limits: PLAN_LIMITS[plan],
        isLoading: false,
        userId,
        trialActive,
        trialExpired,
        trialDaysRemaining,
      });
    };

    if (fetchPromise) {
      const result = await fetchPromise;
      applyPlan(result);
      return;
    }

    fetchPromise = fetchPlanFromServer();

    try {
      const result = await fetchPromise;
      applyPlan(result);
    } catch {
      setState(s => ({ ...s, isLoading: false, trialActive: false, trialExpired: false, trialDaysRemaining: 0 }));
    } finally {
      fetchPromise = null;
    }

    return;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshFromEvent = () => {
      void refresh();
    };
    window.addEventListener("bm_plan_changed", refreshFromEvent);
    window.addEventListener("focus", refreshFromEvent);
    document.addEventListener("visibilitychange", refreshFromEvent);
    return () => {
      window.removeEventListener("bm_plan_changed", refreshFromEvent);
      window.removeEventListener("focus", refreshFromEvent);
      document.removeEventListener("visibilitychange", refreshFromEvent);
    };
  }, [refresh]);

  return state;
}

// ── Per-user AI message tracking ────────────────────────────────────────────
// All functions below are namespaced by userId to prevent cross-account bleed.

function aiDayKey(userId: string): string {
  const d = new Date();
  return `bm_ai_${userId}_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function getAIMessagesTodayForUser(userId: string): number {
  if (typeof window === "undefined" || !userId) return 0;
  storage.onSignIn(userId);
  return storage.getAIMessagesToday();
}

export function recordAIMessageForUser(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  storage.onSignIn(userId);
  storage.recordAIMessage();
}

// ── Per-user action tracking ─────────────────────────────────────────────────

function weekKey(): string {
  const d = new Date();
  const j = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}_w${Math.ceil(((d.getTime() - j.getTime()) / 86400000 + j.getDay() + 1) / 7)}`;
}

export function getActionsThisWeekForUser(userId: string): number {
  if (typeof window === "undefined" || !userId) return 0;
  storage.onSignIn(userId);
  return storage.getActionsThisWeek();
}

export function recordWeeklyActionForUser(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  storage.onSignIn(userId);
  storage.recordWeeklyAction();
}

// ── Helper to get plan from storage cache (for SSR-safe reads) ──────────
// Only reads the namespaced key. Returns "free" if not found or no userId.
export function getCachedPlanForUser(userId: string | null): Plan {
  if (!userId || typeof window === "undefined") return "free";
  storage.onSignIn(userId);
  return normalizePlan(storage.getPlan());
}

"use client";

import posthog from "posthog-js";

let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  if (!key) return;

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,   // We handle pageviews manually via PostHogPageView
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: true,     // GDPR: mask passwords, emails in recordings
    },
    persistence: "localStorage+cookie",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug();
    },
  });

  initialized = true;
}

export function identifyUser(userId: string, email?: string | null) {
  if (!initialized) return;
  posthog.identify(userId, {
    email: email ?? undefined,
    app: "buildmind",
  });
}

export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

// Typed event helpers — use these instead of bare trackEvent calls
export const analytics = {
  userSignedIn: (userId: string) => trackEvent("user_signed_in", { user_id: userId }),
  userSignedUp: (userId: string) => trackEvent("user_signed_up", { user_id: userId }),
  onboardingCompleted: (projectId: string) => trackEvent("onboarding_completed", { project_id: projectId }),
  todayActionCompleted: (stage: string) => trackEvent("today_action_completed", { stage }),
  messageCopied: (stage: string) => trackEvent("message_copied", { stage }),
  aiCoachUsed: (projectId: string) => trackEvent("ai_coach_used", { project_id: projectId }),
  breakStartupRun: (projectId: string) => trackEvent("break_startup_run", { project_id: projectId }),
  upgradeViewed: (source: string) => trackEvent("upgrade_viewed", { source }),
  upgradeClicked: (source: string) => trackEvent("upgrade_clicked", { source }),
  projectCreated: (projectId: string) => trackEvent("project_created", { project_id: projectId }),
  taskCompleted: (milestoneId: string) => trackEvent("task_completed", { milestone_id: milestoneId }),
};

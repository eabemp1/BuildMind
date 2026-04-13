/**
 * lib/onboarding-analytics.ts — Funnel & Drop-off Tracker
 *
 * Tracks where users drop off in the onboarding funnel and in-app.
 * All data is localStorage-based (no backend needed).
 * Owner Panel reads this for the analytics tab.
 *
 * Funnel steps (in order):
 *   landing → signup → onboarding_start → onboarding_idea →
 *   onboarding_stage → onboarding_complete → first_today →
 *   first_action_done → first_reflect → first_report →
 *   upgrade_seen → upgrade_converted
 */

export type FunnelStep =
  | "landing"
  | "signup"
  | "onboarding_start"
  | "onboarding_idea"
  | "onboarding_stage"
  | "onboarding_complete"
  | "first_today"
  | "first_action_done"
  | "first_reflect"
  | "first_report"
  | "upgrade_seen"
  | "upgrade_converted";

export interface FunnelEvent {
  step: FunnelStep;
  ts: number;
  meta?: Record<string, string | number | boolean>;
}

export interface SessionEvent {
  type: string;
  page: string;
  ts: number;
  meta?: Record<string, string | number | boolean>;
}

const FUNNEL_KEY   = "bm_funnel";
const SESSION_KEY  = "bm_session_events";
const PAGE_KEY     = "bm_page_views";
const MAX_SESSIONS = 200;

// ── Funnel tracking ───────────────────────────────────────────────────────────

export function getFunnelEvents(): FunnelEvent[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FUNNEL_KEY) ?? "[]"); } catch { return []; }
}

export function trackFunnelStep(step: FunnelStep, meta?: FunnelEvent["meta"]): void {
  if (typeof window === "undefined") return;
  const events = getFunnelEvents();
  // Only record each step once (first occurrence matters)
  if (events.find(e => e.step === step)) return;
  events.push({ step, ts: Date.now(), meta });
  localStorage.setItem(FUNNEL_KEY, JSON.stringify(events));
}

export function getFunnelSummary(): {
  step: FunnelStep;
  reached: boolean;
  ts?: number;
  label: string;
  icon: string;
}[] {
  const events = getFunnelEvents();
  const reached = new Map(events.map(e => [e.step, e.ts]));

  const STEPS: { step: FunnelStep; label: string; icon: string }[] = [
    { step: "landing",             label: "Visited landing",       icon: "🌐" },
    { step: "signup",              label: "Signed up",             icon: "📝" },
    { step: "onboarding_start",    label: "Started onboarding",    icon: "🚪" },
    { step: "onboarding_idea",     label: "Entered idea",          icon: "💡" },
    { step: "onboarding_stage",    label: "Selected stage",        icon: "📊" },
    { step: "onboarding_complete", label: "Completed onboarding",  icon: "✅" },
    { step: "first_today",         label: "Visited Today page",    icon: "⚡" },
    { step: "first_action_done",   label: "Completed first action","icon": "🎯" },
    { step: "first_reflect",       label: "Reflected once",        icon: "🧠" },
    { step: "first_report",        label: "Viewed report",         icon: "📋" },
    { step: "upgrade_seen",        label: "Saw upgrade page",      icon: "💳" },
    { step: "upgrade_converted",   label: "Upgraded to Builder",   icon: "👑" },
  ];

  return STEPS.map(s => ({
    ...s,
    reached: reached.has(s.step),
    ts: reached.get(s.step),
  }));
}

// ── Page view tracking ────────────────────────────────────────────────────────

export interface PageView {
  path: string;
  count: number;
  lastVisit: number;
  firstVisit: number;
}

export function trackPageView(path: string): void {
  if (typeof window === "undefined") return;
  try {
    const views: Record<string, PageView> = JSON.parse(localStorage.getItem(PAGE_KEY) ?? "{}");
    const existing = views[path];
    const now = Date.now();
    views[path] = existing
      ? { ...existing, count: existing.count + 1, lastVisit: now }
      : { path, count: 1, firstVisit: now, lastVisit: now };
    localStorage.setItem(PAGE_KEY, JSON.stringify(views));
  } catch {}
}

export function getPageViews(): PageView[] {
  if (typeof window === "undefined") return [];
  try {
    const views: Record<string, PageView> = JSON.parse(localStorage.getItem(PAGE_KEY) ?? "{}");
    return Object.values(views).sort((a, b) => b.count - a.count);
  } catch { return []; }
}

// ── Session events ────────────────────────────────────────────────────────────

export function trackEvent(type: string, page: string, meta?: SessionEvent["meta"]): void {
  if (typeof window === "undefined") return;
  try {
    const events: SessionEvent[] = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "[]");
    events.unshift({ type, page, ts: Date.now(), meta });
    localStorage.setItem(SESSION_KEY, JSON.stringify(events.slice(0, MAX_SESSIONS)));
  } catch {}
}

export function getRecentEvents(limit = 20): SessionEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return (JSON.parse(localStorage.getItem(SESSION_KEY) ?? "[]") as SessionEvent[]).slice(0, limit);
  } catch { return []; }
}

// ── Drop-off analysis ─────────────────────────────────────────────────────────

export function getDropOffStep(): { step: FunnelStep | null; label: string } {
  const summary = getFunnelSummary();
  const lastReached = [...summary].reverse().find(s => s.reached);
  const nextStep = summary.find(s => !s.reached);

  if (!lastReached) return { step: null, label: "User hasn't started the funnel" };
  if (!nextStep) return { step: null, label: "Completed full funnel 🎉" };

  return { step: nextStep.step, label: `Dropped before: ${nextStep.label}` };
}

// ── Auto page tracker hook (call in layout) ───────────────────────────────────

export function usePageTracking(path: string): void {
  if (typeof window === "undefined") return;
  // Map paths to funnel steps
  const STEP_MAP: Partial<Record<string, FunnelStep>> = {
    "/landing":    "landing",
    "/":           "landing",
    "/onboarding": "onboarding_start",
    "/today":      "first_today",
    "/reports":    "first_report",
    "/upgrade":    "upgrade_seen",
  };
  const step = STEP_MAP[path];
  if (step) trackFunnelStep(step);
  trackPageView(path);
}

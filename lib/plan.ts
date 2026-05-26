/**
 * lib/plan.ts — Plan tier gating
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ACTIVE TIERS (this week — Playbook v4 §11, item 12):                  ║
 * ║    Free     → $0   (acquisition engine, limited)                       ║
 * ║    Builder  → $39  (the one paid tier to ship now)                     ║
 * ║                                                                        ║
 * ║  FUTURE TIERS — DO NOT ACTIVATE YET:                                   ║
 * ║    Operator → $39  opens to WAITLIST at Day 90, only if:               ║
 * ║                    briefing open rate > 35% AND task completion > 55%  ║
 * ║                    (Playbook §10, 30/60/90-Day Framework)              ║
 * ║    Founder  → $69  Month 6–7 (100 users with data)                    ║
 * ║    Chief of Staff → $120  Month 12+ (200 users, strong retention)      ║
 * ║                                                                        ║
 * ║  ACTIVE FEATURES (live — Playbook v4):                                 ║
 * ║    Founder Context Object, Reflexion Strike onboarding (v2),           ║
 * ║    Morning Briefing (3 days free / daily Builder),                     ║
 * ║    Evening Check, Cognitive Load Check-in, One Task Rule,              ║
 * ║    HITL Override, Momentum Score, Explainable Rationale,               ║
 * ║    Emotional Language Layer, Recovery Mode,                            ║
 * ║    Pattern Detection (lib/patternDetection.ts — fires from evening     ║
 * ║      check cron + task-complete route, Playbook §3.2),                 ║
 * ║    Agent Persona Rotation (weekly Critic rotation, lib/reflexion.ts),  ║
 * ║    Confidence Gate (lib/reflexion.ts §4.5),                            ║
 * ║    Behavioral Learning Loop (lib/learning.ts),                         ║
 * ║    Contextual Paywall Moments (components/PaywallMoment.tsx §6.2)      ║
 * ║                                                                        ║
 * ║  NOT YET — activate when metrics warrant (Playbook §10):               ║
 * ║    Weekly Mirror Moment, Shareable Scorecard,                          ║
 * ║    Ghost Competitor, Stress Test Arena, Accountability Pairing         ║
 * ║                                                                        ║
 * ║  NOT YET — Month 3+:                                                   ║
 * ║    Ventures Blueprint engine, CoFounder Blueprint mode                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { storage } from "@/lib/storage";

export type Plan = "free" | "builder";

/**
 * Future plan types — defined here so normalizePlan() can map legacy/future
 * values safely without breaking auth flows, but NOT exposed as active tiers.
 */
const FUTURE_PLANS = ["operator", "founder", "chiefofstaff"] as const;

export interface PlanLimits {
  // ── Core limits ────────────────────────────────────────────────────────────
  actionsPerWeek:             number;   // 5 on free (Playbook §6.1), -1 = unlimited
  aiMessagesPerDay:           number;   // 3 on free, -1 = unlimited
  historyDays:                number;
  maxProjects:                number;

  // ── NOW features — both tiers, with Free limits ───────────────────────────
  reflexionStrike:            boolean;  // free: one-time; builder: on every session
  morningBriefingDaysPerWeek: number;   // 3 on free, 7 on builder (Playbook §6.1)
  momentumScoreVisible:       boolean;  // free: level 1 only; builder: full with decay warnings
  breakMyStartup:             boolean;  // free Stress Test (one-time per session, Playbook §6.1)

  // ── Builder-only NOW features ─────────────────────────────────────────────
  dailyMorningBriefing:       boolean;
  unlimitedAITasks:           boolean;
  explainableRationale:       boolean;
  cognitiveLoadCheckin:       boolean;
  fullMomentumScore:          boolean;  // with decay warnings
  hitlOverrides:              boolean;  // override reason feeds context
  eveningCheckNudges:         boolean;
  emotionalLanguageLayer:     boolean;  // warmth at key trigger moments (NEW IN V4)
  recoveryMode:               boolean;  // forgiveness protocol, Reset Mission (NEW IN V4)
  founderMemory:              boolean;

  // ── Live behavioral features (no separate flag needed — always on for Builder) ─
  // patternDetection      → lib/patternDetection.ts (fires from evening cron + task-complete)
  // agentPersonaRotation  → lib/reflexion.ts getWeeklyCriticPersona()
  // confidenceGate        → lib/reflexion.ts shouldTriggerConfidenceGate()
  // learningLoop          → lib/learning.ts (injected into reflexion pipeline)
  // paywallMoments        → components/PaywallMoment.tsx

  // ── Not yet — activate when metrics warrant (Playbook §10) ───────────────
  // weeklyMirrorMoment, shareableScorecard,
  // ghostCompetitor, stressTestArena, accountabilityPairing,
  // resourceLibrary, venturesBlueprint, cofounderBlueprint
}

// ─────────────────────────────────────────────────────────────────────────────
// 14-Day Free Trial System (Audit v8: 7 days is insufficient for behavioral
// personalization to become visible. Founders need ~2 weeks of daily sessions
// for the avoidance detection, pattern surfacing, and learning loop to feel
// genuinely personal. The conversion event is day 14, by which point behavioral
// memory is built and the switching cost is real. No credit card required at trial start.)
//
// New users get 14 days of Builder-level access on signup.
// On day 15, a hard paywall blocks all Builder features until they pay.
//
// Trial state is persisted in:
//   - user_metadata.trial_started_at  (set at signup by the auth callback)
//   - founder_context.trial_ends_at   (set server-side, authoritative)
//
// Client-side functions below read trial state from localStorage for fast
// rendering; the server always re-validates via /api/billing/status.
// ─────────────────────────────────────────────────────────────────────────────

export const TRIAL_DURATION_DAYS = 14;

/** Number of milliseconds in the trial window. */
const TRIAL_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

const TRIAL_KEY = "bm_trial_started_at";
const TRIAL_EXPIRED_KEY = "bm_trial_expired";

/**
 * startFreeTrial — called once at signup (auth callback).
 * Sets trial_started_at in localStorage and fires a server request to
 * persist it in founder_context so it survives device switches.
 */
export function startFreeTrial(): void {
  if (typeof window === "undefined") return;
  if (storage.get(TRIAL_KEY)) return; // already started
  const now = new Date().toISOString();
  storage.set(TRIAL_KEY, now);
  // Persist server-side — fire-and-forget, storage is the fast path
  fetch("/api/billing/start-trial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trialStartedAt: now }),
  }).catch(() => { /* non-fatal */ });
}

/**
 * getTrialStatus — returns the current trial state.
 * Uses storage for instant rendering; caller should validate against
 * /api/billing/status for server-authoritative truth.
 */
export function getTrialStatus(): {
  isInTrial: boolean;
  isExpired: boolean;
  daysRemaining: number;
  trialStartedAt: string | null;
} {
  if (typeof window === "undefined") {
    return { isInTrial: false, isExpired: false, daysRemaining: 0, trialStartedAt: null };
  }
  const expired = storage.get(TRIAL_EXPIRED_KEY) === "1";
  if (expired) return { isInTrial: false, isExpired: true, daysRemaining: 0, trialStartedAt: null };

  const trialStartedAt = storage.get(TRIAL_KEY);
  if (!trialStartedAt) return { isInTrial: false, isExpired: false, daysRemaining: 0, trialStartedAt: null };

  const elapsed = Date.now() - new Date(trialStartedAt).getTime();
  const remaining = Math.ceil((TRIAL_MS - elapsed) / (24 * 60 * 60 * 1000));

  if (elapsed >= TRIAL_MS) {
    storage.set(TRIAL_EXPIRED_KEY, "1");
    return { isInTrial: false, isExpired: true, daysRemaining: 0, trialStartedAt };
  }

  return { isInTrial: true, isExpired: false, daysRemaining: Math.max(0, remaining), trialStartedAt };
}

/**
 * isTrialActive — quick boolean for gating UI.
 * Returns true if the user is within their trial window.
 */
export function isTrialActive(): boolean {
  return getTrialStatus().isInTrial;
}

/**
 * markTrialExpired — called by billing/status when the server confirms expiry.
 * Ensures the hard paywall kicks in even if the user hasn't refreshed.
 */
export function markTrialExpired(): void {
  if (typeof window === "undefined") return;
  storage.set(TRIAL_EXPIRED_KEY, "1");
}

/**
 * getEffectivePlan — returns the plan that should be used for feature gating.
 * During an active trial, free users get Builder-level access.
 * After trial expiry, they are hard-gated back to free until they pay.
 */
export function getEffectivePlan(basePlan?: Plan): Plan {
  const plan = basePlan ?? getPlan();
  if (plan === "builder") return "builder";
  const trial = getTrialStatus();
  if (trial.isInTrial) return "builder"; // trial grants full builder access
  return "free"; // trial expired or never started → strict free tier
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {

  // ── FREE — $0 ──────────────────────────────────────────────────────────────
  // "Your acquisition engine. The Reflexion Strike is so good it converts."
  // Paywall moment: "Your Morning Briefing is ready — upgrade to receive it every day."
  free: {
    actionsPerWeek: 3,
    aiMessagesPerDay: 3,
    historyDays: 7,
    maxProjects: 1,

    reflexionStrike: true,
    morningBriefingDaysPerWeek: 3,
    momentumScoreVisible: true,   // visible at Level 1 only per playbook
    breakMyStartup: true,         // one Stress Test — the hook

    dailyMorningBriefing: false,
    unlimitedAITasks: false,
    explainableRationale: false,
    cognitiveLoadCheckin: false,
    fullMomentumScore: false,
    hitlOverrides: false,
    eveningCheckNudges: false,
    emotionalLanguageLayer: false,
    recoveryMode: false,
    founderMemory: false,
  },

  // ── BUILDER — $39/mo ──────────────────────────────────────────────────────
  // "For: pre-revenue founders in active build mode"
  // The ONLY paid tier to ship this week.
  builder: {
    actionsPerWeek: -1,
    aiMessagesPerDay: -1,
    historyDays: -1,
    maxProjects: -1,

    reflexionStrike: true,
    morningBriefingDaysPerWeek: 7,
    momentumScoreVisible: true,
    breakMyStartup: true,

    dailyMorningBriefing: true,
    unlimitedAITasks: true,
    explainableRationale: true,
    cognitiveLoadCheckin: true,
    fullMomentumScore: true,
    hitlOverrides: true,
    eveningCheckNudges: true,
    emotionalLanguageLayer: true,
    recoveryMode: true,
    founderMemory: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_PRICES: Record<Plan, string> = {
  free:    "$0",
  builder: "$39",
};

export const PLAN_NAMES: Record<Plan, string> = {
  free:    "Free",
  builder: "Builder",
};

/** The exact paywall copy from Playbook §6.2 */
export const PAYWALL_FREE_TO_BUILDER =
  "Your Morning Briefing is ready. You need Builder to receive it every day.";

/** Feature → minimum plan. Only NOW features are gated here. */
export const FEATURE_GATES: Record<string, Plan> = {
  // ── NOW features (active in v4) ────────────────────────────────────────────
  dailyMorningBriefing:       "builder",
  unlimitedAITasks:           "builder",
  explainableRationale:       "builder",
  cognitiveLoadCheckin:       "builder",
  fullMomentumScore:          "builder",
  hitlOverrides:              "builder",
  eveningCheckNudges:         "builder",
  emotionalLanguageLayer:     "builder",
  recoveryMode:               "builder",
  founderMemory:              "builder",
  weeklyReport:               "builder",  // alias used in existing route
  aiCoach:                    "builder",
  
  // ── CoFounder Core (Month 2/3, currently builder-only, moving to operator) ──
  competitorReframe:          "builder",  // /api/cofounder/reframe (will move to operator at Day 90)
  validationAction:           "builder",  // /api/cofounder/validation-action (will move to operator)
  breakMyStartupFullAnalysis: "builder",  // Full analysis + competitor scan (preview available to free)

  // 🔒 Operator tier — disabled until Operator plan launches at Day 90 (Playbook §10).
  // canAccess() returns false for these on all current tiers (future-proofing).
  venturesBlueprint:       "builder",
  cofounderBlueprint:      "builder",
  cofounderPulse:          "builder",
  generateUI:              "builder",
};

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_ORDER: Plan[] = ["free", "builder"];

export function normalizePlan(value: string | null | undefined): Plan {
  if (!value) return "free";
  const v = value.toLowerCase().trim();
  if (v === "builder") return "builder";
  if (v === "free") return "free";
  // Known future/inactive tiers — treat as free until activated
  const knownFuture = ["operator", "founder", "chiefofstaff", "chief-of-staff", "cos", "venture", "ventures"];
  if (knownFuture.includes(v)) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[plan] normalizePlan received inactive tier "${v}" — defaulting to free. If this user should be Builder, fix their user_metadata.plan via /api/admin/plan-override.`);
    }
    return "free";
  }
  return "free";
}

export function planMeetsRequirement(actual: Plan, required: Plan): boolean {
  const actualIndex = PLAN_ORDER.indexOf(actual);
  const requiredIndex = PLAN_ORDER.indexOf(required);
  if (actualIndex < 0 || requiredIndex < 0) return false;
  return actualIndex >= requiredIndex;
}

export function setStoredPlan(plan: Plan): void {
  if (typeof window === "undefined") return;
  storage.setPlan(normalizePlan(plan));
}

export function clearStoredPlan(): void {
  if (typeof window === "undefined") return;
  storage.onSignOut();
}

export function planFromUserMetadata(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
): Plan {
  const metadata = user?.user_metadata ?? null;
  const metadataPlan = typeof metadata?.plan === "string" ? metadata.plan : null;
  const normalizedPlan = normalizePlan(metadataPlan);
  if (normalizedPlan === "builder") return "builder";

  // Some payment callbacks can persist billing state before every caller sees
  // the refreshed plan claim. Active billing should still unlock Builder.
  const billingStatus = typeof metadata?.billing_status === "string"
    ? metadata.billing_status.toLowerCase()
    : null;
  return billingStatus === "active" ? "builder" : "free";
}

export function syncStoredPlanFromUser(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
): Plan {
  const plan = planFromUserMetadata(user);
  if (typeof window !== "undefined") {
    if (user) { setStoredPlan(plan); } else { clearStoredPlan(); }
  }
  return plan;
}

export function getPlan(): Plan {
  if (typeof window === "undefined") return "free";
  const scoped = storage.getPlan();
  if (scoped) return normalizePlan(scoped);
  const env = process.env.NEXT_PUBLIC_USER_PLAN;
  return normalizePlan(env);
}

export function getLimits(plan?: Plan): PlanLimits {
  return PLAN_LIMITS[plan ?? getPlan()];
}

export function canAccess(feature: string, plan?: Plan): boolean {
  const current = plan ?? getPlan();
  const required = FEATURE_GATES[feature];
  if (!required) return true;
  return planMeetsRequirement(current, required);
}

// ── Weekly action tracking ────────────────────────────────────────────────────

export function getActionsThisWeek(): number {
  if (typeof window === "undefined") return 0;
  return storage.getActionsThisWeek();
}
export function recordWeeklyAction(): void {
  if (typeof window === "undefined") return;
  const plan = getPlan();
  if (PLAN_LIMITS[plan].actionsPerWeek === -1) return;
  storage.recordWeeklyAction();
}
export function hasHitWeeklyLimit(): boolean {
  const plan = getPlan();
  const limit = PLAN_LIMITS[plan].actionsPerWeek;
  if (limit === -1) return false; // Builder/paid — never block
  if (getActionsThisWeek() >= limit) {
    void fetchAndSyncStoredPlanFromBillingStatus();
    return true;
  }
  return false;
}
function weekKey(): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}_w${week}`;
}

// ── Daily AI tracking ─────────────────────────────────────────────────────────

export function getAIMessagesToday(userId?: string | null): number {
  if (typeof window === "undefined") return 0;
  return storage.getAIMessagesToday();
}
export function recordAIMessage(userId?: string | null): void {
  if (typeof window === "undefined") return;
  storage.recordAIMessage();
}
export function hasHitDailyAILimit(userId?: string | null): boolean {
  const plan = getPlan();
  const limit = PLAN_LIMITS[plan].aiMessagesPerDay;
  if (limit === -1) return false; // Builder/paid — never block
  if (getAIMessagesToday(userId) >= limit) {
    void fetchAndSyncStoredPlanFromBillingStatus();
    return true;
  }
  return false;
}
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
function dayKeyFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Daily streak tracking ────────────────────────────────────────────────────

const STREAK_KEY = "bm_streak";
const LAST_CHECKIN_KEY = "bm_last_checkin_date";

function streakDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getStoredStreak(): number {
  if (typeof window === "undefined") return 0;
  return storage.getStreak();
}

/**
 * syncStreakFromServer — call on app mount to restore streak from Supabase.
 * This makes streak survive device switches and storage clears.
 */
export async function syncStreakFromServer(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const res = await fetch("/api/founder-context/streak");
    if (!res.ok) return getStoredStreak();
    const { streak, lastCheckinDate } = await res.json();
    if (typeof streak === "number") {
      storage.setStreak(streak);
      if (lastCheckinDate) storage.setLastCheckinDate(lastCheckinDate);
      window.dispatchEvent(new CustomEvent("bm_streak_updated", { detail: { streak } }));
      return streak;
    }
  } catch { /* non-fatal */ }
  return getStoredStreak();
}

export function incrementDailyStreak(): number {
  if (typeof window === "undefined") return 0;
  const today = streakDayKey();
  const lastCheckin = storage.getLastCheckinDate();
  const current = getStoredStreak();

  if (lastCheckin === today) return current;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const next = lastCheckin === streakDayKey(yesterday) ? current + 1 : 1;

  storage.setStreak(next);
  storage.setLastCheckinDate(today);
  window.dispatchEvent(new CustomEvent("bm_streak_updated", { detail: { streak: next } }));

  // Persist to Supabase so streak survives device switches and storage clears.
  fetch("/api/founder-context/streak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ streak: next, lastCheckinDate: today }),
  }).catch(() => { /* non-fatal — storage is the fast fallback */ });

  return next;
}

// ── Upgrade trigger ───────────────────────────────────────────────────────────

const UPGRADE_KEY = "bm_upgrade_shown";
const TASK_KEY    = "bm_tasks_done";

export function recordTaskCompletion(): void {
  if (typeof window === "undefined") return;
  storage.set(TASK_KEY, String(getTasksDone() + 1));
  recordWeeklyAction();
  window.dispatchEvent(new CustomEvent("bm_task_completed"));
}
export function getTasksDone(): number {
  if (typeof window === "undefined") return 0;
  return Number(storage.get(TASK_KEY) ?? "0");
}
export function checkUpgradeTrigger(streak: number): { shouldUpgrade: boolean; reason: string } {
  if (getPlan() !== "free") return { shouldUpgrade: false, reason: "already_paid" };
  if (typeof window === "undefined") return { shouldUpgrade: false, reason: "ssr" };
  if (storage.get(UPGRADE_KEY)) return { shouldUpgrade: false, reason: "already_shown" };
  const done = getTasksDone();
  if (done >= 2) { storage.set(UPGRADE_KEY, "1"); return { shouldUpgrade: true, reason: "2_tasks" }; }
  if (streak >= 3) { storage.set(UPGRADE_KEY, "1"); return { shouldUpgrade: true, reason: "3_day_streak" }; }
  if (hasHitWeeklyLimit()) { storage.set(UPGRADE_KEY, "1"); return { shouldUpgrade: true, reason: "weekly_limit" }; }
  return { shouldUpgrade: false, reason: "not_yet" };
}
export function resetUpgradeTrigger(): void {
  if (typeof window === "undefined") return;
  [UPGRADE_KEY, TASK_KEY].forEach(k => storage.remove(k));
}

// Dev helpers
declare global {
  interface Window {
    bmSetPlan?: (p: string, userId: string) => void;
  }
}
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.bmSetPlan = (p: string, userId: string) => {
    if (!userId) { console.warn("bmSetPlan: pass a userId to avoid cross-account bleed"); return; }
    storage.onSignIn(userId);
    storage.setPlan(normalizePlan(p as Plan));
    console.log(`[dev] bm_plan scoped to ${userId} = ${normalizePlan(p as Plan)}. Refresh.`);
  };
}

// ── Server-authoritative plan sync ────────────────────────────────────────────

export async function fetchAndSyncStoredPlanFromBillingStatus(): Promise<Plan> {
  try {
    const res = await fetch("/api/billing/status", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return getPlan();
    const payload = await res.json().catch(() => null) as {
      ok?: boolean;
      plan?: string;
      trial?: {
        active?: boolean;
        expired?: boolean;
        endsAt?: string | null;
      };
    } | null;
    const plan = normalizePlan(payload?.ok ? (payload.plan ?? null) : null);
    setStoredPlan(plan);

    if (payload?.ok && payload.trial) {
      const { active, expired, endsAt } = payload.trial;

      if (active && endsAt && !storage.get(TRIAL_KEY)) {
        const startedAt = new Date(new Date(endsAt).getTime() - TRIAL_MS).toISOString();
        storage.set(TRIAL_KEY, startedAt);
        storage.remove(TRIAL_EXPIRED_KEY);
      }

      if (expired) {
        storage.set(TRIAL_EXPIRED_KEY, "1");
      }
    }

    return plan;
  } catch {
    return getPlan();
  }
}

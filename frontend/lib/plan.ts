/**
 * lib/plan.ts — Plan tier gating
 *
 * Public product tiers:
 * Free    → $0
 * Builder → $19
 *
 * Older "venture" values are normalized to Builder so legacy local state
 * does not break while the public paywall stays free + builder only.
 */

export type Plan = "free" | "builder" | "venture";

export interface PlanLimits {
  actionsPerWeek:      number;   // -1 = unlimited
  aiMessagesPerDay:    number;   // -1 = unlimited
  historyDays:         number;   // -1 = unlimited
  maxProjects:         number;   // max projects free users can create (-1 = unlimited)
  ventureTracks:       number;
  weeklyReport:        boolean;
  outcomeLearning:     boolean;
  investorMetrics:     boolean;
  breakMyStartup:      boolean;
  pitchDeckGenerator:  boolean;
  multiProject:        boolean;
  exportData:          boolean;
  ideaValidator:       boolean;
  startupKit:          boolean;
  landingPageGen:      boolean;
  growthToolkit:       boolean;
  weeklyShare:         boolean;
  streakInsurance:     boolean;  // protect 1 missed day per month — streak survives
  multiTrack:          boolean;  // unlimited 90-day roadmap tracks
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    actionsPerWeek: 7, aiMessagesPerDay: 3, historyDays: 7,
    maxProjects: 1,
    ventureTracks: 0, weeklyReport: false, outcomeLearning: false,
    investorMetrics: false, breakMyStartup: true,
    pitchDeckGenerator: false, multiProject: false, exportData: false,
    ideaValidator: false,
    startupKit: false,
    landingPageGen: false,
    growthToolkit: false,
    weeklyShare: true,
    streakInsurance: false,
    multiTrack: false,
  },
  builder: {
    actionsPerWeek: -1, aiMessagesPerDay: -1, historyDays: -1,
    maxProjects: -1,
    ventureTracks: -1, weeklyReport: true, outcomeLearning: true,
    investorMetrics: true, breakMyStartup: true,
    pitchDeckGenerator: false, multiProject: false, exportData: true,
    ideaValidator: true,
    startupKit: true,
    landingPageGen: true,
    growthToolkit: true,
    weeklyShare: true,
    streakInsurance: true,
    multiTrack: true,
  },
  venture: {
    actionsPerWeek: -1, aiMessagesPerDay: -1, historyDays: -1,
    maxProjects: -1,
    ventureTracks: -1, weeklyReport: true, outcomeLearning: true,
    investorMetrics: true, breakMyStartup: true,
    pitchDeckGenerator: true, multiProject: true, exportData: true,
    ideaValidator: true,
    startupKit: true,
    landingPageGen: true,
    growthToolkit: true,
    weeklyShare: true,
    streakInsurance: true,
    multiTrack: true,
  },
};

export const PLAN_PRICES: Record<Plan, string> = { free: "$0", builder: "$49", venture: "$49" };
export const PLAN_NAMES:  Record<Plan, string> = { free: "Free", builder: "Builder", venture: "Builder" };

export const FEATURE_GATES: Record<string, Plan> = {
  // Venture-only feature (coming later). Keep gated even while core paywall is free+builder.
  ventures:         "venture",
  weeklyReport:     "builder",
  outcomeLearning:  "builder",
  investorMetrics:  "builder",
  unlimitedAI:      "builder",
  exportData:       "builder",
  ideaValidator:    "builder",
  startupKit:       "builder",
  landingPageGen:   "builder",
  growthToolkit:    "builder",
  pitchDeck:        "venture",
  multiProject:     "venture",
};

export function normalizePlan(value: string | null | undefined): Plan {
  if (value === "builder" || value === "venture") return "builder";
  return "free";
}

export function setStoredPlan(plan: Plan): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("bm_plan", normalizePlan(plan));
}

export function clearStoredPlan(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("bm_plan");
}

export function planFromUserMetadata(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
): Plan {
  const metadataPlan =
    user?.user_metadata && typeof user.user_metadata.plan === "string"
      ? user.user_metadata.plan
      : null;
  return normalizePlan(metadataPlan);
}

export function syncStoredPlanFromUser(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
): Plan {
  const plan = planFromUserMetadata(user);
  if (typeof window !== "undefined") {
    if (user) {
      setStoredPlan(plan);
    } else {
      clearStoredPlan();
    }
  }
  return plan;
}

export function getPlan(): Plan {
  if (typeof window === "undefined") return "free";
  const local = localStorage.getItem("bm_plan");
  if (local) return normalizePlan(local);
  const env = process.env.NEXT_PUBLIC_USER_PLAN;
  return normalizePlan(env);
}

export function canAccess(feature: string, plan?: Plan): boolean {
  const current = normalizePlan(plan ?? getPlan());
  const required = FEATURE_GATES[feature];
  if (!required) return true;
  const order: Plan[] = ["free","builder","venture"];
  return order.indexOf(current) >= order.indexOf(required);
}

export function getLimits(plan?: Plan): PlanLimits { return PLAN_LIMITS[plan ?? getPlan()]; }

// ── Weekly action tracking ──────────────────────────────────────────────────
export function getActionsThisWeek(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(`bm_actions_${weekKey()}`) ?? "0");
}
export function recordWeeklyAction(): void {
  if (typeof window === "undefined") return;
  const k = `bm_actions_${weekKey()}`;
  localStorage.setItem(k, String(getActionsThisWeek() + 1));
}
export function hasHitWeeklyLimit(): boolean {
  const plan = getPlan();
  const limit = PLAN_LIMITS[plan].actionsPerWeek;
  return limit !== -1 && getActionsThisWeek() >= limit;
}
function weekKey(): string {
  const d = new Date();
  const j = new Date(d.getFullYear(),0,1);
  return `${d.getFullYear()}_w${Math.ceil(((d.getTime()-j.getTime())/86400000+j.getDay()+1)/7)}`;
}

// ── Daily AI tracking ───────────────────────────────────────────────────────
export function getAIMessagesToday(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(`bm_ai_${dayKey()}`) ?? "0");
}
export function recordAIMessage(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`bm_ai_${dayKey()}`, String(getAIMessagesToday() + 1));
}
export function hasHitDailyAILimit(): boolean {
  const plan = getPlan();
  const limit = PLAN_LIMITS[plan].aiMessagesPerDay;
  return limit !== -1 && getAIMessagesToday() >= limit;
}
function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Upgrade trigger ─────────────────────────────────────────────────────────
const UPGRADE_KEY = "bm_upgrade_shown";
const TASK_KEY    = "bm_tasks_done";

export function recordTaskCompletion(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TASK_KEY, String(getTasksDone() + 1));
  recordWeeklyAction();
}
export function getTasksDone(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(TASK_KEY) ?? "0");
}
export function checkUpgradeTrigger(streak: number): { shouldUpgrade: boolean; reason: string } {
  if (getPlan() !== "free") return { shouldUpgrade: false, reason: "already_paid" };
  if (typeof window === "undefined") return { shouldUpgrade: false, reason: "ssr" };
  if (localStorage.getItem(UPGRADE_KEY)) return { shouldUpgrade: false, reason: "already_shown" };
  const done = getTasksDone();
  if (done >= 2) { localStorage.setItem(UPGRADE_KEY,"1"); return { shouldUpgrade:true, reason:"2_tasks" }; }
  if (streak >= 3) { localStorage.setItem(UPGRADE_KEY,"1"); return { shouldUpgrade:true, reason:"3_day_streak" }; }
  if (hasHitWeeklyLimit()) { localStorage.setItem(UPGRADE_KEY,"1"); return { shouldUpgrade:true, reason:"weekly_limit" }; }
  return { shouldUpgrade: false, reason: "not_yet" };
}
export function resetUpgradeTrigger(): void {
  if (typeof window === "undefined") return;
  [UPGRADE_KEY, TASK_KEY].forEach(k => localStorage.removeItem(k));
}

// Dev helpers
if (typeof window !== "undefined") {
  (window as any).setPlan = (p: Plan) => { setStoredPlan(p); console.log(`Plan: ${normalizePlan(p)}. Refresh.`); };
  (window as any).clearPlan = () => { clearStoredPlan(); console.log("Cleared. Refresh."); };
}

// ── Streak insurance — Builder only ──────────────────────────────────────────
// Allows 1 missed day per calendar month without breaking the streak.
const INSURANCE_KEY = "bm_streak_insurance_used";

export function canUseStreakInsurance(): boolean {
  if (typeof window === "undefined") return false;
  if (!getLimits().streakInsurance) return false;
  const monthKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const used = localStorage.getItem(INSURANCE_KEY);
  return used !== monthKey;
}

export function useStreakInsurance(): boolean {
  if (!canUseStreakInsurance()) return false;
  const monthKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  localStorage.setItem(INSURANCE_KEY, monthKey);
  return true;
}

// Checks if yesterday was missed and applies insurance if eligible.
// Call on app load in providers.
export function checkAndApplyStreakInsurance(currentStreak: number): { applied: boolean; streak: number } {
  if (typeof window === "undefined") return { applied: false, streak: currentStreak };
  const lastDone = localStorage.getItem("bm_today_done_date");
  if (!lastDone) return { applied: false, streak: currentStreak };

  const lastDate = new Date(lastDone);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);

  if (diffDays === 2 && canUseStreakInsurance()) {
    // Exactly one day missed — apply insurance
    if (useStreakInsurance()) {
      // Don't reset streak — pretend yesterday was completed
      localStorage.setItem("bm_streak_insured_day", new Date(today.getTime() - 86400000).toISOString().split("T")[0]);
      return { applied: true, streak: currentStreak };
    }
  }
  return { applied: false, streak: currentStreak };
}

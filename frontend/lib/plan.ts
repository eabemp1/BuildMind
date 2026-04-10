/**
 * lib/plan.ts — Plan tier gating
 *
 * Public product tiers:
 * Free    → $0
 * Builder → $19
 *
 * Older "venture" values are normalized to Builder so existing local state
 * does not break while the public product stays free + builder only.
 */

export type Plan = "free" | "builder" | "venture";

export interface PlanLimits {
  actionsPerWeek:      number;   // -1 = unlimited
  aiMessagesPerDay:    number;   // -1 = unlimited
  historyDays:         number;   // -1 = unlimited
  ventureTracks:       number;
  weeklyReport:        boolean;
  outcomeLearning:     boolean;
  investorMetrics:     boolean;
  breakMyStartup:      boolean;
  pitchDeckGenerator:  boolean;
  multiProject:        boolean;
  exportData:          boolean;
  // PDF-sourced new features
  ideaValidator:       boolean;  // AI idea validation (full — free gets teaser)
  startupKit:          boolean;  // AI name + domain suggestions + branding colours
  landingPageGen:      boolean;  // one-click landing page generator
  growthToolkit:       boolean;  // email capture, basic analytics, feedback forms
  weeklyShare:         boolean;  // public weekly progress card (#buildinpublic)
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    actionsPerWeek: 7, aiMessagesPerDay: 3, historyDays: 7,
    ventureTracks: 0, weeklyReport: false, outcomeLearning: false,
    investorMetrics: false, breakMyStartup: true,
    pitchDeckGenerator: false, multiProject: false, exportData: false,
    ideaValidator: false,    // teaser only on free
    startupKit: false,
    landingPageGen: false,
    growthToolkit: false,
    weeklyShare: true,       // free — public sharing is good for BuildMind growth
  },
  builder: {
    actionsPerWeek: -1, aiMessagesPerDay: -1, historyDays: -1,
    ventureTracks: 0, weeklyReport: true, outcomeLearning: true,
    investorMetrics: true, breakMyStartup: true,
    pitchDeckGenerator: false, multiProject: false, exportData: true,
    ideaValidator: true,
    startupKit: true,
    landingPageGen: true,
    growthToolkit: true,
    weeklyShare: true,
  },
  venture: {
    actionsPerWeek: -1, aiMessagesPerDay: -1, historyDays: -1,
    ventureTracks: 0, weeklyReport: true, outcomeLearning: true,
    investorMetrics: true, breakMyStartup: true,
    pitchDeckGenerator: true, multiProject: true, exportData: true,
    ideaValidator: true,
    startupKit: true,
    landingPageGen: true,
    growthToolkit: true,
    weeklyShare: true,
  },
};

export const PLAN_PRICES: Record<Plan, string> = { free: "$0", builder: "$19", venture: "$19" };
export const PLAN_NAMES:  Record<Plan, string> = { free: "Starter", builder: "Builder", venture: "Builder" };

export const FEATURE_GATES: Record<string, Plan> = {
  ventures:         "builder",
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

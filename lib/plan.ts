/**
 * lib/plan.ts — Plan tier gating
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ACTIVE TIERS (this week — Playbook v4 §11, item 12):                  ║
 * ║    Free     → $0   (acquisition engine, limited)                       ║
 * ║    Builder  → $19  (the one paid tier to ship now)                     ║
 * ║                                                                        ║
 * ║  FUTURE TIERS — DO NOT ACTIVATE YET:                                   ║
 * ║    Operator → $39  opens to WAITLIST at Day 90, only if:               ║
 * ║                    briefing open rate > 35% AND task completion > 55%  ║
 * ║                    (Playbook §10, 30/60/90-Day Framework)              ║
 * ║    Founder  → $69  Month 6–7 (100 users with data)                    ║
 * ║    Chief of Staff → $120  Month 12+ (200 users, strong retention)      ║
 * ║                                                                        ║
 * ║  ACTIVE FEATURES (ship this week — Playbook §5.3 "Now"):              ║
 * ║    Founder Context Object, Reflexion Strike onboarding,                ║
 * ║    Morning Briefing (3 days free / daily Builder),                     ║
 * ║    Evening Check, Cognitive Load Check-in, One Task Rule,              ║
 * ║    HITL Override, Momentum Score, Explainable Rationale,               ║
 * ║    Emotional Language Layer, Recovery Mode                             ║
 * ║                                                                        ║
 * ║  NOT YET — Month 2:                                                    ║
 * ║    Pattern Detection, Weekly Mirror Moment, Agent Persona Rotation,    ║
 * ║    Confidence Gate, Shareable Scorecard                                ║
 * ║                                                                        ║
 * ║  NOT YET — Month 3+:                                                   ║
 * ║    Ghost Competitor, Stress Test Arena, Accountability Pairing,        ║
 * ║    Ventures Blueprint engine, CoFounder Blueprint mode                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

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

  // ── Month 2 features — NOT YET (defined to prevent accidental gating) ─────
  // patternDetection, weeklyMirrorMoment, agentPersonaRotation,
  // confidenceGate, shareableScorecard — all false on both tiers until Month 2

  // ── Month 3+ features — NOT YET ──────────────────────────────────────────
  // ghostCompetitor, stressTestArena, accountabilityPairing,
  // resourceLibrary, venturesBlueprint, cofounderBlueprint — not in plan yet
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {

  // ── FREE — $0 ──────────────────────────────────────────────────────────────
  // "Your acquisition engine. The Reflexion Strike is so good it converts."
  // Paywall moment: "Your Morning Briefing is ready — upgrade to receive it every day."
  free: {
    actionsPerWeek: 5,
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

  // ── BUILDER — $19/mo ──────────────────────────────────────────────────────
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
  builder: "$19",
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
  dailyMorningBriefing:    "builder",
  unlimitedAITasks:        "builder",
  explainableRationale:    "builder",
  cognitiveLoadCheckin:    "builder",
  fullMomentumScore:       "builder",
  hitlOverrides:           "builder",
  eveningCheckNudges:      "builder",
  emotionalLanguageLayer:  "builder",
  recoveryMode:            "builder",
  founderMemory:           "builder",
  weeklyReport:            "builder",  // alias used in existing route
  aiCoach:                 "builder",

  // 🔒 Operator tier — disabled until Operator plan launches.
  // canAccess() returns false for these on all current tiers.
  venturesBlueprint:       "operator" as Plan,
  cofounderBlueprint:      "operator" as Plan,
  cofounderPulse:          "operator" as Plan,
  generateUI:              "operator" as Plan,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_ORDER: Plan[] = ["free", "builder"];

export function normalizePlan(value: string | null | undefined): Plan {
  if (!value) return "free";
  const v = value.toLowerCase().trim();
  if (v === "builder") return "builder";
  // Venture/operator and any future tiers map to builder (the highest active tier)
  if ((FUTURE_PLANS as readonly string[]).includes(v) ||
      v === "venture" || v === "ventures" ||
      v === "operator" || v === "founder" ||
      v === "chiefofstaff" || v === "chief-of-staff" || v === "cos") {
    return "builder";
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
    if (user) { setStoredPlan(plan); } else { clearStoredPlan(); }
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
  return Number(localStorage.getItem(`bm_actions_${weekKey()}`) ?? "0");
}
export function recordWeeklyAction(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`bm_actions_${weekKey()}`, String(getActionsThisWeek() + 1));
}
export function hasHitWeeklyLimit(): boolean {
  const limit = PLAN_LIMITS[getPlan()].actionsPerWeek;
  return limit !== -1 && getActionsThisWeek() >= limit;
}
function weekKey(): string {
  const d = new Date();
  const j = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}_w${Math.ceil(((d.getTime() - j.getTime()) / 86400000 + j.getDay() + 1) / 7)}`;
}

// ── Daily AI tracking ─────────────────────────────────────────────────────────

export function getAIMessagesToday(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(`bm_ai_${dayKey()}`) ?? "0");
}
export function recordAIMessage(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`bm_ai_${dayKey()}`, String(getAIMessagesToday() + 1));
}
export function hasHitDailyAILimit(): boolean {
  const limit = PLAN_LIMITS[getPlan()].aiMessagesPerDay;
  return limit !== -1 && getAIMessagesToday() >= limit;
}
function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Daily streak tracking ────────────────────────────────────────────────────

const STREAK_KEY = "bm_streak";
const LAST_CHECKIN_KEY = "bm_last_checkin_date";

function streakDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getStoredStreak(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(STREAK_KEY) ?? "0");
}

export function incrementDailyStreak(): number {
  if (typeof window === "undefined") return 0;
  const today = streakDayKey();
  const lastCheckin = localStorage.getItem(LAST_CHECKIN_KEY) ?? "";
  const current = getStoredStreak();

  if (lastCheckin === today) return current;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const next = lastCheckin === streakDayKey(yesterday) ? current + 1 : 1;

  localStorage.setItem(STREAK_KEY, String(next));
  localStorage.setItem(LAST_CHECKIN_KEY, today);
  window.dispatchEvent(new CustomEvent("bm_streak_updated", { detail: { streak: next } }));
  return next;
}

// ── Upgrade trigger ───────────────────────────────────────────────────────────

const UPGRADE_KEY = "bm_upgrade_shown";
const TASK_KEY    = "bm_tasks_done";

export function recordTaskCompletion(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TASK_KEY, String(getTasksDone() + 1));
  recordWeeklyAction();
  window.dispatchEvent(new CustomEvent("bm_task_completed"));
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
  if (done >= 2) { localStorage.setItem(UPGRADE_KEY, "1"); return { shouldUpgrade: true, reason: "2_tasks" }; }
  if (streak >= 3) { localStorage.setItem(UPGRADE_KEY, "1"); return { shouldUpgrade: true, reason: "3_day_streak" }; }
  if (hasHitWeeklyLimit()) { localStorage.setItem(UPGRADE_KEY, "1"); return { shouldUpgrade: true, reason: "weekly_limit" }; }
  return { shouldUpgrade: false, reason: "not_yet" };
}
export function resetUpgradeTrigger(): void {
  if (typeof window === "undefined") return;
  [UPGRADE_KEY, TASK_KEY].forEach(k => localStorage.removeItem(k));
}

// Dev helpers
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).bmSetPlan = (p: string, userId: string) => {
    if (!userId) { console.warn("bmSetPlan: pass a userId to avoid cross-account bleed"); return; }
    localStorage.setItem(`bm_plan_${userId}`, normalizePlan(p as Plan));
    console.log(`[dev] bm_plan_${userId} = ${normalizePlan(p as Plan)}. Refresh.`);
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
    const payload = await res.json().catch(() => null) as { ok?: boolean; plan?: string } | null;
    const plan = normalizePlan(payload?.ok ? (payload.plan ?? null) : null);
    setStoredPlan(plan);
    return plan;
  } catch {
    return getPlan();
  }
}

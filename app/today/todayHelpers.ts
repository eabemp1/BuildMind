import { useState, useEffect } from "react";
import { truncateChars } from "@/lib/textTruncate";
import { IntelligencePanel, type TodayIntelligenceSummary } from "./components/IntelligencePanel";

export type Outcome = "completed" | "blocked" | "partial" | "learned";
export type ReflexionMeta = {
  verdict: string;
  criticPersona: string;
  rationale: string;
  loopRan: boolean;
  passedCritic: boolean;
  lastReflectionUsed: boolean;
  wasHardFallback?: boolean;
  hardFallbackReasons?: string[];
};

// ── Milestone Break interstitial (fires after milestone/stage change) ────────
export type MilestoneBreakResult = {
  // NOTE: "stalling" is not yet emitted by app/api/ai/milestone-break/route.ts
  // (which only produces "milestone_complete" | "stage_transition" today).
  // Client-side is ready for a future stalled-milestone detector; until the
  // server emits it, this branch never renders.
  trigger: "milestone_complete" | "stage_transition" | "stalling";
  triggerLabel: string;
  brutal_points: [string, string, string];
  recommended_action: string;
  generated_at: string;
};

// One colour per kind of work, so the page itself says what sort of day this is.
export function missionAccent(kind?: string): string {
  switch (kind) {
    case "interview": case "outreach": case "follow_up": return "#4AB8B0";
    case "build": return "#9B87F5";
    case "publish": return "#E8C547";
    case "pricing": return "var(--bm-green, #4ade80)";
    case "analyze": return "var(--bm-intel, #6FA8FF)";
    case "unblock": return "var(--bm-red, #E05555)";
    default: return "var(--bm-accent)";
  }
}

export type ActionData = {
  action: string;
  message: string;
  why: string;
  time: string;
  destKey?: string;
  isAI: boolean;
  reflexion?: ReflexionMeta;
  // log_row_id from recordActionShown — closes the learning loop via reflexion-outcome
  log_row_id?: string;
  difficulty?: "light" | "focused" | "deep"; // From app/api/ai/today-action's response
  // Confidence as a branch — when true, action/why were composed with
  // explicit evidence-gathering framing instead of a confident directive.
  // See CONFIDENCE NOTICE in app/api/ai/today-action/stream/route.ts.
  isLowConfidence?: boolean;
  // Founder Intelligence OS (Phase 10) — layered above the existing action,
  // never required for the card to render. See app/today/components/IntelligencePanel.tsx.
  intelligence?: TodayIntelligenceSummary;
  // Mission planner (lib/todayMission.ts): what kind of work today is, and why.
  missionKind?: string;
  missionLabel?: string;
  missionReasons?: string[];
  doneWhen?: string;
  firstStep?: string;
  hasDraft?: boolean;
  groundedIn?: Array<{ title: string; url: string }>;
};

export type CachedTodayAction = {
  date?: string;
  projectId?: string;
  stage?: string;
  data?: ActionData;
};

export type DebtSuppression = {
  debtSuppressed: true;
  debtCategory?: string | null;
  debtMessage: string;
  interventionHint?: string;
  stage?: string;
};

export function isActionData(value: unknown): value is ActionData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ActionData>;
  return (
    typeof data.action === "string" &&
    typeof data.message === "string" &&
    typeof data.why === "string" &&
    typeof data.time === "string"
  );
}

export function sanitizeVisibleText(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^[\s\S]*<\/think>/gi, "")
    .replace(/[•→⇒➜➔]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u2026/g, "...")
    .trim();
}

export function sanitizeActionData(data: ActionData): ActionData | null {
  const action = sanitizeVisibleText(data.action);
  const message = sanitizeVisibleText(data.message);
  const why = sanitizeVisibleText(data.why);
  if (!action || !message || !why) return null;
  return {
    ...data,
    action,
    message,
    why,
    reflexion: data.reflexion
      ? { ...data.reflexion, rationale: sanitizeVisibleText(data.reflexion.rationale) || why }
      : data.reflexion,
  };
}

export function unwrapActionPayload(payload: unknown): ActionData | null {
  if (!payload || typeof payload !== "object") return null;
  const maybePayload = payload as { data?: unknown };
  const candidate = isActionData(maybePayload.data) ? maybePayload.data : payload;
  return isActionData(candidate) ? sanitizeActionData({ ...candidate, isAI: true }) : null;
}

export function unwrapDebtPayload(payload: unknown): DebtSuppression | null {
  if (!payload || typeof payload !== "object") return null;
  const maybePayload = payload as { data?: unknown };
  const candidate = (maybePayload.data && typeof maybePayload.data === "object") ? maybePayload.data : payload;
  const data = candidate as Partial<DebtSuppression>;
  if (data.debtSuppressed === true && typeof data.debtMessage === "string") {
    return {
      debtSuppressed: true,
      debtCategory: data.debtCategory ?? null,
      debtMessage: sanitizeVisibleText(data.debtMessage),
      interventionHint: typeof data.interventionHint === "string" ? sanitizeVisibleText(data.interventionHint) : undefined,
      stage: typeof data.stage === "string" ? data.stage : undefined,
    };
  }
  return null;
}

// ── Stored reflection shape (from bm_today_action written by /reflect) ──────
export type StoredReflection = {
  action: string;
  outcome: Outcome;
  note?: string;
  confidence?: number;
  witnessed?: string; // acknowledgment line from app/reflect — surfaced here too, not just on /reflect
};

// ── Fallback actions (used when API is unavailable) ──────────────────────────
export const DESTINATIONS: Record<string, { icon: string; label: string; url?: string }[]> = {
  idea:       [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "r/startups", url: "https://reddit.com/r/startups/submit" }, { icon: "📱", label: "Text 3 people" }],
  validation: [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💼", label: "LinkedIn DM" }, { icon: "📱", label: "WhatsApp" }],
  prototype:  [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "🎥", label: "Loom → share" }],
  mvp:        [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "WhatsApp" }],
  launch:     [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com/posts/new" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com/post" }, { icon: "📰", label: "Hacker News", url: "https://news.ycombinator.com/submit" }],
  // FIX: no "growth" key existed here, so DESTINATIONS[aiAction?.destKey ?? stageKey] ?? DESTINATIONS.idea
  // silently fell back to idea-stage sharing channels (Reddit r/startups, "text 3 people")
  // for a founder who is already past launch and working on retention.
  growth:     [{ icon: "📞", label: "Call directly" }, { icon: "📧", label: "Email personally" }, { icon: "💼", label: "LinkedIn" }, { icon: "𝕏", label: "Twitter DM" }],
  revenue:    [{ icon: "📞", label: "Call directly" }, { icon: "📧", label: "Email personally" }, { icon: "💼", label: "LinkedIn" }, { icon: "𝕏", label: "Twitter DM" }],
};

export const STATIC_ACTIONS: Record<string, { action: string; message: string; why: string; time: string; destKey: string }> = {
  idea:       { action: "Talk to 5 people who have this problem before writing any code.", message: "Hey, quick question — what's your biggest challenge with [your problem area]? I'm researching it and would love 10 minutes.", why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.", time: "2 hours", destKey: "idea" },
  validation: { action: "Send this outreach message to 10 potential users today.", message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens? Not pitching, just learning.", why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.", time: "1–2 hours", destKey: "validation" },
  prototype:  { action: "Record a 3-minute Loom walkthrough and send it to 5 people today.", message: "Hey — I've built a rough prototype for [problem]. Would you watch a 3-minute demo and tell me what confuses you most? Brutal honesty only.", why: "Dropbox got 75K signups from a demo video before writing any backend code. Ship something real.", time: "Under 2 hours", destKey: "prototype" },
  mvp:        { action: "Send your working link to one warm contact before end of day.", message: "Hey — I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks?", why: "The version they see today teaches you more than 3 more days of polishing. Ship it.", time: "30 minutes", destKey: "mvp" },
  launch:     { action: "Post on Product Hunt this week — imperfect listing beats no listing.", message: "We just launched [product] on Product Hunt — it [solves problem] for [target users]. Would love your support and brutal feedback: [link]", why: "You don't need to be ready. You need to be visible.", time: "3 hours to prepare", destKey: "launch" },
  // FIX: no "growth" key existed here, so buildContextualStaticAction()'s
  // STATIC_ACTIONS[stageKey] ?? STATIC_ACTIONS.idea silently fell back to
  // "Talk to 5 people who have this problem before writing any code" for a
  // founder already past launch — the AI-unavailable fallback path was
  // telling a Growth-stage founder to re-do Idea-stage validation.
  growth:     { action: "Call one churned user today — not to win them back, to understand why they left.", message: "Hey [name] — I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?", why: "Retention beats acquisition. Every churn conversation tells you more than another week of dashboards.", time: "1 hour", destKey: "growth" },
  revenue:    { action: "Call one churned user today — not to win them back, to understand why they left.", message: "Hey [name] — I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?", why: "Churn analysis conversations are the highest-leverage activity at revenue stage.", time: "1 hour", destKey: "revenue" },
};

export function inferProjectAudience(targetUsers: string, productName: string, description = "", problem = ""): string {
  if (targetUsers.trim()) return targetUsers.trim();
  const haystack = `${productName} ${description} ${problem}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "data privacy officers or compliance managers";
  if (/(fintech|payment|bank|invoice|accounting|finance)/.test(haystack)) return "finance operators or fintech founders";
  if (/(health|clinic|patient|medical)/.test(haystack)) return "healthcare operators";
  if (/(school|student|teacher|course|learning)/.test(haystack)) return "education operators";
  if (/(shop|commerce|store|retail)/.test(haystack)) return "e-commerce operators";
  return productName.trim() ? `${productName.trim()} target users` : "people in your target segment";
}

export function inferProjectProblem(problem: string, productName: string, description = ""): string {
  if (problem.trim()) return problem.trim();
  const haystack = `${productName} ${description}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "verifiable consent tracking and audit logging";
  if (description.trim()) return truncateChars(description, 120);
  return productName.trim() ? `${productName.trim()} and the workflow it improves` : "their current workflow";
}

export function buildContextualStaticAction(
  stageKey: string,
  productName: string,
  targetUsers: string,
  problem: string,
  description: string,
): { action: string; message: string; why: string; time: string; destKey: string } {
  const base = STATIC_ACTIONS[stageKey] ?? STATIC_ACTIONS.idea;
  const audience = inferProjectAudience(targetUsers, productName, description, problem);
  const problemDesc = inferProjectProblem(problem, productName, description);
  return {
    ...base,
    action: `Message 3 ${audience} today - ask about ${problemDesc}, not your idea.`,
    message: `Hi [Name], quick question - I'm researching ${problemDesc} for ${audience}. How are you handling this today, and what is the most frustrating part? I'd value 10 minutes of honest context.`,
    why: `This gives ${productName || "your startup"} real evidence from ${audience} instead of another internal guess.`,
  };
}

export const OUTCOME_CHIPS: { id: Outcome; label: string; description: string; color: string; bg: string; border: string }[] = [
  { id: "completed", label: "Completed",         description: "Task fully executed as planned.",        color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "partial",   label: "Partly done",       description: "Incomplete but made progress.",          color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "blocked",   label: "Blocked",           description: "Faced obstacles or issues.",             color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "learned",   label: "Learned something", description: "Didn't execute, but gained a real insight.", color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
];


// ── Week-one projections — shown in done state on first session ───────────────
export const WEEK_ONE_MILESTONES: Record<string, { day: number; milestone: string }[]> = {
  idea: [
    { day: 2, milestone: "You'll have talked to at least 2 real people about your idea — more signal than a week of research." },
    { day: 4, milestone: "BuildMind will have detected your first avoidance pattern and started routing around it." },
    { day: 7, milestone: "You'll have a validated problem statement or evidence it needs changing. Either outcome is the right one." },
  ],
  validation: [
    { day: 2, milestone: "First user commitment recorded — time, money, or workflow change." },
    { day: 4, milestone: "Pattern detected: which type of user responds faster." },
    { day: 7, milestone: "Enough signal to decide whether to build or pivot the value proposition." },
  ],
  mvp: [
    { day: 2, milestone: "Working link in front of at least one real user." },
    { day: 4, milestone: "First friction point documented — the bug or confusion users hit first." },
    { day: 7, milestone: "You'll know whether retention is possible at this quality level." },
  ],
  launch: [
    { day: 2, milestone: "At least one distribution channel tested with real copy." },
    { day: 4, milestone: "Conversion data from the first 10 visitors." },
    { day: 7, milestone: "Enough CAC data to know if the channel is viable." },
  ],
  growth: [
    { day: 2, milestone: "One churned user interviewed — more insight than 50 analytics dashboards." },
    { day: 4, milestone: "Retention pattern surfaced: when users leave and why." },
    { day: 7, milestone: "Single biggest lever identified. BuildMind will focus every task on it." },
  ],
  revenue: [
    { day: 2, milestone: "Revenue leak mapped — where the biggest drop-off in acquisition-to-payment is." },
    { day: 4, milestone: "One pricing conversation completed." },
    { day: 7, milestone: "A testable hypothesis about the biggest revenue constraint." },
  ],
};

// ── Outcome colour helpers ───────────────────────────────────────────────────
export const OUTCOME_META: Record<Outcome, { icon: string; label: string; color: string }> = {
  completed: { icon: "✓", label: "Completed",         color: "var(--bm-text2)" },
  partial:   { icon: "–", label: "Partly done",       color: "var(--bm-text2)" },
  blocked:   { icon: "!", label: "Blocked",           color: "var(--bm-text2)" },
  learned:   { icon: "i", label: "Learned something", color: "var(--bm-text2)" },
};

/**
 * Fill the outreach script template with real project values so founders
 * can copy and send immediately without editing brackets.
 */
export function hydrateScript(
  template: string,
  productName: string,
  targetUsers: string,
  problem: string,
): string {
  return template
    .replace(/\[product\]/gi, productName || "[product]")
    .replace(/\[ProductName\]/g, productName || "[product]")
    .replace(/\[your product\]/gi, productName || "[your product]")
    .replace(/\[target users\]/gi, targetUsers || "[target users]")
    .replace(/\[problem\]/gi, problem || "[problem]")
    .replace(/\[your problem area\]/gi, problem || "[your problem area]")
    .replace(/\[Problem\]/g, problem || "[problem]");
}

export function inferAudienceFromAction(action: string, fallback: string): string {
  if (fallback.trim()) return fallback.trim();
  const match = action.match(/\b(?:to|with)\s+(?:\d+\s+)?(.+?)(?:\s+(?:on|via|today|who|and|while|before|after)|\s+[—-]|[.,]|$)/i);
  return match?.[1]?.trim() || "people in your target segment";
}

export function inferTopicFromAction(action: string, problem: string, productName: string): string {
  if (problem.trim()) return problem.trim();
  const about = action.match(/\b(?:about|around|with)\s+(.+?)(?:[.,]|[—-]|\s+today|\s+before|\s+after|$)/i);
  if (about?.[1]?.trim()) return about[1].trim();
  return productName.trim() ? `${productName.trim()} and the problem it solves` : "this workflow";
}

export function isGenericDraft(message: string): boolean {
  return /\b(this problem|your problem area|potential users|\[problem\]|\[target users\]|\[your product\])\b/i.test(message);
}

export function buildPersonalizedDraftFromAction(action: string, message: string, productName: string, targetUsers: string, problem: string): string {
  const hydrated = hydrateScript(message, productName, targetUsers, problem);
  const audience = inferAudienceFromAction(action, targetUsers);
  const topic = inferTopicFromAction(action, problem, productName);
  const base = !isGenericDraft(hydrated)
    ? hydrated
    : `Hi [Name], quick question - I'm researching ${topic} for ${audience}. How are you handling this today, and what is the most frustrating part? I'd value 10 minutes of honest context.`;
  return base;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// ── Greeting based on time of day ────────────────────────────────────────────
export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysSince(date?: string | null): number {
  if (!date) return 0;
  const created = new Date(date).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

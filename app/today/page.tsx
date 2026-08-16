"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, queryKeys, useFounderScorecardQuery } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { computeStartupScore } from "@/lib/buildmind";
import { computeScoreDelta, applyScoreDelta, getXP, recordScore } from "@/lib/scoring";
import { getStoredStreak, incrementDailyStreak, recordTaskCompletion, syncStreakFromServer } from "@/lib/plan";
import { observeTaskEvent } from "@/lib/founderMemory";
import { usePlan } from "@/lib/usePlan";
import { syncUrgencyFromServer } from "@/lib/urgency";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats, xpToLevel, getTotalXP } from "@/lib/achievements";
import { notifyReflectPending } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import MorningBriefingModal from "@/components/MorningBriefingModal";
import RecoveryModeCard from "@/components/RecoveryModeCard";
import { BlockerInsightCard } from "@/components/BlockerInsightCard";
import { PaywallMoment } from "@/components/PaywallMoment";
import { Clock, CheckCircle2, Copy, Check, Flame, Brain, Sparkles, AlertCircle, TrendingUp, RotateCcw, Zap, ArrowRight, Trophy } from "lucide-react";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { MobileCheckin } from "@/components/MobileCheckin";
import { ProfileCompletenessBar } from "@/components/ProfileCompletenessBar";
import { LoopNarrative } from "@/components/LoopNarrative";
import { broadcastTabEvent, useTabSync } from "@/lib/tabSync";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { getArchetypeDisplay } from "@/lib/founderArchetypeDisplay";
import { linkifyChannels } from "@/lib/linkifyChannels";
import GhostGoalBanner from "@/components/GhostGoalBanner";
import { recordOverride } from "@/lib/founderContext";
import { truncateChars } from "@/lib/textTruncate";
import type { MorningBriefing } from "@/lib/founderContext";
import { IntelligencePanel, type TodayIntelligenceSummary } from "./components/IntelligencePanel";
import { WhatChangedCard } from "./components/WhatChangedCard";
import { RisksGapsCard } from "./components/RisksGapsCard";
import { useUIMode } from "@/lib/uiMode";
import { UIModeToggle } from "@/components/ui/UIModeToggle";

type Outcome = "completed" | "blocked" | "partial" | "learned";
type ReflexionMeta = {
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
type MilestoneBreakResult = {
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

type ActionData = {
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
};

type CachedTodayAction = {
  date?: string;
  projectId?: string;
  stage?: string;
  data?: ActionData;
};

type DebtSuppression = {
  debtSuppressed: true;
  debtCategory?: string | null;
  debtMessage: string;
  interventionHint?: string;
  stage?: string;
};

function isActionData(value: unknown): value is ActionData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ActionData>;
  return (
    typeof data.action === "string" &&
    typeof data.message === "string" &&
    typeof data.why === "string" &&
    typeof data.time === "string"
  );
}

function sanitizeVisibleText(value: string): string {
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

function sanitizeActionData(data: ActionData): ActionData | null {
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

function unwrapActionPayload(payload: unknown): ActionData | null {
  if (!payload || typeof payload !== "object") return null;
  const maybePayload = payload as { data?: unknown };
  const candidate = isActionData(maybePayload.data) ? maybePayload.data : payload;
  return isActionData(candidate) ? sanitizeActionData({ ...candidate, isAI: true }) : null;
}

function unwrapDebtPayload(payload: unknown): DebtSuppression | null {
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
type StoredReflection = {
  action: string;
  outcome: Outcome;
  note?: string;
  confidence?: number;
  witnessed?: string; // acknowledgment line from app/reflect — surfaced here too, not just on /reflect
};

// ── Fallback actions (used when API is unavailable) ──────────────────────────
const DESTINATIONS: Record<string, { icon: string; label: string; url?: string }[]> = {
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

const STATIC_ACTIONS: Record<string, { action: string; message: string; why: string; time: string; destKey: string }> = {
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

function inferProjectAudience(targetUsers: string, productName: string, description = "", problem = ""): string {
  if (targetUsers.trim()) return targetUsers.trim();
  const haystack = `${productName} ${description} ${problem}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "data privacy officers or compliance managers";
  if (/(fintech|payment|bank|invoice|accounting|finance)/.test(haystack)) return "finance operators or fintech founders";
  if (/(health|clinic|patient|medical)/.test(haystack)) return "healthcare operators";
  if (/(school|student|teacher|course|learning)/.test(haystack)) return "education operators";
  if (/(shop|commerce|store|retail)/.test(haystack)) return "e-commerce operators";
  return productName.trim() ? `${productName.trim()} target users` : "people in your target segment";
}

function inferProjectProblem(problem: string, productName: string, description = ""): string {
  if (problem.trim()) return problem.trim();
  const haystack = `${productName} ${description}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "verifiable consent tracking and audit logging";
  if (description.trim()) return truncateChars(description, 120);
  return productName.trim() ? `${productName.trim()} and the workflow it improves` : "their current workflow";
}

function buildContextualStaticAction(
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

const OUTCOME_CHIPS: { id: Outcome; label: string; color: string; bg: string; border: string }[] = [
  { id: "completed", label: "Completed",         color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "partial",   label: "Partly done",       color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "blocked",   label: "Blocked",           color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "learned",   label: "Learned something", color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
];


// ── Week-one projections — shown in done state on first session ───────────────
const WEEK_ONE_MILESTONES: Record<string, { day: number; milestone: string }[]> = {
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
const OUTCOME_META: Record<Outcome, { icon: string; label: string; color: string }> = {
  completed: { icon: "✓", label: "Completed",         color: "var(--bm-text2)" },
  partial:   { icon: "–", label: "Partly done",       color: "var(--bm-text2)" },
  blocked:   { icon: "!", label: "Blocked",           color: "var(--bm-text2)" },
  learned:   { icon: "i", label: "Learned something", color: "var(--bm-text2)" },
};

/**
 * Build a human-readable causal sentence explaining WHY yesterday's outcome
 * shapes today's task. This is the key personalisation signal that was
 * previously invisible to the founder.
 */
function buildYesterdayCausalLine(reflection: StoredReflection): string {
  const { outcome, confidence = 3, note } = reflection;
  const noteClip = note ? ` ("${note.slice(0, 60)}${note.length > 60 ? "…" : ""}")` : "";

  if (outcome === "blocked") {
    return `You got blocked yesterday${noteClip}. Today's action is designed to remove that specific blocker — not route around it.`;
  }
  if (outcome === "completed" && confidence >= 4) {
    return `You nailed it yesterday${noteClip}. Today goes one level deeper on the same thread — keep the momentum.`;
  }
  if (outcome === "completed" && confidence < 3) {
    return `You completed it yesterday but confidence was low${noteClip}. Today starts with a confidence-building step first.`;
  }
  if (outcome === "partial") {
    return `You partly got there yesterday${noteClip}. Today's task picks up exactly where you left off.`;
  }
  if (outcome === "learned") {
    return `You learned something important yesterday${noteClip}. Today's action applies that insight to a real person.`;
  }
  return `Based on your reflection yesterday, today's action is calibrated to where you actually are.`;
}

/**
 * Fill the outreach script template with real project values so founders
 * can copy and send immediately without editing brackets.
 */
function hydrateScript(
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

function inferAudienceFromAction(action: string, fallback: string): string {
  if (fallback.trim()) return fallback.trim();
  const match = action.match(/\b(?:to|with)\s+(?:\d+\s+)?(.+?)(?:\s+(?:on|via|today|who|and|while|before|after)|\s+[—-]|[.,]|$)/i);
  return match?.[1]?.trim() || "people in your target segment";
}

function inferTopicFromAction(action: string, problem: string, productName: string): string {
  if (problem.trim()) return problem.trim();
  const about = action.match(/\b(?:about|around|with)\s+(.+?)(?:[.,]|[—-]|\s+today|\s+before|\s+after|$)/i);
  if (about?.[1]?.trim()) return about[1].trim();
  return productName.trim() ? `${productName.trim()} and the problem it solves` : "this workflow";
}

function isGenericDraft(message: string): boolean {
  return /\b(this problem|your problem area|potential users|\[problem\]|\[target users\]|\[your product\])\b/i.test(message);
}

function buildPersonalizedDraftFromAction(action: string, message: string, productName: string, targetUsers: string, problem: string): string {
  const hydrated = hydrateScript(message, productName, targetUsers, problem);
  const audience = inferAudienceFromAction(action, targetUsers);
  const topic = inferTopicFromAction(action, problem, productName);
  const base = !isGenericDraft(hydrated)
    ? hydrated
    : `Hi [Name], quick question - I'm researching ${topic} for ${audience}. How are you handling this today, and what is the most frustrating part? I'd value 10 minutes of honest context.`;
  return base;
}

function useIsMobile() {
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
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysSince(date?: string | null): number {
  if (!date) return 0;
  const created = new Date(date).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function TodayContent() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstSession = searchParams.get("first_session") === "true";
  const queryClient = useQueryClient();
  const { plan, isLoading: planLoading } = usePlan();
  const [uiMode, setUIMode] = useUIMode();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const project = useMemo(() => selectActiveProject(summaries, activeProjectId), [summaries, activeProjectId]);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  // Ref guard — prevents iOS double-tap from firing handleCheckIn twice
  const checkInFired = useRef(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [accountAgeDays, setAccountAgeDays] = useState(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  // Founder archetype — light presence on the daily page (see /memory for
  // the full explanation). This is one query for one string array, kept
  // deliberately separate from the big data-loading effects below so it
  // can't interfere with task loading if it ever fails.
  const [archetypeTags, setArchetypeTags] = useState<string[]>([]);
  const [stageNudge, setStageNudge] = useState<{ currentStage: string; nextStage: string; projectId: string | null } | null>(null);
  // Page-coherence: XP/level chip in the always-visible header, so leveling
  // up feels like a consequence of using Today rather than a fact you only
  // discover by remembering Achievements exists as a separate page.
  const [levelInfo, setLevelInfo] = useState<{ level: number; title: string } | null>(null);

  // AI-personalised action state
  const [aiAction, setAiAction] = useState<ActionData | null>(null);
  const [recentOutcomes, setRecentOutcomes] = useState<Array<{ action_shown: string; outcome: string; outcome_note: string | null; evidence_match_score: number | null; outcome_recorded_at: string | null }>>([]);
  const [debtSuppression, setDebtSuppression] = useState<DebtSuppression | null>(null);
  const [aiUsage, setAiUsage] = useState<{ monthlyUsed: number; monthlyLimit: number; unlimited: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [replacingTask, setReplacingTask] = useState(false);
  // FIX (task-repeat bug): holds the task text just rejected via "Replace
  // this task" so the next generation call can tell the server to exclude
  // it. A ref (not state) since it only needs to be read inside the
  // generation effect, not trigger a re-render on its own.
  const lastRejectedActionRef = useRef<string | null>(null);
  const [forceActionRefresh, setForceActionRefresh] = useState(0);
  // Progressive streaming label — shows which agent is currently running
  const [streamLabel, setStreamLabel] = useState<string | null>(null);

  // Milestone Break interstitial — fires after milestone/stage change
  const [milestoneBreak, setMilestoneBreak] = useState<MilestoneBreakResult | null>(null);
  const [milestoneBreakDismissed, setMilestoneBreakDismissed] = useState(false);

  // Auto level-up — fires when founder earns a stage promotion
  const [leveledUp, setLeveledUp] = useState<{ old_stage: string; new_stage: string } | null>(null);
  const [levelUpDismissed, setLevelUpDismissed] = useState(false);

  // Editable draft — pre-filled with real project values
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  // Yesterday's stored reflection — drives the causal thread UI
  const [yesterdayReflection, setYesterdayReflection] = useState<StoredReflection | null>(null);

  // Pattern detection — surfaces after check-in
  const [activePattern, setActivePattern] = useState<{ signal: string; message: string; severity: string } | null>(null);

  // Morning briefing
  const [briefingAvailable, setBriefingAvailable] = useState(false);
  const [morningBriefing, setMorningBriefing] = useState<MorningBriefing | null>(null);
  const [showBriefingModal, setShowBriefingModal] = useState(false);

  // Recovery Mode — shown when founder has 3+ days of momentum decay
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [blockerInsight, setBlockerInsight] = useState<{
    id: string; title: string; body: string; action_redirect: string | null;
  } | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  // Momentum decay banner — shown when score dropped 5+ pts this week
  const [decayDrop, setDecayDrop] = useState<number | null>(null);
  const [decayDismissed, setDecayDismissed] = useState(false);

  // Cognitive load — founder reports their capacity today
  const [cogLoad, setCogLoad] = useState<"low" | "normal" | "high" | null>(null);
  const [cogLoadSaved, setCogLoadSaved] = useState(false);

  // Push permission prompt — shown once after first check-in complete
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // Win attribution

  useEffect(() => {
    fetch("/api/ai/usage-status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { ok?: boolean; monthlyUsed?: number; monthlyLimit?: number; unlimited?: boolean } | null) => {
        // FIX: previously `d.monthlyLimit ?? 30` silently rendered a fabricated
        // "30 remaining" banner whenever the response was missing fields —
        // indistinguishable from a real 30-remaining state. Now only trust the
        // response when it explicitly succeeded AND returned real numbers;
        // otherwise leave aiUsage as null so the banner stays hidden rather
        // than showing a made-up number.
        if (d && d.ok && typeof d.monthlyUsed === "number" && typeof d.monthlyLimit === "number") {
          setAiUsage({ monthlyUsed: d.monthlyUsed, monthlyLimit: d.monthlyLimit, unlimited: d.unlimited ?? false });
        } else if (d && !d.ok) {
          console.warn("[usage-status] request succeeded but returned an error payload:", d);
        }
      })
      .catch(() => {});

    // "What happened last time" — cheap, read-only, no AI call. See
    // app/api/founder-context/recent-outcomes/route.ts.
    fetch("/api/founder-context/recent-outcomes", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { ok?: boolean; outcomes?: typeof recentOutcomes } | null) => {
        if (d?.ok && Array.isArray(d.outcomes)) setRecentOutcomes(d.outcomes);
      })
      .catch(() => {});

    // Fetch dismiss date first (fast), then briefing (slow — may generate)
    // Wrapped in async IIFE since useEffect callbacks cannot be async directly.
    //
    // FIX: skip entirely on a user's first session. isFirstSession existed
    // but was previously only used for copy tweaks — the briefing modal fired
    // regardless, showing a brand-new user a "morning briefing" with zero
    // real history to summarize, stacked on top of their first task and the
    // push-permission prompt below. All within ~1.5s of landing on mobile.
    if (!isFirstSession) void (async () => {
      const today = new Date().toISOString().slice(0, 10);

      // Step 1: check server dismiss state immediately (fast DB read)
      let serverDismissedToday = false;
      try {
        const memRes = await fetch("/api/founder-memory", { cache: "no-store", credentials: "include" });
        if (memRes.ok) {
          const mem = await memRes.json() as { data?: { briefing_dismissed_date?: string } } | null;
          serverDismissedToday = mem?.data?.briefing_dismissed_date === today;
        }
      } catch { /* non-fatal */ }

      // Step 2: if already dismissed today, skip the briefing fetch entirely
      if (serverDismissedToday) return;

      // Step 3: fetch briefing (may trigger AI generation — can take several seconds)
      try {
        const briefingRes = await fetch("/api/morning-briefing", { cache: "no-store" });
        const body = await briefingRes.json() as { ok?: boolean; data?: MorningBriefing; upgradePrompt?: boolean };

        if (briefingRes.status === 200 && body?.ok && body?.data) {
          setMorningBriefing(body.data);
          setBriefingAvailable(true);
          setShowBriefingModal(true);
        } else if (briefingRes.status === 403 && body?.upgradePrompt === true) {
          setBriefingAvailable(true);
          setShowBriefingModal(true);
        }
      } catch { /* non-fatal */ }
    })();

    // ── Recovery Mode check ─────────────────────────────────────────────────
    fetch("/api/recovery-mode", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { recoveryActive?: boolean; momentumScore?: number; daysInactive?: number } | null) => {
        if (d?.recoveryActive) setRecoveryActive(true);
        // Decay banner: if momentum < 50 and days_inactive > 0
        if (d && !d.recoveryActive && typeof d.momentumScore === "number" && d.momentumScore < 50) {
          setDecayDrop(50 - d.momentumScore);
        }
        setRecoveryChecked(true);
      })
      .catch(() => { setRecoveryChecked(true); });

    // ── Restore saved cognitive load from today ─────────────────────────────
    const todayKey = new Date().toISOString().slice(0, 10);
    const savedCogLoad = typeof localStorage !== "undefined"
      ? localStorage.getItem(`bm_cog_load_${todayKey}`) as "low" | "normal" | "high" | null
      : null;
    if (savedCogLoad) { setCogLoad(savedCogLoad); setCogLoadSaved(true); }
  }, []);

  // Founder archetype — isolated fetch, doesn't gate or block anything else on this page.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    Promise.resolve(
      supabase.from("founder_memory").select("personality_tags").eq("user_id", userId).maybeSingle(),
    )
      .then(({ data }) => {
        if (Array.isArray(data?.personality_tags)) setArchetypeTags(data.personality_tags as string[]);
      })
      .catch(() => {});
  }, [userId]);

  // Stage-transition nudge — isolated fetch, same non-blocking pattern as
  // the archetype badge above. Reads founder_context.pending_stage_transition,
  // which lib/server/stageTransition.ts's single canonical detector keeps
  // current (written after every task completion and every reflection —
  // see that file's header comment). Previously this only surfaced on the
  // project page, requiring a visit there to discover it existed at all.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    Promise.resolve(
      supabase.from("founder_context").select("pending_stage_transition").eq("user_id", userId).maybeSingle(),
    )
      .then(({ data }) => {
        const pending = (data as { pending_stage_transition?: {
          project_id?: string; current_stage?: string; recommended_stage?: string | null;
        } | null } | null)?.pending_stage_transition;
        if (pending?.recommended_stage) {
          setStageNudge({ currentStage: pending.current_stage ?? "", nextStage: pending.recommended_stage, projectId: pending.project_id ?? null });
        }
      })
      .catch(() => {});
  }, [userId]);

  // Level chip — client-only read (localStorage XP, now server-verified
  // before ever being committed there per the achievements fix, so this is
  // trustworthy without its own network round-trip). Re-reads whenever an
  // achievement toast fires so leveling up updates the header live.
  useEffect(() => {
    const read = () => {
      try { setLevelInfo(xpToLevel(getTotalXP())); } catch {}
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("bm_achievement_unlocked", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("bm_achievement_unlocked", read);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);

      // Resolve display name from user metadata
      const meta = data.user?.user_metadata ?? {};
      const name = (meta.full_name as string) || (meta.name as string) || data.user?.email?.split("@")[0] || null;
      setDisplayName(name);
      setAccountCreatedAt(data.user?.created_at ?? null);
      setAccountAgeDays(daysSince(data.user?.created_at));

      if (uid) {
        storage.onSignIn(uid);
        syncStreakFromServer().then(s => setStreak(s)).catch(() => {
          try { setStreak(getStoredStreak()); } catch {}
        });
        syncUrgencyFromServer().catch(() => {});

        // Fetch active blocker insight — the "cheat code" card
        fetch("/api/blocker-insight")
          .then(r => r.json())
          .then((json: { data?: { id: string; title: string; body: string; action_redirect: string | null } | null }) => {
            if (json?.data) setBlockerInsight(json.data);
          })
          .catch(() => {});

        const today = localDayKey();
        const checkinKey = `bm_checkin_done_date_${uid}`;
        const cachedDoneDate = storage.get(checkinKey);
        if (cachedDoneDate === today) setDone(true);

        fetchBehaviorState<{
          checkin_done_date: string;
          today_action: StoredReflection;
          today_action_cache: CachedTodayAction;
        }>(["checkin_done_date", "today_action", "today_action_cache"]).then(values => {
          if (values.checkin_done_date === today) {
            storage.set(checkinKey, today);
            storage.set("bm_checkin_done_date", today);
            setDone(true);
            return;
          }
          if (values.today_action?.outcome) {
            storage.setJSON("bm_today_action", values.today_action);
            setYesterdayReflection(values.today_action);
          }
          if (
            values.today_action_cache?.date === today &&
            values.today_action_cache?.projectId &&
            isActionData(values.today_action_cache.data)
          ) {
            storage.setJSON(`bm_today_action_cache_${uid}`, values.today_action_cache);
          }
        }).catch(() => {});
      }
    });

    // Load cached reflection instantly; server behavior state hydrates above.
    try {
      const stored = storage.getJSON("bm_today_action", null) as StoredReflection | null;
      if (stored?.outcome) {
        setYesterdayReflection(stored);
      }
    } catch {}
  }, []);

  // Fetch personalised action from AI once we have project data
  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    void (async () => {
    if (!project) return;
    const projectId = project.id;
    if (!userId || !projectId) return;

    // ── Fetch pending milestone-break interstitial ──────────────────────────
    // Stored by /api/ai/milestone-break in founder_memory.pending_milestone_break
    // (see migration 20260521000001_founder_memory_weekly_loop.sql). Must fetch
    // /api/founder-memory here, not /api/founder-context — the founder_context
    // table has no such column, and its route even mis-lists this field as a
    // boolean (app/api/founder-context/route.ts:65), so this fetch could never
    // have found the real value.
    fetch("/api/founder-memory", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((ctx: { data?: { pending_milestone_break?: string } } | null) => {
        if (!ctx?.data?.pending_milestone_break) return;
        try {
          const breakData = JSON.parse(ctx.data.pending_milestone_break) as MilestoneBreakResult;
          // Only show if generated within the last 24 hours and not already dismissed
          const age = Date.now() - new Date(breakData.generated_at).getTime();
          const dismissKey = `bm_milestone_break_dismissed_${breakData.generated_at}`;
          if (age < 24 * 60 * 60 * 1000 && !storage.get(dismissKey)) {
            setMilestoneBreak(breakData);
          }
        } catch { /* malformed */ }
      })
      .catch(() => {});

    const today = localDayKey();
    const currentStage = project.startup_stage ?? "Idea";
    const cacheKey = `bm_today_action_cache_${userId}`;

    // ── Reflection-aware cache busting ───────────────────────────────────────
    // If the founder reflected after the cache was written, the task must be
    // regenerated so it responds to that reflection. Without this, the same
    // task repeats regardless of what the founder reported.
    // Use parseInt to compare numerically — string comparison of "0" vs "0"
    // is always false, which previously caused new users to never bust the cache.
    const lastReflectionTime = parseInt(storage.get(`bm_last_reflection_ts_${userId}`) ?? "0", 10);
    const cachedAt = parseInt(storage.get(`bm_today_action_cache_ts_${userId}`) ?? "0", 10);

    // A reflection only busts the cache if it happened TODAY and AFTER the cache
    // was written. Yesterday's reflection (or any reflection from before today's
    // cache was generated overnight) must never force a live AI call — that's the
    // whole point of pre-generation. We compare date strings so timezone is respected.
    const reflectionDateKey = lastReflectionTime > 0
      ? new Date(lastReflectionTime).toISOString().slice(0, 10)
      : null;
    const reflectionIsNewerThanCache =
      lastReflectionTime > 0 &&
      cachedAt > 0 &&
      reflectionDateKey === today &&       // reflection must be from today
      lastReflectionTime > cachedAt;       // and after the cache was written

    const forceRefresh = forceActionRefresh > 0;

    // ── Step 1: localStorage (synchronous, instant) ─────────────────────────
    // Check this BEFORE the server round-trip so returning founders see their
    // task immediately on open — the overnight cache is already here from the
    // previous session's server-sync or the cron job's push.
    if (!forceRefresh) {
      try {
        const cached = storage.getJSON<CachedTodayAction | null>(cacheKey, null);
        if (
          !reflectionIsNewerThanCache &&
          cached?.date === today &&
          cached?.projectId === projectId &&
          cached?.stage === currentStage &&
          isActionData(cached.data)
        ) {
          setAiAction({ ...cached.data, isAI: true });
          // Still sync server cache in background — non-blocking
          void fetchBehaviorState<{ today_action_cache: CachedTodayAction & { generatedAt?: string } }>(["today_action_cache"])
            .then((serverCache) => {
              const serverTs = serverCache.today_action_cache?.generatedAt
                ? new Date(serverCache.today_action_cache.generatedAt).getTime()
                : 0;
              // If server has a newer overnight cache, upgrade silently
              if (
                serverTs > cachedAt &&
                serverCache.today_action_cache?.date === today &&
                serverCache.today_action_cache?.projectId === projectId &&
                serverCache.today_action_cache?.stage === currentStage &&
                isActionData(serverCache.today_action_cache.data)
              ) {
                storage.setJSON(cacheKey, serverCache.today_action_cache);
                storage.set(`bm_today_action_cache_ts_${userId}`, String(serverTs));
                setAiAction({ ...serverCache.today_action_cache.data, isAI: true });
              }
            })
            .catch(() => {});
          return;
        }
        // Stale localStorage entry — only remove if stage also matches (genuine bad data),
        // not if stage simply differs (that means server cache was written before project loaded).
        if (
          cached?.date === today &&
          cached?.projectId === projectId &&
          cached?.stage === currentStage &&
          !isActionData(cached.data)
        ) {
          storage.remove(cacheKey);
          storage.remove(`bm_today_action_cache_ts_${userId}`);
        }
      } catch {
        storage.remove(cacheKey);
      }
    } else {
      storage.remove(cacheKey);
      storage.remove(`bm_today_action_cache_ts_${userId}`);
    }

    // ── Step 2: Server cache (network round-trip) ───────────────────────────
    // Only reached if localStorage had no valid entry. Checks Supabase for the
    // overnight-generated task before falling through to a live AI call.
    const serverCache = await fetchBehaviorState<{ today_action_cache: CachedTodayAction & { generatedAt?: string } }>(["today_action_cache"]);
    const serverCacheTs = serverCache.today_action_cache?.generatedAt
      ? new Date(serverCache.today_action_cache.generatedAt).getTime()
      : 0;
    const serverReflectionIsNewerThanCache =
      lastReflectionTime > 0 &&
      serverCacheTs > 0 &&
      reflectionDateKey === today &&
      lastReflectionTime > serverCacheTs;

    // ── Gap fix: server says nothing is there — nuke localStorage too ────────
    // Previously, clearing the server-side cache row left localStorage untouched.
    // On the next page load, Step 1 found the stale localStorage entry and
    // returned early — the live AI call never ran. Fix: whenever the server
    // confirms the cache is absent (null/undefined), evict the localStorage
    // entry immediately so Step 1 can't resurrect it.
    if (!serverCache.today_action_cache) {
      storage.remove(cacheKey);
      storage.remove(`bm_today_action_cache_ts_${userId}`);
    }

    if (!forceRefresh) {
      if (
        !serverReflectionIsNewerThanCache &&
        serverCache.today_action_cache?.date === today &&
        serverCache.today_action_cache?.projectId === projectId &&
        serverCache.today_action_cache?.stage === currentStage &&
        isActionData(serverCache.today_action_cache.data)
      ) {
        // Sync to localStorage so next open is instant
        storage.setJSON(cacheKey, serverCache.today_action_cache);
        if (serverCacheTs > 0) storage.set(`bm_today_action_cache_ts_${userId}`, String(serverCacheTs));
        setAiAction({ ...serverCache.today_action_cache.data, isAI: true });
        return;
      }
      // Server cache exists but is stale — clear both server and localStorage
      // so the cron can rewrite cleanly and Step 1 can't serve the old entry.
      if (!forceRefresh) {
        storage.remove(cacheKey);
        storage.remove(`bm_today_action_cache_ts_${userId}`);
        await persistBehaviorState({ today_action_cache: null }).catch(() => {});
      }
    } else {
      storage.remove(cacheKey);
      storage.remove(`bm_today_action_cache_ts_${userId}`);
      await persistBehaviorState({ today_action_cache: null }).catch(() => {});
    }

    setActionLoading(true);

    const pendingMilestones = project.pendingMilestones ?? [];
    const pendingTasks = project.pendingTasks ?? [];

    const requestBody = JSON.stringify({
      userId,
      projectId,
      stage: currentStage,
      pendingMilestones,
      pendingTasks,
      completionRate: project.completion_rate ?? 0,
      // FIX (task-repeat bug): tells the server which task was just
      // rejected via "Replace this task" so buildDecisionState() can
      // exclude it from candidate ranking instead of re-picking it.
      excludeAction: lastRejectedActionRef.current ?? undefined,
    });

    // ── Streaming path (SSE) ─────────────────────────────────────────────────
    // Uses /api/ai/today-action/stream for progressive token delivery.
    // Cuts perceived latency from 15–20s to "instant with words appearing."
    // Falls back to the non-streaming JSON route on any SSE failure.
    let streamSucceeded = false;
    try {
      const streamRes = await fetch("/api/ai/today-action/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal,
      });

      if (streamRes.ok && streamRes.body) {
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (signal.aborted) { reader.cancel(); break; }
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const eventMatch = part.match(/^event:\s*(\S+)/m);
            const dataMatch  = part.match(/^data:\s*(.+)/m);
            if (!eventMatch || !dataMatch) continue;
            const event = eventMatch[1];
            let payload: unknown;
            try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

            // Surface agent progress so the UI shows live step labels
            if ((event === "agent_a" || event === "agent_b" || event === "agent_c") && payload && typeof payload === "object") {
              const p = payload as { status?: string; label?: string };
              if (p.status === "running" && p.label) {
                setStreamLabel(p.label);
              }
            }

            if (event === "done" && payload && typeof payload === "object") {
              const p = payload as Record<string, unknown>;
              const debtData = unwrapDebtPayload(p);
              if (debtData) {
                setDebtSuppression(debtData);
                setAiAction(null);
                setStreamLabel(null);
                streamSucceeded = true;
                break outer;
              }
              const actionData = unwrapActionPayload(p);
              if (!actionData) break outer;
              if (!signal.aborted) {
                setAiAction(actionData);
                setStreamLabel(null);
                // FIX (task-repeat bug): clear the rejection once a new
                // action has actually been generated — otherwise this same
                // task text would stay excluded forever, including on
                // tomorrow's fresh generation.
                lastRejectedActionRef.current = null;
                const cacheValue = { date: today, projectId, stage: currentStage, data: actionData };
                const nowTs = Date.now().toString();
                storage.setJSON(cacheKey, cacheValue);
                if (userId) storage.set(`bm_today_action_cache_ts_${userId}`, nowTs);
                persistBehaviorState({ today_action_cache: cacheValue });
              }
              streamSucceeded = true;
              break outer;
            }
            if (event === "error") break outer;
          }
        }
      }
    } catch { /* SSE unavailable — fall through to JSON fallback */ }

    // ── JSON fallback ────────────────────────────────────────────────────────
    if (!streamSucceeded) {
      fetch("/api/ai/today-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal,
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(json => {
          if (signal.aborted) return;
          const actionData = unwrapActionPayload(json);
          const debtData = unwrapDebtPayload(json);
          if (json?.success && debtData) {
            setDebtSuppression(debtData);
            setAiAction(null);
            return;
          }
          if (json?.success && actionData) {
            setDebtSuppression(null);
            setAiAction(actionData);
            lastRejectedActionRef.current = null;
            const cacheValue = { date: today, projectId, stage: currentStage, data: actionData };
            const nowTs = Date.now().toString();
            storage.setJSON(cacheKey, cacheValue);
            if (userId) storage.set(`bm_today_action_cache_ts_${userId}`, nowTs);
            persistBehaviorState({ today_action_cache: cacheValue });
          }
        })
        .catch(() => {})
        .finally(() => { if (!signal.aborted) setActionLoading(false); });
      return;
    }

    if (!signal.aborted) setActionLoading(false);
    })();

    return () => { abortController.abort(); };
  }, [project, userId, forceActionRefresh]);

  useEffect(() => {
    if (replacingTask && !actionLoading && (aiAction || debtSuppression)) {
      setReplacingTask(false);
    }
  }, [actionLoading, aiAction, debtSuppression, replacingTask]);

  // FIX: was calling getXP() directly (local storage), independent of the
  // same canonical scorecard reports/overview/project-detail now all read
  // from — the confirmed root cause of momentum/score disagreeing across
  // pages. `streak` here is left as this page's own local state
  // (unchanged) since it's already kept in sync elsewhere in this file;
  // only xp needed correcting.
  const { data: scorecard } = useFounderScorecardQuery();
  const score = project ? computeStartupScore({
    ...project,
    xp: scorecard?.xp ?? 0,
    streak,
  }) : 0;
  const stageKey = project?.startup_stage?.toLowerCase() ?? "idea";

  // Resolved project strings for template hydration
  const productName = project?.name ?? project?.title ?? "";
  const targetUsers = project?.target_users ?? "";
  const problem = project?.problem ?? "";
  const projectDescription = project?.description ?? "";

  // ── Multi-tab synchronization ─────────────────────────────────────────────
  // React to state changes made in other open tabs so they don't submit
  // a duplicate check-in after seeing a stale uncompleted form.
  useTabSync((event) => {
    if (event.type === "checkin_done") {
      const today = localDayKey();
      if (event.date === today) setDone(true);
    }
    if (event.type === "streak_updated") {
      setStreak(event.streak);
    }
    if (event.type === "plan_updated") {
      window.dispatchEvent(new Event("bm_plan_changed"));
    }
    if (event.type === "reflection_done") {
      // Invalidate cache so the next visit to Today shows a fresh action
      if (userId) {
        storage.set(`bm_last_reflection_ts_${userId}`, Date.now().toString());
      }
    }
  });

  // REC 2.4: stage transition challenge
  useEffect(() => {
    if (!project?.id || !project.startup_stage) return;
    const storageKey = `bm_last_stage_${project.id}`;
    const lastStage = storage.get(storageKey);
    const currentStage = project.startup_stage;

    if (lastStage && lastStage !== currentStage) {
      fetch("/api/ai/stage-transition-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          previousStage: lastStage,
          currentStage,
          triggerType: "stage_transition",
        }),
      }).catch(() => {});
      // Also fire milestone-break on stage transition — stores result for Today page interstitial
      fetch("/api/ai/milestone-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          previousStage: lastStage,
          currentStage,
          triggerType: "stage_transition",
        }),
      }).catch(() => {});
    }
    storage.set(storageKey, currentStage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.startup_stage]);

  const staticAction = buildContextualStaticAction(stageKey, productName, targetUsers, problem, projectDescription);
  const actionData = debtSuppression && !aiAction
    ? {
        action: "Name the execution debt before taking another task.",
        message: `${debtSuppression.debtMessage}\n\n${debtSuppression.interventionHint ?? "Answer the direct question honestly, then decide whether to continue or change the plan."}`,
        why: "Because the repeated avoidance pattern now matters more than another generic task.",
        time: "10 minutes",
        isAI: true,
      }
    : actionLoading && !aiAction
      ? null  // never show static fallback while AI is fetching
      : aiAction ?? { ...staticAction, isAI: false };
  const destinations = DESTINATIONS[aiAction?.destKey ?? stageKey] ?? DESTINATIONS.idea;

  // Memoize MobileCheckin visibility — avoids calling storage.get() on every
  // render (including each keystroke in the note textarea) and prevents the
  // React Strict Mode double-invoke side-effect in the render phase.
  const checkinSlot = useMemo(() => {
    const h = new Date().getHours();
    const today = localDayKey();
    const morningKey = `bm_morning_checkin_${today}`;
    const eveningKey = `bm_evening_checkin_${today}`;
    if (h >= 6 && h < 10 && !storage.get(morningKey)) return { type: "morning" as const, key: morningKey };
    if (h >= 18 && h < 22 && !storage.get(eveningKey)) return { type: "evening" as const, key: eveningKey };
    return null;
  // Re-evaluate once per hour is sufficient; userId dependency ensures it
  // re-runs after storage namespace is initialized for the current user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const OUTREACH_KEYWORDS = ["dm", "message", "send", "email", "outreach", "call", "text", "reach out", "post", "tweet", "share"];
  const isOutreachAction = actionData ? OUTREACH_KEYWORDS.some(kw =>
    actionData.action.toLowerCase().includes(kw) || actionData.message.toLowerCase().includes(kw)
  ) : false;

  // Hydrate draft with real project values on action change
  useEffect(() => {
    if (!actionData) return;
    setDraftMessage(buildPersonalizedDraftFromAction(actionData.action, actionData.message, productName, targetUsers, problem));
  }, [actionData?.action, actionData?.message, productName, targetUsers, problem]);

  function handleCopy() {
    if (!actionData) return;
    navigator.clipboard.writeText(draftMessage ?? actionData.message).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function handleShareMessage() {
    if (!actionData) return;
    const text = draftMessage ?? actionData.message;
    const nav = window.navigator as {
      share?: (data: ShareData) => Promise<void>;
      clipboard?: { writeText: (value: string) => Promise<void> };
    };
    try {
      if (typeof nav.share === "function") {
        await nav.share({ text });
      } else {
        await nav.clipboard?.writeText(text);
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {}
  }

  // ── Cognitive load save ────────────────────────────────────────────────────
  const handleCogLoad = useCallback((level: "low" | "normal" | "high") => {
    // Show the selected button highlighted for a beat before the card
    // collapses — otherwise cogLoadSaved flips true in the same render as
    // the click and the card unmounts before the tap registers visually.
    setCogLoad(level);
    const todayKey = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(`bm_cog_load_${todayKey}`, level); } catch {}
    fetch("/api/founder-context", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cognitive_load: level }),
    }).catch(() => {});
    setTimeout(() => setCogLoadSaved(true), 350);
  }, []);

  // ── Push permission request ────────────────────────────────────────────────
  const requestPushPermission = useCallback(async () => {
    setShowPushPrompt(false);
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub }),
        });
      }
    } catch { /* non-fatal */ }
  }, []);

  const handlePreTaskReplace = useCallback(async () => {
    setReplacingTask(true);
    // FIX (task-repeat bug): capture what's being rejected BEFORE it's
    // cleared below, so the next generation call can tell the server to
    // exclude it — see lastRejectedActionRef declaration for why.
    lastRejectedActionRef.current = aiAction?.action ?? null;
    // Fire override signal best-effort — do NOT block the task refresh on it
    recordOverride("Not the right task right now").catch(() => {});
    // Write skip signal to founder_memory so coach knows what this founder avoids
    if (aiAction?.action) {
      observeTaskEvent(aiAction.action, "skipped").catch(() => {});
    }
    // Always clear cache and fetch a new task regardless of plan or API response
    setAiAction(null);
    setDebtSuppression(null);
    setStreamLabel("Fetching a better-fit task...");
    storage.remove(`bm_today_action_cache_${userId}`);
    storage.remove(`bm_today_action_cache_ts_${userId}`);
    try {
      await persistBehaviorState({ today_action_cache: null });
    } catch { /* non-fatal */ }
    setForceActionRefresh((value) => value + 1);
    // Note: setReplacingTask(false) is handled by the action fetch completion
  }, [userId]);

  async function handleAcknowledgeDebt() {
    if (!project?.id || !userId) return;
    setActionLoading(true);
    try {
      const response = await fetch("/api/ai/today-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          projectId: project.id,
          stage: project.startup_stage ?? "Idea",
          pendingMilestones: project.pendingMilestones ?? [],
          pendingTasks: project.pendingTasks ?? [],
          completionRate: project.completion_rate ?? 0,
          acknowledgeDebt: true,
        }),
      });
      const json = await response.json();
      const nextAction = unwrapActionPayload(json);
      if (json?.success && nextAction) {
        setDebtSuppression(null);
        setAiAction(nextAction);
      }
    } catch {
      // Keep the debt card visible if generation fails.
    } finally {
      setActionLoading(false);
    }
  }

  function handleSwapAlternative(alt: NonNullable<TodayIntelligenceSummary["decision"]["alternatives"]>[number]) {
    if (!aiAction) return;
    const swappedAction: ActionData = {
      ...aiAction,
      action: alt.action,
      why: alt.why_it_beats_alternatives || aiAction.why,
      message: alt.action, // draft/script wasn't generated for alternatives — action text stands in until reflected
    };
    // Update the displayed action immediately — the founder shouldn't wait
    // on a network round-trip to see the swap take effect.
    setAiAction(swappedAction);

    // Persist to the SAME localStorage key the page reads on mount
    // (bm_today_action_cache_${userId}) — previously the swap only updated
    // React state, so navigating away and back re-read the untouched
    // pre-swap cache and silently reverted the swap. Bumping the timestamp
    // too so this is treated as the freshest cache, not overwritten by a
    // stale server-sync check.
    if (userId) {
      const currentStage = project?.startup_stage ?? "Idea";
      storage.setJSON(`bm_today_action_cache_${userId}`, {
        date: localDayKey(),
        projectId: project?.id ?? "",
        stage: currentStage,
        data: swappedAction,
      });
      storage.set(`bm_today_action_cache_ts_${userId}`, String(Date.now()));
    }

    // Fire-and-forget: repoints the pending Founder Intelligence prediction
    // at what the founder actually chose, AND persists the swap into the
    // server-side user_behavior_state cache (the actual source of truth a
    // fresh page load or a different device would read) and
    // founder_context.decision_cache (so Coach sees it too). Doesn't block
    // the swap from showing on this device — this keeps every OTHER reader
    // honest in the background.
    void fetch("/api/founder-context/swap-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate: alt, projectId: project?.id ?? "", stage: project?.startup_stage ?? "Idea" }),
    }).catch(() => {});
  }

  async function handleCheckIn(selectedOutcome: Outcome) {
    // Ref guard: prevents iOS double-tap from firing this twice before state updates
    if (checkInFired.current) return;
    checkInFired.current = true;
    setSubmitting(true);
    try {
      recordTaskCompletion();
      if (!storage.get("bm_first_task_completed_tracked")) {
        trackFunnelStep("first_task_completed");
        storage.set("bm_first_task_completed_tracked", "1");
      }
      const todayKey = `bm_task_done_${localDayKey()}`;
      storage.set(todayKey, "1");

      let serverStreak: number | null = null;
      try {
        const tcRes = await fetch("/api/founder-context/task-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: project?.startup_stage ?? "Idea",
            projectId: project?.id,
            taskTitle: actionData?.action ?? "",
            outcome: selectedOutcome,
            // FIX: tells task-complete whether a "shown" row already exists
            // for this task (created when it was generated). If it does,
            // /api/ai/reflexion-outcome below updates that row directly —
            // task-complete's own reflexion_learning_log insert now skips
            // itself in that case instead of writing a duplicate row.
            log_row_id: aiAction?.log_row_id ?? null,
          }),
        });
        if (tcRes.ok) {
          const tcData = await tcRes.json();
          if (tcData.tasksCompletedTotal != null) {
            const localTotal = parseInt(storage.get("bm_tasks_completed_total") ?? "0", 10) || 0;
            const resolved = Math.max(tcData.tasksCompletedTotal, localTotal);
            storage.set("bm_tasks_completed_total", String(resolved));
          }
          if (typeof tcData.streak === "number") {
            serverStreak = tcData.streak;
            storage.setStreak(tcData.streak);
            if (tcData.lastCheckinDate) storage.setLastCheckinDate(tcData.lastCheckinDate);
          }
          if (tcData.pattern?.signal) {
            setActivePattern(tcData.pattern);
          }
          if (tcData.xp != null) {
            storage.set("bm_xp", String(tcData.xp));
          }
        }
      } catch {}

      const stats = getAchievementStats();
      updateAchievementStats({
        ...stats,
        checkInsDone: (stats.checkInsDone ?? 0) + 1,
      });
      checkAndUnlockAchievements();
      notifyReflectPending();

      const todayDate = localDayKey();
      const todayActionState = { action: actionData?.action ?? "", outcome: selectedOutcome, note: "", confidence: 3 };
      storage.setJSON("bm_today_action", todayActionState);
      if (userId) {
        storage.remove(`bm_today_action_cache_${userId}`);
        storage.remove(`bm_today_action_cache_ts_${userId}`);
      }
      await persistBehaviorState({
        today_action: todayActionState,
        checkin_done_date: todayDate,
        today_action_cache: null,
      });
      setDone(true);

      // Show push permission prompt if not already granted
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        setTimeout(() => setShowPushPrompt(true), 1500);
      }

      if (userId) {
        storage.set(`bm_checkin_done_date_${userId}`, todayDate);
        storage.set(`bm_has_seen_today_${userId}`, "1");
      }
      storage.set("bm_checkin_done_date", todayDate);

      if (userId && project) {
        try {
          const delta = computeScoreDelta(selectedOutcome, 3);
          const currentScore = project.execution_score ?? score;
          const newScore = applyScoreDelta(currentScore, delta);
          const supabase = createClient();
          await supabase
            .from("projects")
            .update({ execution_score: newScore })
            .eq("id", project.id)
            .eq("user_id", userId);
          const newComputedScore = Math.min(100, Math.max(0, newScore));
          recordScore(newComputedScore);
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectSummaries });
          void queryClient.invalidateQueries({ queryKey: queryKeys.overviewRoot });

          // ── Auto level-up check ─────────────────────────────────────────────
          fetch("/api/project/level-up", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: project.id, new_execution_score: newComputedScore }),
          }).then(r => r.ok ? r.json() : null)
            .then((d: { leveled_up?: boolean; old_stage?: string; new_stage?: string } | null) => {
              if (d?.leveled_up && d.old_stage && d.new_stage) {
                setLeveledUp({ old_stage: d.old_stage, new_stage: d.new_stage });
                setLevelUpDismissed(false);
                void queryClient.invalidateQueries({ queryKey: queryKeys.projectSummaries });
              }
            }).catch(() => {});

          // ── Update ghost goal progress ──────────────────────────────────────
          // FIX: this call previously sent only current_score. The route's
          // `increment_tasks_done` flag existed but nothing ever set it, so
          // Ghost Goals' tasks_done stayed at whatever POST /api/weekly-goal
          // last reset it to (0) forever — the confirmed cause of "Ghost
          // Goals didn't increment" / "don't know where it's getting tasks
          // from" (it wasn't getting them from anywhere; the number was
          // static). Today's check-in is the one place a task is actually
          // completed, so this is the one place that should set the flag.
          fetch("/api/weekly-goal", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id:           project.id,
              current_score:        newComputedScore,
              increment_tasks_done: true,
            }),
          }).catch(() => {});
        } catch {}
      }

      if (userId) {
        try {
          await fetch("/api/founder-context", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tasks_accepted_this_week_increment: 1,
              days_inactive: 0,
              last_active: localDayKey(),
            }),
          });
        } catch {}
      }

      // ── Close the learning loop ───────────────────────────────────────────
      // Fire reflexion-outcome so the behavioral learning system records what
      // the founder actually did with today's AI-generated task. Without this
      // call, recordActionShown() fires but recordActionOutcome() never does,
      // meaning the learning loop has no signal from the highest-frequency interaction.
      if (aiAction?.log_row_id) {
        // Map today page outcomes to the reflexion-outcome schema
        const outcomeMap: Record<string, "completed" | "overridden" | "partial"> = {
          completed: "completed",
          partial:   "partial",
          blocked:   "overridden",
          learned:   "partial",
        };
        const mappedOutcome = outcomeMap[selectedOutcome as string] ?? "partial";
        fetch("/api/ai/reflexion-outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            log_row_id:   aiAction.log_row_id,
            outcome:      mappedOutcome,
            outcome_note: undefined,
          }),
        }).catch(() => {}); // best-effort — never blocks the check-in
      }

      // ── Write to founder_memory (avoidance_zones / strengths) ─────────────
      // This is the missing call that was designed but never wired.
      // observeTaskEvent() atomically appends to avoidance_zones when skipped
      // and to strengths when completed, so the AI Coach can mirror the founder's
      // actual behavioral patterns instead of returning empty arrays.
      if (aiAction?.action) {
        const observeOutcome =
          selectedOutcome === "completed" ? "completed" :
          selectedOutcome === "partial"   ? "completed" : // partial counts as a strength signal
          "skipped";
        observeTaskEvent(
          aiAction.action,
          observeOutcome,
        ).catch(() => {}); // client-side, best-effort
      }

      // ── Increment daily streak ────────────────────────────────────────────
      // Streak is earned here — on Today page action completion — not on Reflect
      // or any other page. incrementDailyStreak() is idempotent for the same day.
      const newStreak = serverStreak ?? incrementDailyStreak();
      setStreak(newStreak);
      // FIX: when task-complete above already succeeded, serverStreak is the
      // authoritative value the server just computed and returned — POSTing
      // it right back to /streak was a redundant round-trip (harmless, since
      // that route re-derives from its own atomic function and is idempotent
      // per day, but still a wasted request on every single check-in). Only
      // hit /streak when task-complete didn't give us a server value, i.e.
      // the fallback path where incrementDailyStreak() computed a local-only
      // number the server has never seen and needs to learn about.
      if (serverStreak == null) {
        fetch("/api/founder-context/streak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ streak: newStreak, lastCheckinDate: localDayKey() }),
        }).catch(() => {});
      }

      // Notify other open tabs so they show the done state immediately
      const todayBroadcast = localDayKey();
      broadcastTabEvent({ type: "checkin_done", date: todayBroadcast });
      broadcastTabEvent({ type: "streak_updated", streak: newStreak });

    } finally { setSubmitting(false); checkInFired.current = false; }
  }

  if (isLoading) return (
    <div className="mx-auto max-w-[820px] px-6 py-7">
      <div className="mb-6 space-y-3 border-b border-[var(--bm-border)] pb-5">
        <div className="h-3 w-28 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
        <div className="h-7 w-3/5 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
        <div className="h-4 w-2/5 animate-pulse rounded-lg bg-[var(--bm-bg3)]" />
      </div>
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]" />
          <div className="h-28 animate-pulse rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]" />
        </div>
      </div>
    </div>
  );

  // ── Milestone Break interstitial — mandatory checkpoint after milestone/stage change, or a stalled milestone ──
  if (milestoneBreak && !milestoneBreakDismissed) {
    const isStalling = milestoneBreak.trigger === "stalling";
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "40px 16px" : "80px 24px" }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: isStalling ? "var(--bm-amber)" : "var(--bm-red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertCircle size={16} color={isStalling ? "#000" : "#fff"} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                {isStalling ? "Still open" : "Mandatory checkpoint"}
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", margin: 0, lineHeight: 1.3 }}>
                {isStalling
                  ? `Still working on: ${sanitizeOutput(milestoneBreak.triggerLabel)}`
                  : `You just completed: ${sanitizeOutput(milestoneBreak.triggerLabel)}`}
              </p>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 24 }}>
            {isStalling
              ? "This has been open longer than expected. No judgment — some milestones just run long. Here's what's likely actually going on."
              : "Before you move to the next milestone, here's what could still kill this."}
          </p>

          {/* 3 brutal points */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {milestoneBreak.brutal_points.map((point, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bm-red)", marginTop: 6, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>{sanitizeOutput(point)}</p>
              </motion.div>
            ))}
          </div>

          {/* Recommended action */}
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Recommended action before continuing</p>
            <p style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500, margin: 0, lineHeight: 1.6 }}>→ {sanitizeOutput(milestoneBreak.recommended_action)}</p>
          </div>

          {/* Acknowledge button */}
          <button
            onClick={() => {
              const dismissKey = `bm_milestone_break_dismissed_${milestoneBreak.generated_at}`;
              // Optimistically dismiss in UI, revert if server fails
              setMilestoneBreakDismissed(true);
              storage.set(dismissKey, "1");
              fetch("/api/founder-memory", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pending_milestone_break: null }),
              }).catch(() => {
                // Server PATCH failed — keep the local dismiss flag so the
                // interstitial doesn't reappear mid-session, but clear the
                // storage key so it re-shows on hard reload (server is source of truth).
                storage.remove(dismissKey);
              });
            }}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
              background: "var(--bm-text)", color: "var(--bm-bg)",
              fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            I've acknowledged this — continue to today's task →
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Done state ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "36px 0" : "60px 24px", textAlign: "center" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle2 size={28} color="var(--bm-accent)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 10 }}>
            Insight logged. BuildMind adapts.
          </h2>
          <p style={{ fontSize: 14, color: "var(--bm-text3)", marginBottom: isFirstSession ? 16 : 20, lineHeight: 1.6 }}>
            {displayName ? `Come back tomorrow, ${displayName.split(" ")[0]}. Consistency compounds.` : "Come back tomorrow. Consistency compounds."}
          </p>

          {/* ── First-session: 7-day projection ── */}
          {isFirstSession && (() => {
            const sk = (project?.startup_stage ?? "Idea").toLowerCase();
            const milestones = WEEK_ONE_MILESTONES[sk] ?? WEEK_ONE_MILESTONES.idea;
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, textAlign: "left" }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                  If you do this every day — week 1 for a {project?.startup_stage ?? "Idea"} stage founder
                </div>
                {milestones.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < milestones.length - 1 ? 10 : 0, marginBottom: i < milestones.length - 1 ? 10 : 0, borderBottom: i < milestones.length - 1 ? "1px solid var(--bm-border)" : "none" }}>
                    <span style={{ fontSize: 11, color: "var(--bm-text4)", fontFamily: "monospace", paddingTop: 1, flexShrink: 0, minWidth: 36 }}>Day {m.day}</span>
                    <span style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>{m.milestone}</span>
                  </div>
                ))}
              </motion.div>
            );
          })()}

          {activePattern && (
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <PaywallMoment
                trigger={plan === "free" ? "pattern" : "pattern"}
                patternMessage={activePattern.message}
                onDismiss={() => setActivePattern(null)}
              />
            </div>
          )}



          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "center" }}>
            <button onClick={() => router.push("/reflect")} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reflect on today →</button>
            <button onClick={() => router.push("/overview")} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>View full dashboard</button>
          </div>
        </motion.div>

        <div style={{ marginTop: 24, padding: "14px 18px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "0 0 10px" }}>Know a founder who needs this?</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => router.push("/invite")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", background: "var(--bm-accent-dim)", color: "var(--bm-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Invite a founder →
            </button>
            <button onClick={() => router.push("/progress")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Share this week's progress
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Greeting line ─────────────────────────────────────────────────────────
  const firstName = displayName?.split(" ")[0] ?? null;
  const greetingLine = firstName
    ? `${getGreeting()}, ${firstName}`
    : getGreeting();

  // ── Yesterday causal sentence ─────────────────────────────────────────────
  const yesterdayCausal = yesterdayReflection
    ? buildYesterdayCausalLine(yesterdayReflection)
    : null;
  const isDayOneColdStart = accountAgeDays <= 1 && streak === 0 && !done;
  const weekOneStageKey = (project?.startup_stage ?? "Idea").toLowerCase();
  const weekOneMilestones = WEEK_ONE_MILESTONES[weekOneStageKey] ?? WEEK_ONE_MILESTONES.idea;
  const weekOneTarget = weekOneMilestones[weekOneMilestones.length - 1]?.milestone ?? WEEK_ONE_MILESTONES.idea[2].milestone;
  const weekOneStartDate = accountCreatedAt ? new Date(accountCreatedAt) : new Date();
  const weekOneDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekOneStartDate, index);
    const key = localDayKey(date);
    const completed = Boolean(storage.get(`bm_task_done_${key}`) || storage.get(`bm_checkin_done_date_${userId}`) === key || storage.get("bm_checkin_done_date") === key);
    return {
      day: index + 1,
      completed,
      active: index === Math.min(6, Math.max(0, accountAgeDays)),
    };
  });

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: isMobile ? "0 0 24px" : "20px 8px 48px" }}>

      {/* ══ HERO HEADER — logo, UI mode toggle, streak/plan usage, page title.
          Previously trapped behind a collapsed "context" drawer (collapsed by
          default), which meant the Simple/Pro toggle — and by extension the
          Intelligence Panel that toggle controls — was invisible until a
          founder happened to open "Why this task?". Now always rendered at
          the top of the page. ══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ marginBottom: 22 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "var(--bm-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={14} color="#fff" />
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--bm-text3)",
                letterSpacing: "-0.01em",
              }}
            >
              BuildMind
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UIModeToggle mode={uiMode} onChange={setUIMode} />
          {isDayOneColdStart ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 9px",
                borderRadius: 5,
                background: "var(--bm-accent-dim)",
                border: "1px solid var(--bm-accent-bd)",
              }}
            >
              <Flame size={11} color="var(--bm-accent)" />
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--bm-accent)", fontFamily: "'DM Mono', monospace" }}>
                Start your streak today
              </span>
            </div>
          ) : streak > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 9px",
                borderRadius: 5,
                background: "var(--bm-bg2)",
                border: "1px solid var(--bm-border)",
              }}
            >
              <Flame size={11} color="var(--bm-text3)" />
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace" }}>
                {streak}d streak
              </span>
            </div>
          )}
          {levelInfo && (
            <a
              href="/achievements"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 9px", borderRadius: 5,
                background: "var(--bm-intel-dim)", border: "1px solid var(--bm-intel-bd)",
                textDecoration: "none",
              }}
            >
              <Trophy size={11} color="var(--bm-intel2)" />
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--bm-intel2)", fontFamily: "'DM Mono', monospace" }}>
                Lv {levelInfo.level} · {levelInfo.title}
              </span>
            </a>
          )}
          </div>
        </div>

        <div style={{ paddingBottom: 18, borderBottom: "1px solid var(--bm-border)" }}>
          <p
            style={{
              fontSize: 12,
              color: "var(--bm-text3)",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 6px",
            }}
          >
            {greetingLine}
          </p>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "clamp(20px, 3.5vw, 26px)",
              fontWeight: 700,
              color: "var(--bm-text)",
              letterSpacing: "-0.025em",
              lineHeight: 1.2,
              margin: "0 0 8px",
            }}
          >
            {productName
              ? `${productName}: today's operating focus`
              : "Today's operating focus"}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--bm-text2)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {[
              project?.startup_stage ? `${project.startup_stage} stage` : null,
              targetUsers ? `serving ${targetUsers}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* AI usage warning */}
        {aiUsage && !aiUsage.unlimited && (aiUsage.monthlyLimit - aiUsage.monthlyUsed) <= 5 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--bm-text3)", fontWeight: 600, flex: 1 }}>
              {aiUsage.monthlyLimit - aiUsage.monthlyUsed} AI calls remaining this month.
            </span>
            <a href="/upgrade" style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-accent)", textDecoration: "none", whiteSpace: "nowrap" }}>Upgrade for unlimited →</a>
          </div>
        )}
      </motion.div>

      {/* ── Founder archetype — compact, non-blocking presence on the daily
          page. Deliberately not a modal or a dismiss-to-proceed gate (that
          was the problem with the old Initial Analysis card) — just a small
          persistent badge, since this is a core signal the AI uses on every
          task and it should be visible somewhere the founder actually looks
          daily, not just on /memory. Tap through for the full explanation.
          Kept always-visible alongside the Intelligence Panel per the
          founder's explicit request — everything else that used to live in
          this spot moved into (or stayed in) the "Why this task?" drawer. */}
      {(() => {
        const archetype = getArchetypeDisplay(archetypeTags);
        if (!archetype) return null;
        return (
          <a
            href="/memory"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", marginBottom: 22,
              borderRadius: 10, border: "1px solid var(--bm-border)", background: "var(--bm-bg2)",
              textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{archetype.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text)" }}>{archetype.name}</span>
              <span style={{ fontSize: 11, color: "var(--bm-text3)", marginLeft: 8 }}>— your founder archetype</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--bm-text4)", flexShrink: 0 }}>Learn more →</span>
          </a>
        );
      })()}

      {/* ── Stage-transition nudge — one line, links to the full prompt on
          the project page rather than duplicating it here. See
          lib/server/stageTransition.ts for how this gets computed. ── */}
      {stageNudge && (
        <a
          href={stageNudge.projectId ? `/projects/${stageNudge.projectId}` : "/projects"}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 14px", marginBottom: 22,
            borderRadius: 10, border: "1px solid var(--bm-green-bd)", background: "var(--bm-green-dim)",
            textDecoration: "none", fontSize: 12, color: "var(--bm-green)",
          }}
        >
          <span style={{ flex: 1 }}>
            You're hitting {stageNudge.nextStage}-stage signals — ready to move up?
          </span>
          <span style={{ fontSize: 11, flexShrink: 0 }}>See why →</span>
        </a>
      )}

      {/* ══ PRODUCT IMPROVEMENT #2 — TASK-FIRST LAYOUT ══
          Project badge is 1 line, then ACTION CARD is the first full block.
          All context (yesterday, analysis, check-ins) moves into a
          collapsible drawer below the action card.
      ══════════════════════════════════════════════════ */}

      {/* Lightweight project + stage badge */}
      {project && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text2)", letterSpacing: "-0.01em" }}>
            {project.name ?? "Your startup"}
          </span>
          {project.startup_stage && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              padding: "2px 8px",
              borderRadius: "var(--r-sm)",
              background: "var(--bm-accent-dim)",
              color: "var(--bm-accent)",
              border: "1px solid var(--bm-accent-bd)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>
              {project.startup_stage}
            </span>
          )}
          {isDayOneColdStart ? (
            <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--bm-accent)" }}>
              Start your streak today
            </span>
          ) : streak > 0 && (
            <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--bm-text4)" }}>
              {streak}d
            </span>
          )}
        </div>
      )}

      {/* ── Ghost Goal Banner — restored; was never behind a toggle, just
          removed in the same aggressive pass as the alert cards. Keep. ── */}
      {/* ── Ghost Goal Banner ─────────────────────────────────────────────── */}
      {project && (
        <GhostGoalBanner
          projectId={project.id}
          currentScore={score}
          stage={project.startup_stage ?? "Idea"}
          executionScore={project.execution_score ?? 0}
          streak={streak}
          startupSummary={(project as unknown as Record<string, unknown>).startup_summary as string | undefined}
          projectName={project.name ?? project.title ?? ""}
        />
      )}

      {/* ── Context drawer (collapsed by default) — everything below wraps here ── */}
      {isContextOpen && (<>

      {/* ── Reflexion Strike Replay — day one causal thread (same visual as yesterdayReflection) ── */}
      {isFirstSession && !yesterdayReflection && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* Left: icon + connector — identical to yesterdayReflection */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 2 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--bm-accent)", flexShrink: 0 }}>
                ⚡
              </div>
              <div style={{ width: 1, flex: 1, minHeight: 16, background: "var(--bm-border2)", margin: "4px 0" }} />
              <RotateCcw size={12} color="var(--bm-accent)" />
            </div>
            {/* Right: content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>From your Reflexion Strike</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600, color: "var(--bm-accent)", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                  Market gap identified
                </span>
              </div>
              {project?.problem && (
                <p style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 6, lineHeight: 1.5, fontStyle: "italic" }}>
                  &ldquo;{sanitizeOutput(project.problem).slice(0, 100)}{sanitizeOutput(project.problem).length > 100 ? "…" : ""}&rdquo;
                </p>
              )}
              {/* Causal link inset — identical structure to yesterdayReflection */}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                <RotateCcw size={10} color="var(--bm-text3)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11, color: "var(--bm-text2)", margin: 0, lineHeight: 1.55 }}>
                  This is your starting baseline. The system has no history on you yet — every reflection you log tonight makes tomorrow&apos;s task sharper.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Profile completeness ── */}
      <ProfileCompletenessBar
        asBanner
        fields={{
          startupSummary: project?.description ?? project?.startup_summary ?? "",
          stage:          project?.startup_stage ?? "",
          targetUsers:    project?.target_users ?? "",
          avoidanceZones: [],
          mrr:            project?.current_mrr ?? 0,
          displayName:    project?.name ?? "",
          tasksCompleted: project?.tasksCompleted ?? 0,
        }}
      />

      {/* ── Morning / evening mobile check-in ── */}
      {checkinSlot && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 16 }}>
          <MobileCheckin type={checkinSlot.type} onComplete={(note) => {
            storage.set(checkinSlot.key, "1");
            const endpoint = checkinSlot.type === "morning" ? "/api/morning-checkin" : "/api/evening-checkin";
            fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => {});
          }} />
        </motion.div>
      )}

      {/* ── Pre-check-in paywall ── */}

      {/* ══════════════════════════════════════════════════════════════════════
          YESTERDAY'S REFLECTION THREAD
          Shows the causal link between yesterday's outcome and today's task.
          Previously invisible — now the first thing the founder sees.
      ══════════════════════════════════════════════════════════════════════ */}
      {yesterdayReflection && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border2)",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* Left: outcome dot + connector */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 2 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "var(--bm-bg3)",
                border: "1px solid var(--bm-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
                color: OUTCOME_META[yesterdayReflection.outcome].color,
                flexShrink: 0,
              }}>
                {OUTCOME_META[yesterdayReflection.outcome].icon}
              </div>
              <div style={{ width: 1, flex: 1, minHeight: 16, background: "var(--bm-border2)", margin: "4px 0" }} />
              <RotateCcw size={12} color="var(--bm-accent)" />
            </div>

            {/* Right: content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Witnessed — rendered FIRST, above everything else, distinct styling.
                  This is the acknowledgment line, not analysis — it should read
                  differently from the outcome badge and causal link below it. */}
              {yesterdayReflection.witnessed && (
                <p style={{
                  fontSize: 13,
                  color: "var(--bm-text)",
                  marginBottom: 8,
                  lineHeight: 1.5,
                  fontWeight: 500,
                }}>
                  {sanitizeOutput(yesterdayReflection.witnessed)}
                </p>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Yesterday</span>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                  color: OUTCOME_META[yesterdayReflection.outcome].color,
                  background: "var(--bm-bg3)",
                  border: "1px solid var(--bm-border)",
                }}>
                  {OUTCOME_META[yesterdayReflection.outcome].label}
                </span>
              </div>

              {yesterdayReflection.action && (
                <p style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 6, lineHeight: 1.5, fontStyle: "italic" }}>
                  "{sanitizeOutput(yesterdayReflection.action).slice(0, 100)}{sanitizeOutput(yesterdayReflection.action).length > 100 ? "…" : ""}"
                </p>
              )}

              {/* The causal link — the key personalisation signal */}
              <div style={{
                display: "flex", gap: 6, alignItems: "flex-start",
                padding: "8px 10px", borderRadius: 8,
                background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
              }}>
                <RotateCcw size={10} color="var(--bm-text3)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11, color: "var(--bm-text2)", margin: 0, lineHeight: 1.55 }}>
                  {sanitizeOutput(yesterdayCausal)}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══ FOCUS CALLOUT ══════════════════════════════════════════════════════ */}
      {!yesterdayReflection && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 14, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", display: "flex", alignItems: "center", gap: 10 }}
        >
          <TrendingUp size={13} color="var(--bm-text3)" style={{ flexShrink: 0 }} />
          {isFirstSession ? (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 4px" }}>
                Day one. No history yet — this is how BuildMind learns.
              </p>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0, lineHeight: 1.55 }}>
                Complete today&apos;s action and reflect tonight. That reflection becomes the input for tomorrow&apos;s task.
                After 3 sessions, you&apos;ll start seeing behavioral patterns specific to how <em>you</em> build.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0, lineHeight: 1.5 }}>
              BuildMind gives you <strong style={{ color: "var(--bm-text2)" }}>one action per day</strong> - calibrated to your stage, your roadmap, and what you did yesterday. Do it before anything else.
            </p>
          )}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PENDING CONTEXT STRIP — what's powering this recommendation
      ══════════════════════════════════════════════════════════════════════ */}
      {(project?.pendingMilestones?.length ?? 0) > 0 || (project?.pendingTasks?.length ?? 0) > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{
            padding: "10px 14px", borderRadius: 12, marginBottom: 14,
            background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
            display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
            From your roadmap
          </span>
          {project?.pendingMilestones?.slice(0, 2).map((m: string, i: number) => (
            <span key={i} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 99,
              background: "var(--bm-bg2)", color: "var(--bm-text3)",
              border: "1px solid var(--bm-border2)", fontWeight: 600,
            }}>
              ◎ {m}
            </span>
          ))}
          {project?.pendingTasks?.slice(0, 2).map((t: string, i: number) => (
            <span key={i} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 99,
              background: "var(--bm-bg2)", color: "var(--bm-text3)",
              border: "1px solid var(--bm-border2)", fontWeight: 500,
            }}>
              ✦ {t}
            </span>
          ))}
          <button
            onClick={() => router.push("/projects")}
            style={{
              marginLeft: "auto", fontSize: 10, color: "var(--bm-text4)", background: "none",
              border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
            }}
          >
            Edit tasks →
          </button>
        </motion.div>
      ) : null}

      </>)}

      {/* ── "Why this task?" disclosure toggle ── */}
      <button
        onClick={() => setIsContextOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--bm-text4)", fontSize: 11, fontFamily: "inherit", padding: 0,
        }}
      >
        <span style={{ fontSize: 10, transform: isContextOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
        {isContextOpen ? "Hide context" : "Why this task?"}
      </button>

      {debtSuppression && !aiAction && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border2)",
            borderRadius: 12,
            padding: isMobile ? 18 : 22,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <AlertCircle size={20} color="var(--bm-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
                Execution debt
              </div>
              <p style={{ color: "var(--bm-text)", fontSize: isMobile ? 17 : 18, lineHeight: 1.45, margin: "0 0 10px" }}>
                {sanitizeOutput(debtSuppression.debtMessage)}
              </p>
              {debtSuppression.interventionHint && (
                <p style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55, margin: "0 0 14px" }}>
                  {debtSuppression.interventionHint}
                </p>
              )}
              <button
                onClick={() => void handleAcknowledgeDebt()}
                disabled={actionLoading}
                style={{
                  border: "1px solid var(--bm-accent-bd)",
                  background: "var(--bm-accent-dim)",
                  color: "var(--bm-accent)",
                  borderRadius: 8,
                  padding: "9px 12px",
                  cursor: actionLoading ? "default" : "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              >
                {actionLoading ? "Generating..." : "I understand - give me today's task"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ACTION CARD — first real content block (task-first layout)
      ══════════════════════════════════════════════════════════════════════ */}
      {!actionData ? (
        /* Loading skeleton — shown while AI fetch is in flight */
        /* Never shows generic task; waits for the real personalised task */
        <div
          style={{
            padding: 1,
            borderRadius: 12,
            background: "var(--bm-border2)",
            marginBottom: 14,
          }}
        >
          <div style={{ background: "var(--bm-bg2)", borderRadius: 11, padding: isMobile ? "20px" : "28px 30px 24px" }}>
            {/* Meta row skeleton */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ height: 22, width: 90, borderRadius: 4, background: "var(--bm-bg3)", animation: "bm-pulse 1.4s ease-in-out infinite" }} />
              <div style={{ height: 22, width: 120, borderRadius: 4, background: "var(--bm-bg3)", animation: "bm-pulse 1.4s ease-in-out infinite 0.1s" }} />
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--bm-accent)", opacity: 0.7, animation: "bm-pulse 1.2s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>{streamLabel ?? "Calibrating task..."}</span>
              </div>
            </div>

            {/* Primary action skeleton */}
            <div style={{ background: "var(--bm-bg)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: isMobile ? "16px" : "18px", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--bm-bg3)", flexShrink: 0, animation: "bm-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 10, width: 100, borderRadius: 4, background: "var(--bm-bg3)", marginBottom: 12, animation: "bm-pulse 1.4s ease-in-out infinite" }} />
                  <div style={{ height: 28, width: "90%", borderRadius: 6, background: "var(--bm-bg3)", marginBottom: 8, animation: "bm-pulse 1.4s ease-in-out infinite 0.05s" }} />
                  <div style={{ height: 28, width: "70%", borderRadius: 6, background: "var(--bm-bg3)", marginBottom: 10, animation: "bm-pulse 1.4s ease-in-out infinite 0.1s" }} />
                  <div style={{ height: 14, width: "80%", borderRadius: 4, background: "var(--bm-bg3)", animation: "bm-pulse 1.4s ease-in-out infinite 0.15s" }} />
                </div>
              </div>
            </div>

            {/* Rationale skeleton */}
            <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
              <div style={{ height: 10, width: 120, borderRadius: 4, background: "var(--bm-bg4)", marginBottom: 10, animation: "bm-pulse 1.4s ease-in-out infinite" }} />
              <div style={{ height: 14, width: "95%", borderRadius: 4, background: "var(--bm-bg4)", marginBottom: 6, animation: "bm-pulse 1.4s ease-in-out infinite 0.05s" }} />
              <div style={{ height: 14, width: "80%", borderRadius: 4, background: "var(--bm-bg4)", animation: "bm-pulse 1.4s ease-in-out infinite 0.1s" }} />
            </div>

            {/* Draft skeleton */}
            <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ height: 10, width: 110, borderRadius: 4, background: "var(--bm-bg4)", marginBottom: 12, animation: "bm-pulse 1.4s ease-in-out infinite" }} />
              <div style={{ height: 80, borderRadius: 9, background: "var(--bm-bg4)", animation: "bm-pulse 1.4s ease-in-out infinite 0.1s" }} />
            </div>
          </div>
        </div>
      ) : (
        <>
        {uiMode === "pro" && actionData.intelligence && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <WhatChangedCard items={actionData.intelligence.what_changed} />
            <RisksGapsCard signals={actionData.intelligence.top_signals} />
          </div>
        )}
        <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        style={{
          padding: 1,
            borderRadius: 12,
            background: "var(--bm-accent-bd)",
            marginBottom: 14,
            transition: "background 0.4s",
          }}
      >
        <div style={{ background: "var(--bm-bg2)", borderRadius: 11, padding: isMobile ? "20px" : "28px 30px 24px" }}>

          {/* Meta row — simplified */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {project?.startup_stage && (
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'DM Mono', monospace" }}>
                {project.startup_stage} stage
              </span>
            )}
            {actionData.isAI && !actionLoading && (
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "var(--bm-bg3)", color: "var(--bm-text3)", border: "1px solid var(--bm-border)", fontWeight: 400, fontFamily: "'DM Mono', monospace" }}>
                Context calibrated
              </span>
            )}
            {actionLoading && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--bm-accent)", opacity: 0.6, animation: "bm-pulse 1.2s ease-in-out infinite" }} />
                {sanitizeOutput(streamLabel ?? "Calibrating...")}
              </span>
            )}
            {!actionData.isAI && !actionLoading && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--bm-text4)", fontStyle: "italic" }}>
                Baseline objective
              </span>
            )}
            <span style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: "var(--space-1)", marginLeft: "auto" }}>
              {actionData.difficulty && (
                <span style={{
                  fontSize: "var(--text-xs)", fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                  textTransform: "capitalize",
                  color: actionData.difficulty === "deep" ? "var(--bm-red)" : actionData.difficulty === "light" ? "var(--bm-green)" : "var(--bm-text3)",
                  background: actionData.difficulty === "deep" ? "rgba(224,85,85,0.12)" : actionData.difficulty === "light" ? "rgba(74,184,176,0.12)" : "var(--bm-bg3)",
                  border: `1px solid ${actionData.difficulty === "deep" ? "rgba(224,85,85,0.3)" : actionData.difficulty === "light" ? "rgba(74,184,176,0.3)" : "var(--bm-border)"}`,
                }}>
                  {actionData.difficulty}
                </span>
              )}
              <Clock size={11} /> {actionData.time}
            </span>
          </div>

          {/* Primary action — reference-style "highest-leverage action" card */}
          <div style={{
            background: "linear-gradient(180deg, var(--bm-bg2), var(--bm-bg3))",
            border: actionData.isLowConfidence ? "1px solid var(--bm-border2)" : "1px solid var(--bm-accent-bd)",
            borderRadius: "var(--r-xl)",
            padding: isMobile ? "var(--space-4)" : "var(--space-4) var(--space-4)",
            marginBottom: "var(--space-4)",
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: "var(--r-lg)",
              background: actionData.isLowConfidence ? "var(--bm-bg3)" : "var(--bm-accent)",
              border: actionData.isLowConfidence ? "1px solid var(--bm-border2)" : "none",
              color: actionData.isLowConfidence ? "var(--bm-text3)" : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "var(--text-base)", flexShrink: 0,
            }}>{actionData.isLowConfidence ? "🔍" : "🎯"}</div>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: actionData.isLowConfidence ? "var(--bm-text3)" : "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: "var(--space-2)" }}>
                {actionData.isLowConfidence ? "Still calibrating — gathering evidence" : "Today's highest-leverage action"}
              </div>
              <p style={{ fontSize: isMobile ? "var(--text-xl)" : "var(--text-2xl)", fontWeight: 400, color: "var(--bm-text)", lineHeight: "var(--leading-tight)", margin: `0 0 var(--space-2)`, letterSpacing: "-0.025em" }}>
                {linkifyChannels(sanitizeOutput(actionData.action))}
              </p>
              <p style={{ fontSize: "var(--text-base)", color: "var(--bm-text2)", fontWeight: 400, margin: 0, lineHeight: "var(--leading-relaxed)" }}>
                {isOutreachAction
                  ? "Execute this before opening the rest of the day. The system will learn from the result."
                  : "This is the highest-leverage operating move for the current stage. Everything else is secondary."}
              </p>
            </div>
          </div>

          {!done && !actionLoading && (
            <button
              onClick={() => void handlePreTaskReplace()}
              disabled={replacingTask}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                background: "transparent",
                border: "1px solid var(--bm-border)",
                borderRadius: "var(--r-lg)",
                padding: "var(--space-2) var(--space-3)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--bm-text3)",
                cursor: replacingTask ? "not-allowed" : "pointer",
                opacity: replacingTask ? 0.5 : 1,
                transition: "all 0.15s",
                marginBottom: "var(--space-3)",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--bm-text2)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--bm-text3)"; }}
            >
              <RotateCcw size={11} />
              {replacingTask ? "Fetching new task..." : "Replace this task →"}
            </button>
          )}

          {/* Script instruction */}
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)",
            padding: "var(--space-2) var(--space-3)", borderRadius: "var(--r-lg)",
            background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
          }}>
            <div>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--bm-text)", margin: "0 0 1px" }}>
                {isOutreachAction ? "Prepare the message" : "Prepare the script"}
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", margin: 0 }}>
                {isOutreachAction
                  ? "Project context is pre-filled. Adjust only what improves clarity."
                  : "Use the script as written unless the context is wrong."}
              </p>
            </div>
          </div>

          {/* Why — with reflexion rationale */}
          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-xl)", padding: isMobile ? "var(--space-4)" : "var(--space-4) var(--space-4)", marginBottom: "var(--space-5)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-2)", display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Mono', monospace" }}>
              <Brain size={10} color="var(--bm-text3)" /> Strategic rationale
            </div>
            <p style={{ fontSize: "var(--text-md)", color: "var(--bm-text2)", margin: "0 0 var(--space-3)", lineHeight: "var(--leading-relaxed)" }}>
              {sanitizeOutput(actionData.reflexion?.rationale ?? actionData.why)}
            </p>
            {actionData.reflexion?.lastReflectionUsed && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
                Your yesterday's reflection shaped this recommendation.
              </div>
            )}
            {actionData.reflexion?.wasHardFallback && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <AlertCircle size={11} color="var(--bm-text3)" />
                Today's AI draft didn't meet our concreteness bar, so this is a proven fallback task instead — still real, just not freshly composed.
              </div>
            )}
          </div>

          {/* ── Message template — pre-filled with real project values ── */}
          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: "var(--r-xl)", padding: isMobile ? "var(--space-4)" : "var(--space-4) var(--space-4)" }}>
            <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: "var(--space-2)", gap: "var(--space-2)", flexDirection: isMobile ? "column" : "row" }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {isOutreachAction ? "Execution draft" : "Execution script"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: isMobile ? "100%" : "auto" }}>
                <button
                  onClick={() => void handleShareMessage()}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "4px 10px", borderRadius: "var(--r-lg)", border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: "var(--text-xs)", cursor: "pointer", fontFamily: "inherit", flex: isMobile ? 1 : "0 0 auto" }}
                >
                  {shared ? <><Check size={11} color="var(--bm-accent)" /> Shared</> : <>↗ Share</>}
                </button>
                <button onClick={handleCopy}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "4px 10px", borderRadius: "var(--r-lg)", border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: "var(--text-xs)", cursor: "pointer", fontFamily: "inherit", flex: isMobile ? 1 : "0 0 auto" }}>
                  {copied ? <><Check size={11} color="var(--bm-accent)" /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
            </div>
            {isOutreachAction ? (
              <textarea
                value={draftMessage ?? ""}
                onChange={e => setDraftMessage(e.target.value)}
                rows={4}
                style={{ width: "100%", background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)", borderRadius: "var(--r-lg)", padding: "var(--space-3) var(--space-3)", fontSize: isMobile ? "var(--text-md)" : "var(--text-base)", color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", lineHeight: "var(--leading-relaxed)", transition: "border-color 0.15s" }}
                onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
                onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
              />
            ) : (
              <p style={{ fontSize: isMobile ? "var(--text-md)" : "var(--text-base)", color: "var(--bm-text2)", margin: 0, lineHeight: "var(--leading-relaxed)", fontStyle: "italic" }}>&ldquo;{sanitizeOutput(draftMessage ?? actionData.message)}&rdquo;</p>
            )}
          </div>
        </div>
      </motion.div>
      {uiMode === "pro" && <IntelligencePanel data={actionData.intelligence} onSwap={handleSwapAlternative} recentOutcomes={recentOutcomes} />}
      </>
      )}

      {/* ── Destinations ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-3xl)", padding: isMobile ? "var(--space-5)" : "var(--space-5) var(--space-6)", marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "var(--bm-bg4)", color: "var(--bm-text3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "var(--text-xs)", fontWeight: 800, flexShrink: 0,
          }}>3</div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--bm-text2)" }}>Send it — pick one channel below</div>
        </div>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", marginBottom: "var(--space-4)", lineHeight: "var(--leading-normal)", paddingLeft: 30 }}>
          {targetUsers
            ? <>Reach your <strong style={{ color: "var(--bm-text3)", fontWeight: 500 }}>{targetUsers}</strong> directly. At least 3 people. Done counts even if they don't reply.</>
            : "At least 3 people. Done counts as done even if they don't reply. Replies are a bonus."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: "var(--space-2)" }}>
          {destinations.map(d => (
            <a key={d.label} href={d.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)", padding: isMobile ? "var(--space-4) var(--space-2)" : "var(--space-3) var(--space-2)", borderRadius: "var(--r-2xl)", border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bm-border2)"; e.currentTarget.style.background = "var(--bm-bg4)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; e.currentTarget.style.background = "var(--bm-bg3)"; }}>
              <span style={{ fontSize: "var(--text-2xl)" }}>{d.icon}</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)", textAlign: "center", lineHeight: "var(--leading-tight)" }}>{d.label}</span>
            </a>
          ))}
        </div>
      </motion.div>

      {/* ── Check-in ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-3xl)", padding: isMobile ? "var(--space-5)" : "var(--space-5) var(--space-6)" }}>

        {/* Stage motivator */}
        {project?.startup_stage && (
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--bm-text3)",
              marginBottom: "var(--space-4)",
              lineHeight: "var(--leading-normal)",
              fontStyle: "italic",
            }}
          >
            {{
              Idea: "At Idea stage, one conversation with a real person beats a week of planning.",
              Validation: "Validation is about behaviour, not opinions. Did someone commit time or money?",
              MVP: "Stop polishing. Every day you don't share it, you're building in the dark.",
              Launch: "Visibility compounds. Every post, every DM, every share is a future customer.",
              Growth: "Retention beats acquisition. The best founders call churned users.",
              Revenue: "Revenue is a signal. Today's action helps you read it accurately.",
            }[project.startup_stage] ??
              "Momentum compounds. The work you do today shapes tomorrow's recommendation."}
          </p>
        )}

        {/* Progress tracker */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: "var(--space-5)", overflow: "hidden" }}>
          {[
            { n: 1, label: "Read action", done: true },
            { n: 2, label: "Edit script", done: !!draftMessage },
            { n: 3, label: "Send it", done: copied },
            { n: 4, label: "Check in", done: false, active: true },
          ].map((step, i) => (
            <div key={step.n} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: step.done ? "var(--bm-text)" : step.active ? "var(--bm-bg4)" : "var(--bm-bg3)",
                  color: step.done ? "var(--bm-bg)" : step.active ? "var(--bm-text)" : "var(--bm-text4)",
                  border: step.active ? "1px solid var(--bm-border3)" : "none",
                  transition: "all 0.2s",
                }}>
                  {step.done ? "✓" : step.n}
                </div>
                {!isMobile && (
                  <span style={{ fontSize: 9, color: step.done ? "var(--bm-text3)" : step.active ? "var(--bm-text3)" : "var(--bm-text4)", fontWeight: step.active ? 600 : 400, whiteSpace: "nowrap" }}>
                    {step.label}
                  </span>
                )}
              </div>
              {i < 3 && (
                <div style={{ flex: 1, height: 1, background: step.done ? "var(--bm-border3)" : "var(--bm-border)", margin: "0 4px", marginBottom: isMobile ? 0 : 14, transition: "background 0.3s" }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: "var(--bm-text2)", marginBottom: 16, lineHeight: 1.6 }}>
          How did it go? Tap your outcome to log today's reflection.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9, marginBottom: 4 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button
              key={chip.id}
              disabled={submitting}
              onClick={() => {
                if (submitting) return;
                setSubmitting(true);
                // Previously this awaited handleCheckIn's ENTIRE promise
                // chain before navigating — 4 sequential network round-trips
                // (task-complete fetch, persistBehaviorState, a direct
                // Supabase score update, a founder-context PATCH) all had to
                // resolve first. None of that is needed to render /reflect —
                // it only needs the outcome (URL param) and this local
                // snapshot, which handleCheckIn used to write mid-chain,
                // after the first awaited call. Writing it here, synchronously,
                // before navigating, and letting the rest of handleCheckIn's
                // server-side bookkeeping run in the background is what
                // actually cuts the wait — the bookkeeping doesn't block
                // anything /reflect renders.
                storage.setJSON("bm_today_action", { action: actionData?.action ?? "", outcome: chip.id, note: "", confidence: 3 });
                void handleCheckIn(chip.id).catch(() => {
                  setSubmitting(false);
                });
                router.push(`/reflect?outcome=${chip.id}`);
              }}
              style={{
                padding: isMobile ? "14px" : "12px 14px",
                borderRadius: 10,
                border: `1px solid var(--bm-border)`,
                background: "var(--bm-bg3)",
                color: "var(--bm-text3)",
                fontSize: isMobile ? 14 : 13,
                fontWeight: 400,
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                textAlign: "left" as const,
                transition: "all 0.15s",
                opacity: submitting ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.borderColor = "var(--bm-border3)"; e.currentTarget.style.color = "var(--bm-text)"; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; e.currentTarget.style.color = "var(--bm-text3)"; }}
            >
              {submitting ? "Recording..." : chip.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: "8px 0 0", lineHeight: 1.5 }}>
          You'll complete your reflection on the next screen.
        </p>
      </motion.div>
      {/* Beyond the 3 changes — Loop Narrative (the 8.5 unlock) */}
      <LoopNarrative
        reflectionCount={(() => {
          try {
            return parseInt(storage.get(`bm_reflection_count_${localDayKey()}`) ?? "0", 10);
          } catch {
            return 0;
          }
        })()}
        tasksCompleted={project?.tasksCompleted ?? 0}
      />

      {/* ── Push permission prompt ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showPushPrompt && (
          <motion.div
            key="push-prompt"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              bottom: isMobile ? 80 : 32,
              left: "50%",
              transform: "translateX(-50%)",
              width: isMobile ? "calc(100% - 32px)" : 380,
              zIndex: 999,
              borderRadius: 16,
              border: "1px solid var(--bm-border)",
              background: "var(--bm-bg2)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🔔</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4 }}>
                  Get your evening nudge
                </div>
                <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0, lineHeight: 1.55 }}>
                  BuildMind checks in at 8pm to see if you followed through. One tap to enable — you can turn it off anytime.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void requestPushPermission()}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--bm-accent)",
                  color: "#000",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Enable evening check-in
              </button>
              <button
                onClick={() => setShowPushPrompt(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--bm-border2)",
                  background: "var(--bm-bg3)",
                  color: "var(--bm-text4)",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Not now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Morning Briefing modal — first open of the day, server-gated ─── */}
      {showBriefingModal && (morningBriefing || briefingAvailable) && (
        <MorningBriefingModal
          briefing={morningBriefing}
          isPaywalled={!planLoading && plan === "free"}
          onDismiss={() => {
            setShowBriefingModal(false);
            const today = new Date().toISOString().slice(0, 10);
            fetch("/api/founder-memory", {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ briefing_dismissed_date: today }),
            })
              .then(async (res) => {
                if (!res.ok) {
                  const body = await res.json().catch(() => null);
                  console.error("Failed to persist briefing dismissal:", res.status, body?.error);
                }
              })
              .catch((err) => console.error("Failed to persist briefing dismissal:", err));
          }}
        />
      )}
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<BuildMindLoader />}>
      <TodayContent />
    </Suspense>
  );
        }

"use client";

import { classifyAiFailure, type AiFailure } from "@/lib/aiFailure";
import FollowUpCard from "@/components/today/FollowUpCard";
import WeeklyNote from "@/components/today/WeeklyNote";
import EnergyCheck from "@/components/today/EnergyCheck";
import TrackedLinks from "@/components/today/TrackedLinks";
import { inferSource, needsTrackedLink } from "@/lib/linkNudge";
import PreparedWork from "@/components/today/PreparedWork";
import { PREP_META, prepKindFor } from "@/lib/prep/kinds";
import { moodFor, MOOD_META, isCalm, nextTick } from "@/lib/today/mood";
import MoodStrip from "@/components/today/MoodStrip";
import RadarToday from "@/components/radar/RadarToday";
import RadarBar, { useRadarSignal, markUndone } from "@/components/today/RadarBar";
import RadarItemCard from "@/components/radar/RadarItemCard";
import EveningCloseout from "@/components/today/EveningCloseout";
import TomorrowCarry from "@/components/today/TomorrowCarry";
import CompanionBrief from "@/components/companion/CompanionBrief";
import ReplaceWithReason from "@/components/today/ReplaceWithReason";
import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, queryKeys, useFounderScorecardQuery } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import TodayCommandCenter from "@/components/today/TodayCommandCenter";
import { computeStartupScore } from "@/lib/buildmind";
import { computeScoreDelta, applyScoreDelta, getXP, recordScore } from "@/lib/scoring";
import { getStoredStreak, recordTaskCompletion, syncStreakFromServer } from "@/lib/plan";
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
import { Clock, CheckCircle2, Copy, Check, Flame, Brain, Sparkles, AlertCircle, TrendingUp, Zap, ArrowRight, Trophy } from "lucide-react";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { LoopNarrative } from "@/components/LoopNarrative";
import { broadcastTabEvent, useTabSync } from "@/lib/tabSync";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { getArchetypeDisplay } from "@/lib/founderArchetypeDisplay";
import { linkifyChannels } from "@/lib/linkifyChannels";
import GhostGoalBanner from "@/components/GhostGoalBanner";
import ReckoningPill from "@/components/ReckoningPill";
import { recordOverride } from "@/lib/founderContext";
import { truncateChars } from "@/lib/textTruncate";
import type { MorningBriefing } from "@/lib/founderContext";
import { IntelligencePanel, type TodayIntelligenceSummary } from "./components/IntelligencePanel";
import { WhatChangedCard } from "./components/WhatChangedCard";
import { RisksGapsCard } from "./components/RisksGapsCard";
import { RiskInterrupt } from "./components/RiskInterrupt";
import { ChurnRiskInterrupt } from "./components/ChurnRiskInterrupt";
import { SignalCaptureForm } from "./components/SignalCaptureForm";
import { SignalHistoryList } from "./components/SignalHistoryList";
import { shouldTriggerRiskInterrupt, type ChurnRiskAssessment } from "@/lib/riskSignals";
import { ContextAlignmentCard } from "./components/ContextAlignmentCard";
import { IntelligenceUnavailableCard } from "./components/IntelligenceUnavailableCard";
import { useUIMode } from "@/lib/uiMode";
import Fold from "@/components/today/Fold";
import { buildWhyThis, whyThisMarkdown } from "@/lib/whyThis";
import { UIModeToggle } from "@/components/ui/UIModeToggle";
import { RadialGauge } from "@/components/charts/RadialGauge";

type Outcome = "completed" | "blocked" | "partial" | "learned";
type ReflexionMeta = {
  verdict: string;
  criticPersona: string;
  rationale: string;
  loopRan: boolean;
  pipeline?: string;
  passedCritic: boolean;
  lastReflectionUsed: boolean;
  wasHardFallback?: boolean;
  hardFallbackReasons?: string[];
};

// â”€â”€ Milestone Break interstitial (fires after milestone/stage change) â”€â”€â”€â”€â”€â”€â”€â”€
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

// One colour per kind of work, so the page itself says what sort of day this is.
function missionAccent(_kind?: string): string {
  // The page mood (app/globals.css [data-mood]) sets --bm-accent per kind.
  return "var(--bm-accent)";
}

type ActionData = {
  action: string;
  message: string;
  why: string;
  time: string;
  destKey?: string;
  isAI: boolean;
  reflexion?: ReflexionMeta;
  // log_row_id from recordActionShown â€” closes the learning loop via reflexion-outcome
  log_row_id?: string;
  difficulty?: "light" | "focused" | "deep"; // From app/api/ai/today-action's response
  // Confidence as a branch â€” when true, action/why were composed with
  // explicit evidence-gathering framing instead of a confident directive.
  // See CONFIDENCE NOTICE in app/api/ai/today-action/stream/route.ts.
  isLowConfidence?: boolean;
  // Founder Intelligence OS (Phase 10) â€” layered above the existing action,
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
  /** Set when Radar replaced the generated task with an opportunity's next move. */
  radarItemId?: string;
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
    .replace(/[â€¢â†’â‡’âžœâž”]/g, "-")
    .replace(/[â€”â€“]/g, "-")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
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

// â”€â”€ Stored reflection shape (from bm_today_action written by /reflect) â”€â”€â”€â”€â”€â”€
type StoredReflection = {
  action: string;
  outcome: Outcome;
  note?: string;
  confidence?: number;
  witnessed?: string; // acknowledgment line from app/reflect â€” surfaced here too, not just on /reflect
};

// â”€â”€ Fallback actions (used when API is unavailable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DESTINATIONS: Record<string, { icon: string; label: string; url?: string }[]> = {
  idea:       [{ icon: "ð•", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "ðŸ§µ", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "ðŸ’¬", label: "r/startups", url: "https://reddit.com/r/startups/submit" }, { icon: "ðŸ“±", label: "Text 3 people" }],
  validation: [{ icon: "ð•", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "ðŸ§µ", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "ðŸ’¼", label: "LinkedIn DM" }, { icon: "ðŸ“±", label: "WhatsApp" }],
  prototype:  [{ icon: "ðŸš€", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "ð•", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "ðŸ§µ", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "ðŸŽ¥", label: "Loom â†’ share" }],
  mvp:        [{ icon: "ðŸš€", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "ð•", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "ðŸ§µ", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "ðŸ’¬", label: "WhatsApp" }],
  launch:     [{ icon: "ðŸš€", label: "Product Hunt", url: "https://www.producthunt.com/posts/new" }, { icon: "ð•", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "ðŸ§µ", label: "Indie Hackers", url: "https://www.indiehackers.com/post" }, { icon: "ðŸ“°", label: "Hacker News", url: "https://news.ycombinator.com/submit" }],
  // FIX: no "growth" key existed here, so DESTINATIONS[aiAction?.destKey ?? stageKey] ?? DESTINATIONS.idea
  // silently fell back to idea-stage sharing channels (Reddit r/startups, "text 3 people")
  // for a founder who is already past launch and working on retention.
  growth:     [{ icon: "ðŸ“ž", label: "Call directly" }, { icon: "ðŸ“§", label: "Email personally" }, { icon: "ðŸ’¼", label: "LinkedIn" }, { icon: "ð•", label: "Twitter DM" }],
  revenue:    [{ icon: "ðŸ“ž", label: "Call directly" }, { icon: "ðŸ“§", label: "Email personally" }, { icon: "ðŸ’¼", label: "LinkedIn" }, { icon: "ð•", label: "Twitter DM" }],
};

const STATIC_ACTIONS: Record<string, { action: string; message: string; why: string; time: string; destKey: string }> = {
  idea:       { action: "Talk to 5 people who have this problem before writing any code.", message: "Hey, quick question â€” what's your biggest challenge with [your problem area]? I'm researching it and would love 10 minutes.", why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.", time: "2 hours", destKey: "idea" },
  validation: { action: "Send this outreach message to 10 potential users today.", message: "Hey â€” I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens? Not pitching, just learning.", why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.", time: "1â€“2 hours", destKey: "validation" },
  prototype:  { action: "Record a 3-minute Loom walkthrough and send it to 5 people today.", message: "Hey â€” I've built a rough prototype for [problem]. Would you watch a 3-minute demo and tell me what confuses you most? Brutal honesty only.", why: "Dropbox got 75K signups from a demo video before writing any backend code. Ship something real.", time: "Under 2 hours", destKey: "prototype" },
  mvp:        { action: "Send your working link to one warm contact before end of day.", message: "Hey â€” I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks?", why: "The version they see today teaches you more than 3 more days of polishing. Ship it.", time: "30 minutes", destKey: "mvp" },
  launch:     { action: "Post on Product Hunt this week â€” imperfect listing beats no listing.", message: "We just launched [product] on Product Hunt â€” it [solves problem] for [target users]. Would love your support and brutal feedback: [link]", why: "You don't need to be ready. You need to be visible.", time: "3 hours to prepare", destKey: "launch" },
  // FIX: no "growth" key existed here, so buildContextualStaticAction()'s
  // STATIC_ACTIONS[stageKey] ?? STATIC_ACTIONS.idea silently fell back to
  // "Talk to 5 people who have this problem before writing any code" for a
  // founder already past launch â€” the AI-unavailable fallback path was
  // telling a Growth-stage founder to re-do Idea-stage validation.
  growth:     { action: "Call one churned user today â€” not to win them back, to understand why they left.", message: "Hey [name] â€” I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?", why: "Retention beats acquisition. Every churn conversation tells you more than another week of dashboards.", time: "1 hour", destKey: "growth" },
  revenue:    { action: "Call one churned user today â€” not to win them back, to understand why they left.", message: "Hey [name] â€” I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?", why: "Churn analysis conversations are the highest-leverage activity at revenue stage.", time: "1 hour", destKey: "revenue" },
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

const OUTCOME_CHIPS: { id: Outcome; label: string; description: string; color: string; bg: string; border: string }[] = [
  { id: "completed", label: "Completed",         description: "Task fully executed as planned.",        color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "partial",   label: "Partly done",       description: "Incomplete but made progress.",          color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "blocked",   label: "Blocked",           description: "Faced obstacles or issues.",             color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
  { id: "learned",   label: "Learned something", description: "Didn't execute, but gained a real insight.", color: "var(--bm-text)",  bg: "var(--bm-bg4)", border: "var(--bm-border3)" },
];


// â”€â”€ Week-one projections â€” shown in done state on first session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const WEEK_ONE_MILESTONES: Record<string, { day: number; milestone: string }[]> = {
  idea: [
    { day: 2, milestone: "You'll have talked to at least 2 real people about your idea â€” more signal than a week of research." },
    { day: 4, milestone: "BuildMind will have detected your first avoidance pattern and started routing around it." },
    { day: 7, milestone: "You'll have a validated problem statement or evidence it needs changing. Either outcome is the right one." },
  ],
  validation: [
    { day: 2, milestone: "First user commitment recorded â€” time, money, or workflow change." },
    { day: 4, milestone: "Pattern detected: which type of user responds faster." },
    { day: 7, milestone: "Enough signal to decide whether to build or pivot the value proposition." },
  ],
  mvp: [
    { day: 2, milestone: "Working link in front of at least one real user." },
    { day: 4, milestone: "First friction point documented â€” the bug or confusion users hit first." },
    { day: 7, milestone: "You'll know whether retention is possible at this quality level." },
  ],
  launch: [
    { day: 2, milestone: "At least one distribution channel tested with real copy." },
    { day: 4, milestone: "Conversion data from the first 10 visitors." },
    { day: 7, milestone: "Enough CAC data to know if the channel is viable." },
  ],
  growth: [
    { day: 2, milestone: "One churned user interviewed â€” more insight than 50 analytics dashboards." },
    { day: 4, milestone: "Retention pattern surfaced: when users leave and why." },
    { day: 7, milestone: "Single biggest lever identified. BuildMind will focus every task on it." },
  ],
  revenue: [
    { day: 2, milestone: "Revenue leak mapped â€” where the biggest drop-off in acquisition-to-payment is." },
    { day: 4, milestone: "One pricing conversation completed." },
    { day: 7, milestone: "A testable hypothesis about the biggest revenue constraint." },
  ],
};

// â”€â”€ Outcome colour helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const OUTCOME_META: Record<Outcome, { icon: string; label: string; color: string }> = {
  completed: { icon: "âœ“", label: "Completed",         color: "var(--bm-text2)" },
  partial:   { icon: "â€“", label: "Partly done",       color: "var(--bm-text2)" },
  blocked:   { icon: "!", label: "Blocked",           color: "var(--bm-text2)" },
  learned:   { icon: "i", label: "Learned something", color: "var(--bm-text2)" },
};

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
  const match = action.match(/\b(?:to|with)\s+(?:\d+\s+)?(.+?)(?:\s+(?:on|via|today|who|and|while|before|after)|\s+[â€”-]|[.,]|$)/i);
  return match?.[1]?.trim() || "people in your target segment";
}

function inferTopicFromAction(action: string, problem: string, productName: string): string {
  if (problem.trim()) return problem.trim();
  const about = action.match(/\b(?:about|around|with)\s+(.+?)(?:[.,]|[â€”-]|\s+today|\s+before|\s+after|$)/i);
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

// â”€â”€ Greeting based on time of day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  // Ref guard â€” prevents iOS double-tap from firing handleCheckIn twice
  const checkInFired = useRef(false);
  // Opened from the notification's "Done" button: ask once, never mark anything silently.
  const quickDoneRequested = searchParams.get("quickdone") === "1";
  const [quickDoneOpen, setQuickDoneOpen] = useState(false);
  const executionScriptRef = useRef<HTMLDivElement | null>(null);
  const actionCardRef = useRef<HTMLDivElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [accountAgeDays, setAccountAgeDays] = useState(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  // Founder archetype â€” light presence on the daily page (see /memory for
  // the full explanation). This is one query for one string array, kept
  // deliberately separate from the big data-loading effects below so it
  // can't interfere with task loading if it ever fails.
  const [archetypeTags, setArchetypeTags] = useState<string[]>([]);
  const [stageNudge, setStageNudge] = useState<{
    currentStage: string; nextStage: string; projectId: string | null;
    completed: number; total: number;
    tier: "checklist_only" | "ready"; evidenceFilled: number | null; evidenceTotal: number | null;
    reason: string;
  } | null>(null);
  // Page-coherence: XP/level chip in the always-visible header, so leveling
  // up feels like a consequence of using Today rather than a fact you only
  // discover by remembering Achievements exists as a separate page.
  const [levelInfo, setLevelInfo] = useState<{ level: number; title: string } | null>(null);

  // AI-personalised action state
  const [aiAction, setAiAction] = useState<ActionData | null>(null);
  // Radar: always-on status, and the takeover when something cannot wait (lib/radar/urgency.ts).
  const radar = useRadarSignal(project?.id ?? null);
  const [radarOriginal, setRadarOriginal] = useState<ActionData | null>(null);
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
  const lastSwapRef = useRef<{ reason: string | null; mode: string } | null>(null);
  const [forceActionRefresh, setForceActionRefresh] = useState(0);
  // Progressive streaming label â€” shows which agent is currently running
  const [streamLabel, setStreamLabel] = useState<string | null>(null);
  // True only when BOTH the SSE stream and the JSON fallback fail to
  // produce a real action â€” i.e. actionData is about to silently fall back
  // to STATIC_ACTIONS with no signal to the founder. Distinct from
  // actionData.isAI === false, which also covers the (fine) low-confidence
  // calibration case.
  const [aiFetchFailed, setAiFetchFailed] = useState(false);
  const [aiFailure, setAiFailure] = useState<AiFailure | null>(null);
  useEffect(() => {
    if (!quickDoneRequested || !aiAction?.action) return;
    let doneToday = false;
    try { doneToday = Boolean(storage.get(`bm_task_done_${localDayKey()}`)); } catch { /* ask anyway */ }
    if (!doneToday) setQuickDoneOpen(true);
  }, [quickDoneRequested, aiAction?.action]);
  // Last real (isAI: true) action this session produced â€” used only for
  // "Use last recommendation" on the unavailable screen. Not persisted;
  // if nothing has succeeded yet this session, the button doesn't render.
  const lastGoodActionRef = useRef<ActionData | null>(null);

  // Milestone Break interstitial â€” fires after milestone/stage change
  const [milestoneBreak, setMilestoneBreak] = useState<MilestoneBreakResult | null>(null);
  const [milestoneBreakDismissed, setMilestoneBreakDismissed] = useState(false);

  // Stage eligibility is a review prompt, never an automatic mutation.
  const [transitionEligible, setTransitionEligible] = useState<{
    current_stage: string; next_stage: string; completed: number; total: number;
    tier: "checklist_only" | "ready"; evidenceFilled: number | null; evidenceTotal: number | null;
    reason: string;
  } | null>(null);

  // Editable draft â€” pre-filled with real project values
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  // Yesterday's stored reflection â€” drives the causal thread UI

  // Pattern detection â€” surfaces after check-in
  const [activePattern, setActivePattern] = useState<{ signal: string; message: string; severity: string } | null>(null);

  // Morning briefing
  const [briefingAvailable, setBriefingAvailable] = useState(false);
  const [morningBriefing, setMorningBriefing] = useState<MorningBriefing | null>(null);
  const [showBriefingModal, setShowBriefingModal] = useState(false);

  // Recovery Mode â€” shown when founder has 3+ days of momentum decay,
  // or when a churn-risk signal cluster crosses shouldTriggerRiskInterrupt()
  // (lib/riskSignals.ts). recoveryActive gates RecoveryModeCard (the
  // ongoing active state); riskAssessment + the dismiss flag gate
  // ChurnRiskInterrupt (the one-time detection prompt).
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [momentumScoreForTicker, setMomentumScoreForTicker] = useState<number | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<ChurnRiskAssessment | null>(null);
  const [riskInterruptDismissed, setRiskInterruptDismissed] = useState(false);
  const [signalHistoryRefreshKey, setSignalHistoryRefreshKey] = useState(0);
  const [blockerInsight, setBlockerInsight] = useState<{
    id: string; title: string; body: string; action_redirect: string | null;
  } | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  // Momentum decay banner â€” shown when score dropped 5+ pts this week
  const [decayDrop, setDecayDrop] = useState<number | null>(null);
  const [decayDismissed, setDecayDismissed] = useState(false);

  // Cognitive load â€” founder reports their capacity today
  const [cogLoad, setCogLoad] = useState<"low" | "normal" | "high" | null>(null);
  const [cogLoadSaved, setCogLoadSaved] = useState(false);

  // Push permission prompt â€” shown once after first check-in complete
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // Win attribution

  useEffect(() => {
    fetch("/api/ai/usage-status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { ok?: boolean; monthlyUsed?: number; monthlyLimit?: number; unlimited?: boolean } | null) => {
        // FIX: previously `d.monthlyLimit ?? 30` silently rendered a fabricated
        // "30 remaining" banner whenever the response was missing fields â€”
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

    // "What happened last time" â€” cheap, read-only, no AI call. See
    // app/api/founder-context/recent-outcomes/route.ts.
    fetch("/api/founder-context/recent-outcomes", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { ok?: boolean; outcomes?: typeof recentOutcomes } | null) => {
        if (d?.ok && Array.isArray(d.outcomes)) setRecentOutcomes(d.outcomes);
      })
      .catch(() => {});

    // Fetch dismiss date first (fast), then briefing (slow â€” may generate)
    // Wrapped in async IIFE since useEffect callbacks cannot be async directly.
    //
    // FIX: skip entirely on a user's first session. isFirstSession existed
    // but was previously only used for copy tweaks â€” the briefing modal fired
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

      // Step 3: fetch briefing (may trigger AI generation â€” can take several seconds)
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

    // â”€â”€ Recovery Mode check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    fetch("/api/recovery-mode", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { recoveryActive?: boolean; momentumScore?: number; daysInactive?: number } | null) => {
        if (d?.recoveryActive) setRecoveryActive(true);
        if (typeof d?.momentumScore === "number") setMomentumScoreForTicker(d.momentumScore);
        // Decay banner: if momentum < 50 and days_inactive > 0
        if (d && !d.recoveryActive && typeof d.momentumScore === "number" && d.momentumScore < 50) {
          setDecayDrop(50 - d.momentumScore);
        }
        setRecoveryChecked(true);
      })
      .catch(() => { setRecoveryChecked(true); });

    // â”€â”€ Restore saved cognitive load from today â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const todayKey = new Date().toISOString().slice(0, 10);
    const savedCogLoad = typeof localStorage !== "undefined"
      ? localStorage.getItem(`bm_cog_load_${todayKey}`) as "low" | "normal" | "high" | null
      : null;
    if (savedCogLoad) { setCogLoad(savedCogLoad); setCogLoadSaved(true); }
  }, []);

  // â”€â”€ Churn risk check â€” project-scoped, so it re-runs when the active
  // project changes. Drives ChurnRiskInterrupt (see lib/riskSignals.ts). â”€â”€
  useEffect(() => {
    if (!project?.id) { setRiskAssessment(null); return; }
    const todayKey = new Date().toISOString().slice(0, 10);
    const dismissedKey = `bm_risk_interrupt_dismissed_${project.id}_${todayKey}`;
    setRiskInterruptDismissed(storage.get(dismissedKey) === "1");

    fetch(`/api/risk-signals?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { ok?: boolean; assessment?: ChurnRiskAssessment } | null) => {
        if (d?.ok && d.assessment) setRiskAssessment(d.assessment);
      })
      .catch(() => {});
  }, [project?.id]);

  // Founder archetype â€” isolated fetch, doesn't gate or block anything else on this page.
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

  // Stage-transition nudge â€” isolated fetch, same non-blocking pattern as
  // the archetype badge above. Reads founder_context.pending_stage_transition,
  // which lib/server/stageTransition.ts's single canonical detector keeps
  // current (written after every task completion and every reflection â€”
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
          stage_milestones_completed?: number; stage_milestones_total?: number;
          readiness_tier?: string; evidence_filled?: number | null; evidence_total?: number | null;
          reason?: string;
        } | null } | null)?.pending_stage_transition;
        if (pending?.recommended_stage) {
          setStageNudge({
            currentStage: pending.current_stage ?? "",
            nextStage: pending.recommended_stage,
            projectId: pending.project_id ?? null,
            completed: pending.stage_milestones_completed ?? 0,
            total: pending.stage_milestones_total ?? 0,
            tier: pending.readiness_tier === "ready" ? "ready" : "checklist_only",
            evidenceFilled: pending.evidence_filled ?? null,
            evidenceTotal: pending.evidence_total ?? null,
            reason: pending.reason ?? "",
          });
        }
      })
      .catch(() => {});
  }, [userId]);

  // Level chip â€” client-only read (localStorage XP, now server-verified
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
        // The device's real UTC offset (minutes) - the Ghost Race and weekly pulse bucket completions by it.
        persistBehaviorState({ tz_offset_minutes: -new Date().getTimezoneOffset() }).catch(() => {});

        // Fetch active blocker insight â€” the "cheat code" card
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

  }, []);

  // Fetch personalised action from AI once we have project data
  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    void (async () => {
    if (!project) return;
    const projectId = project.id;
    if (!userId || !projectId) return;

    // â”€â”€ Fetch pending milestone-break interstitial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Stored by /api/ai/milestone-break in founder_memory.pending_milestone_break
    // (see migration 20260521000001_founder_memory_weekly_loop.sql). Must fetch
    // /api/founder-memory here, not /api/founder-context â€” the founder_context
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

    // â”€â”€ Reflection-aware cache busting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // If the founder reflected after the cache was written, the task must be
    // regenerated so it responds to that reflection. Without this, the same
    // task repeats regardless of what the founder reported.
    // Use parseInt to compare numerically â€” string comparison of "0" vs "0"
    // is always false, which previously caused new users to never bust the cache.
    const lastReflectionTime = parseInt(storage.get(`bm_last_reflection_ts_${userId}`) ?? "0", 10);
    const cachedAt = parseInt(storage.get(`bm_today_action_cache_ts_${userId}`) ?? "0", 10);

    // A reflection only busts the cache if it happened TODAY and AFTER the cache
    // was written. Yesterday's reflection (or any reflection from before today's
    // cache was generated overnight) must never force a live AI call â€” that's the
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

    // â”€â”€ Step 1: localStorage (synchronous, instant) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Check this BEFORE the server round-trip so returning founders see their
    // task immediately on open â€” the overnight cache is already here from the
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
          setAiAction({ ...cached.data, isAI: true }); setAiFetchFailed(false); lastGoodActionRef.current = { ...cached.data, isAI: true };
          // Still sync server cache in background â€” non-blocking
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
                setAiAction({ ...serverCache.today_action_cache.data, isAI: true }); setAiFetchFailed(false); lastGoodActionRef.current = { ...serverCache.today_action_cache.data, isAI: true };
              }
            })
            .catch(() => {});
          return;
        }
        // Stale localStorage entry â€” only remove if stage also matches (genuine bad data),
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

    // â”€â”€ Step 2: Server cache (network round-trip) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Gap fix: server says nothing is there â€” nuke localStorage too â”€â”€â”€â”€â”€â”€â”€â”€
    // Previously, clearing the server-side cache row left localStorage untouched.
    // On the next page load, Step 1 found the stale localStorage entry and
    // returned early â€” the live AI call never ran. Fix: whenever the server
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
        setAiAction({ ...serverCache.today_action_cache.data, isAI: true }); setAiFetchFailed(false); lastGoodActionRef.current = { ...serverCache.today_action_cache.data, isAI: true };
        return;
      }
      // Server cache exists but is stale â€” clear both server and localStorage
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
      clientHour: new Date().getHours(),
      excludeAction: lastRejectedActionRef.current ?? undefined,
      swap: lastRejectedActionRef.current ? (lastSwapRef.current ?? undefined) : undefined,
      // The server stamps the cached task with THIS day key so the cache check
      // above (local day) and the server's stamp can never disagree (lib/dayKey.ts).
      dayKey: today,
    });

    // â”€â”€ Streaming path (SSE) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Uses /api/ai/today-action/stream for progressive token delivery.
    // Cuts perceived latency from 15â€“20s to "instant with words appearing."
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
                setAiFetchFailed(false);
                lastGoodActionRef.current = actionData;
                setStreamLabel(null);
                // FIX (task-repeat bug): clear the rejection once a new
                // action has actually been generated â€” otherwise this same
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
    } catch { /* SSE unavailable â€” fall through to JSON fallback */ }

    // â”€â”€ JSON fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!streamSucceeded && !signal.aborted) {
      // FIX (first-load "Intelligence not available"): a single transient
      // failure on first load (session/cookies still settling, the stream
      // having just generated and cached server-side, a cold function) used
      // to flip straight to the failure card, while navigating away and back
      // succeeded via the server cache. Now we retry with backoff and re-check
      // the server cache before declaring failure. Aborted runs never set it.
      const applyAction = (actionData: NonNullable<ReturnType<typeof unwrapActionPayload>>) => {
        setDebtSuppression(null);
        setAiAction(actionData);
        setAiFetchFailed(false);
        lastGoodActionRef.current = actionData;
        lastRejectedActionRef.current = null;
        const cacheValue = { date: today, projectId, stage: currentStage, data: actionData };
        storage.setJSON(cacheKey, cacheValue);
        if (userId) storage.set(`bm_today_action_cache_ts_${userId}`, Date.now().toString());
        persistBehaviorState({ today_action_cache: cacheValue });
      };
      const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
      let resolved = false;
      const delays = [0, 1500, 3500];
      let lastFailure: AiFailure | null = null;
      for (let attempt = 0; attempt < delays.length && !resolved; attempt++) {
        if (delays[attempt]) await sleep(delays[attempt]);
        if (signal.aborted) return;
        try {
          if (attempt > 0) {
            // The stream may have finished server-side even though we missed it.
            const sc = await fetchBehaviorState<{ today_action_cache: CachedTodayAction & { generatedAt?: string } }>(["today_action_cache"]);
            if (signal.aborted) return;
            const c = sc?.today_action_cache;
            if (c && c.date === today && c.projectId === projectId && c.data) {
              setDebtSuppression(null);
              setAiAction({ ...c.data, isAI: true });
              setAiFetchFailed(false);
              lastGoodActionRef.current = { ...c.data, isAI: true };
              resolved = true;
              break;
            }
          }
          const r = await fetch("/api/ai/today-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            signal,
          });
          if (!r.ok) {
            const body = await r.json().catch(() => null);
            lastFailure = classifyAiFailure({ status: r.status, message: typeof body?.error === "string" ? body.error : null });
            // A limit or an expired session does not clear by retrying straight away.
            if (!lastFailure.retryable) break;
            continue;
          }
          const json = await r.json();
          if (signal.aborted) return;
          const actionData = unwrapActionPayload(json);
          const debtData = unwrapDebtPayload(json);
          if (json?.success && debtData) {
            setDebtSuppression(debtData);
            setAiAction(null);
            resolved = true;
          } else if (json?.success && actionData) {
            applyAction(actionData);
            resolved = true;
          }
        } catch {
          if (signal.aborted) return;
          lastFailure = classifyAiFailure({ offline: typeof navigator !== "undefined" && navigator.onLine === false });
        }
      }
      if (signal.aborted) return;
      if (!resolved) { setAiFailure(lastFailure); setAiFetchFailed(true); }
      setActionLoading(false);
      return;
    }

    if (!signal.aborted) setActionLoading(false);
    })();

    return () => { abortController.abort(); };
    // FIX (Sept 22, 2026 â€” stream requests never appearing in Vercel logs at
    // all, only the JSON fallback showing up): this depended on the whole
    // `project` OBJECT, not project?.id. project comes from
    // useMemo(() => selectActiveProject(summaries, activeProjectId), [summaries, activeProjectId])
    // â€” its stability rides entirely on whether `summaries` (a React Query
    // result) returns a referentially stable array between fetches. Any
    // background refetch (window refocus is the common one â€” very
    // plausible on mobile, where switching apps and coming back happens
    // constantly) produces a new `summaries` array even when nothing
    // meaningful changed, which produces a new `project` object via
    // useMemo, which re-ran this effect, which aborted whatever stream
    // request was in flight â€” often before it got far enough to register
    // as a real logged invocation at all. That's consistent with what was
    // actually observed: /stream never showing up in logs, while the
    // faster JSON fallback (POST /api/ai/today-action) did.
    //
    // Genuine content changes (task completion, milestone changes) don't
    // need project-object-identity to trigger a refresh â€” they already go
    // through the explicit forceActionRefresh counter (see
    // setForceActionRefresh calls elsewhere in this file), so narrowing
    // this to project?.id doesn't silently drop that behavior; it removes
    // an accidental, fragile trigger that was never the intended mechanism.
  }, [project?.id, userId, forceActionRefresh]);

  useEffect(() => {
    if (replacingTask && !actionLoading && (aiAction || debtSuppression)) {
      setReplacingTask(false);
    }
  }, [actionLoading, aiAction, debtSuppression, replacingTask]);

  // FIX: was calling getXP() directly (local storage), independent of the
  // same canonical scorecard reports/overview/project-detail now all read
  // from â€” the confirmed root cause of momentum/score disagreeing across
  // pages. `streak` here is left as this page's own local state
  // (unchanged) since it's already kept in sync elsewhere in this file;
  // only xp needed correcting.
  const { data: scorecard } = useFounderScorecardQuery();
  useEffect(() => {
    if (typeof scorecard?.xp === "number") { try { setLevelInfo(xpToLevel(scorecard.xp)); } catch { /* keep local level */ } }
  }, [scorecard?.xp]);
  const score = project ? computeStartupScore({
    ...project,
    momentum_score: scorecard?.momentum ?? project.momentum_score,
    xp: scorecard?.xp ?? 0,
    streak,
  }) : 0;
  const stageKey = project?.startup_stage?.toLowerCase() ?? "idea";

  // Resolved project strings for template hydration
  const productName = project?.name ?? project?.title ?? "";
  const targetUsers = project?.target_users ?? "";
  const problem = project?.problem ?? "";
  const projectDescription = project?.description ?? "";

  // â”€â”€ Multi-tab synchronization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      // Also fire milestone-break on stage transition â€” stores result for Today page interstitial
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

  // Memoize MobileCheckin visibility â€” avoids calling storage.get() on every
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

  // Evening mode â€” reuses the SAME evening window checkinSlot already
  // computes (18:00-22:00, not yet submitted) rather than a second,
  // separate "is it evening" rule. When true: the evening check-in surfaces
  // directly on the page instead of staying inside "Why this task?", and
  // the task recommendation collapses into a "Show task" pill so the page
  // doesn't just accumulate more sections on top of each other.
  const isEveningSurfaced = checkinSlot?.type === "evening";
  const [taskPillExpanded, setTaskPillExpanded] = useState(false);

  const OUTREACH_KEYWORDS = ["dm", "message", "send", "email", "outreach", "call", "text", "reach out", "post", "tweet", "share"];
  const isOutreachAction = actionData ? OUTREACH_KEYWORDS.some(kw =>
    actionData?.action.toLowerCase().includes(kw) || actionData?.message.toLowerCase().includes(kw)
  ) : false;
  // Build / analyze / pricing / unblock / reset days have no outreach draft, so
  // they get a "how to do it" panel instead of a message box and channel picker.
  const noDraft = Boolean(actionData?.missionKind) && actionData?.hasDraft === false;
  // The Today screen reshapes itself around the kind of work the task is. When
  // BuildMind has prepared work for it, that work is the main surface, and the
  // generic message box and channel picker (which only make sense for outreach)
  // step aside.
  const prepKind = actionData?.action ? prepKindFor(actionData.action, actionData.missionKind ?? null) : null;
  const mood = moodFor(actionData?.missionKind, prepKind);
  // Active mood layer (lib/today/mood.ts): focus engages the page, calm moods fold the extras away,
  // and every mood change replays the entrance.
  const [timerRunning, setTimerRunning] = useState(false);
  const [moodTick, setMoodTick] = useState(0);
  const lastMood = useRef(mood);
  useEffect(() => { if (lastMood.current !== mood) { lastMood.current = mood; setMoodTick(nextTick); } }, [mood]);
  const engaged = timerRunning;
  const calm = isCalm(mood, false);
  // Distribution Studio (PreparedWork) is the one working surface for every task, outreach included.
  // The old "Execution draft/script" card was a second text box for the same message, so it is gone.
  const hideLegacy = Boolean(actionData?.action);
  const criticalSignal = actionData?.intelligence?.top_signals.find((signal) => signal.severity === "critical");
  const supportingSignals = actionData?.intelligence?.top_signals.filter((signal) => signal.severity !== "critical") ?? [];

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

  // â”€â”€ Cognitive load save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleCogLoad = useCallback((level: "low" | "normal" | "high") => {
    // Show the selected button highlighted for a beat before the card
    // collapses â€” otherwise cogLoadSaved flips true in the same render as
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

  // â”€â”€ Push permission request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Radar takeover: a tracked opportunity that cannot wait replaces today's generated task.
  // Deterministic (urgency.ts), reversible ("Keep my usual task"), and applied once per item per day.
  useEffect(() => {
    const s = radar.signal;
    if (s.level !== "takeover" || !s.item || !aiAction || aiAction.radarItemId || done || actionLoading || replacingTask) return;
    const item = s.item;
    setRadarOriginal(aiAction);
    setAiAction({
      ...aiAction,
      action: s.task,
      why: `${s.headline}. ${item.fit.reasons[0] ?? "It fits what you are building."}`,
      message: "",
      hasDraft: false,
      time: "25 min",
      missionKind: "radar",
      missionLabel: "Radar",
      missionReasons: [s.headline],
      firstStep: s.task.split(/(?<=[.!?])\s+/)[0] ?? s.task,
      doneWhen: item.type === "program" ? "The application is submitted, or saved as a draft you can finish in one sitting." : item.type === "person" ? "The message is sent and the next follow-up date is set." : "It is on your calendar and your prep is written down.",
      radarItemId: item.id,
      isAI: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radar.signal, aiAction, done, actionLoading]);

  const undoRadarTakeover = useCallback(() => {
    const id = aiAction?.radarItemId;
    if (id) markUndone(id);
    if (radarOriginal) setAiAction(radarOriginal);
    setRadarOriginal(null);
    radar.reload();
  }, [aiAction?.radarItemId, radarOriginal, radar]);

  /** "Can't get there" / "No time" on a Radar event: dismiss it, remember why, and give the founder their usual task back. */
  const cantAttendRadar = useCallback(async (reason: "place" | "time") => {
    const id = radar.signal.item?.id;
    if (!id) return;
    try { await fetch("/api/radar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, cant_attend: reason }) }); } catch { /* the undo below ãÞ:¶‰žËkºwµç@¼¼±¥•¹ÐµÍ¥‘”°‰•ÍÐµ•™™½ÉÐ(€€€€€ô((€€€€€€¼¼ƒŠRŠR MÑÉ•…¬ƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR (€€€€€€¼¼…É¹•½¹±äÝ¡•¸Ñ¡”Í•ÉÙ•È…•ÁÑÌ„½µÁ±•Ñ•…Ñ¥½¸€¡Ñ…Í¬µ½µÁ±•Ñ”(€€€€€€¼¼…‰½Ù”¤¸%˜Ñ¡…Ð…±°™…¥±•¹½Ñ¡¥¹œÝ…Ì½Õ¹Ñ•°Í¼Ñ¡”‘¥ÍÁ±…ä­••ÁÌ(€€€€€€¼¼Ñ¡”±…ÍÐÍ•ÉÙ•Èµ½¹™¥Éµ•Ù…±Õ”¥¹ÍÑ•…½˜¥¹Ù•¹Ñ¥¹œ½¹”±½…±±ä¸(€€€€€½¹ÍÐ¹•ÝMÑÉ•…¬€ôÍ•ÉÙ•ÉMÑÉ•…¬€üüÍÑÉ•…¬ì(€€€€€Í•ÑMÑÉ•…¬¡¹•ÝMÑÉ•…¬¤ì((€€€€€€¼¼9½Ñ¥™ä½Ñ¡•È½Á•¸Ñ…‰ÌÍ¼Ñ¡•äÍ¡½ÜÑ¡”‘½¹”ÍÑ…Ñ”¥µµ•‘¥…Ñ•±ä(€€€€€½¹ÍÐÑ½‘…å	É½…‘…ÍÐ€ô±½…±…å-•ä ¤ì(€€€€€‰É½…‘…ÍÑQ…‰Ù•¹Ð¡ìÑåÁ”è€‰¡•­¥¹}‘½¹”ˆ°‘…Ñ”èÑ½‘…å	É½…‘…ÍÐô¤ì(€€€€€‰É½…‘…ÍÑQ…‰Ù•¹Ð¡ìÑåÁ”è€‰ÍÑÉ•…­}ÕÁ‘…Ñ•ˆ°ÍÑÉ•…¬è¹•ÝMÑÉ•…¬ô¤ì((€€€ô™¥¹…±±äìÍ•ÑMÕ‰µ¥ÑÑ¥¹œ¡™…±Í”¤ì¡•­%¹¥É•¹ÕÉÉ•¹Ð€ô™…±Í”ìô(€ô((€¥˜€¡¥Í1½…‘¥¹œ¤É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µ…àµÜµlàÈÁÁátÁà´ØÁä´Üˆø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µˆ´ØÍÁ…”µä´Ì‰½É‘•Èµˆ‰½É‘•ÈµmÙ…È ´µ‰´µ‰½É‘•È¥tÁˆ´Ôˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´ÌÜ´Èà…¹¥µ…Ñ”µÁÕ±Í”É½Õ¹‘•µ±œ‰œµmÙ…È ´µ‰´µ‰œÌ¥tˆ€¼ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´ÜÜ´Ì¼Ô…¹¥µ…Ñ”µÁÕ±Í”É½Õ¹‘•µ±œ‰œµmÙ…È ´µ‰´µ‰œÌ¥tˆ€¼ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´ÐÜ´È¼Ô…¹¥µ…Ñ”µÁÕ±Í”É½Õ¹‘•µ±œ‰œµmÙ…È ´µ‰´µ‰œÌ¥tˆ€¼ø(€€€€€€ð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ðˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´Ðà…¹¥µ…Ñ”µÁÕ±Í”É½Õ¹‘•µmÙ…È ´µÈµá°¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰´µ‰½É‘•È¥t‰œµmÙ…È ´µ‰´µ‰œÈ¥tˆ€¼ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÌÍ´éÉ¥µ½±Ì´Èˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´Èà…¹¥µ…Ñ”µÁÕ±Í”É½Õ¹‘•µmÙ…È ´µÈµá°¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰´µ‰½É‘•È¥t‰œµmÙ…È ´µ‰´µ‰œÈ¥tˆ€¼ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´Èà…¹¥µ…Ñ”µÁÕ±Í”É½Õ¹‘•µmÙ…È ´µÈµá°¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰´µ‰½É‘•È¥t‰œµmÙ…È ´µ‰´µ‰œÈ¥tˆ€¼ø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€ð½‘¥Øø(€€¤ì((€€¼¼ƒŠRŠR 9¼…Ñ¥Ù”ÁÉ½©•ÐƒŠP•¹Õ¥¹•±ä•µÁÑä°¹½Ð„Í¥±•¹Ñ±äµÍÁ…ÉÍ”Á…”¸(€€¼¼ÁÉ½©•Ñ€¥Ì‘•É¥Ù•™É½´ÍÕµµ…É¥•Í€€¡ÕÍ•AÉ½©•ÑMÕµµ…É¥•ÍEÕ•Éä¤ì¥˜(€€¼¼±½…‘¥¹œ™¥¹¥Í¡•…¹¹½Ñ¡¥¹œÉ•Í½±Ù•°•¥Ñ¡•ÈÑ¡”™½Õ¹‘•È¡…Ì¹¼(€€¼¼ÁÉ½©•ÑÌå•Ð½È¹½¹”¥Ìµ…É­•…Ñ¥Ù”¸I•…°‘¥ÍÑ¥¹Ñ¥½¸°É•…°É½ÕÑ•ÌƒŠP(€€¼¼¹¼¥¹Ù•¹Ñ•½Áä¸ƒŠRŠR (€¥˜€ …¥Í1½…‘¥¹œ€˜˜€…ÁÉ½©•Ð¤ì(€€€É•ÑÕÉ¸€ (€€€€€€ñ‘¥ØÍÑå±”õíìµ…á]¥‘Ñ è€ÐØÀ°µ…É¥¸è€ˆÀ…ÕÑ¼ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆØÁÁà€ÄÙÁàˆ€è€ˆÄÀÁÁà€ÈÑÁàˆ°Ñ•áÑ±¥¸è€‰•¹Ñ•Èˆõôø(€€€€€€€€ñÀÍÑå±”õíì™½¹Ñ…µ¥±äè€ˆ45½¹¼œ°µ½¹½ÍÁ…”ˆ°™½¹ÑM¥é”è€ÄÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Å•´ˆ°µ…É¥¸è€ˆÀ€À€áÁàˆõôø(€€€€€€€€€…¥±ä‰É¥•™¥¹œ(€€€€€€€€ð½Àø(€€€€€€€€ñ ÄÍÑå±”õíì™½¹ÑM¥é”è€ÄØ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°µ…É¥¸è€ˆÀ€À€ÄÁÁàˆõôø(€€€€€€€€€9¼…Ñ¥Ù”Á±…¸‘•Ñ•Ñ•(€€€€€€€€ð½ Äø(€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°±¥¹•!•¥¡Ðè€Ä¸Ø°µ…É¥¸è€ˆÀ€À€ÈÁÁàˆõôø(€€€€€€€€€íÍÕµµ…É¥•Ì¹±•¹Ñ €ø€À(€€€€€€€€€€€€ü€‰e½Ô¡…Ù”ÁÉ½©•ÑÌ°‰ÕÐ¹½¹”¥ÌÕÉÉ•¹Ñ±ä…Ñ¥Ù”¸A¥¬½¹”Ñ¼•ÐÑ½‘…äÌÑ…Í¬¸ˆ(€€€€€€€€€€€€è€‰	Õ¥±‘5¥¹•¹•É…Ñ•Ì‘…¥±äÉ•½µµ•¹‘…Ñ¥½¹Ì½¹”å½Ô¡…Ù”…¸…Ñ¥Ù”ÁÉ½©•ÐÝ¥Ñ Ñ…Í­Ì½Èµ¥±•ÍÑ½¹•Ì¸‰ô(€€€€€€€€ð½Àø(€€€€€€€ì¼¨	½Ñ …Í•ÌÉ½ÕÑ”Ñ¼€½ÁÉ½©•ÑÌƒŠPÉ•…Ñ”AÉ½©•Ð¥ÌÕÉÉ•¹Ñ±ä„(€€€€€€€€€€€µ½‘…°Ñ¡•É”€¡¹¼ÍÑ…¹‘…±½¹”€½ÁÉ½©•ÑÌ½¹•ÜÉ½ÕÑ”•á¥ÍÑÌå•Ð¤°Í¼(€€€€€€€€€€€Ñ¡¥Ì¥Ì„É•…°±¥¹¬•¥Ñ¡•ÈÝ…ä°¹½Ð„Õ•ÍÌ¸€¨½ô(€€€€€€€€ñ„(€€€€€€€€€¡É•˜ôˆ½ÁÉ½©•ÑÌˆ(€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€‘¥ÍÁ±…äè€‰¥¹±¥¹”µ‰±½¬ˆ°Á…‘‘¥¹œè€ˆÄÁÁà€ÈÁÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€à°(€€€€€€€€€€€‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ…•¹Ðµ‰¤ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°(€€€€€€€€€€€½±½Èè€‰Ù…È ´µ‰´µ‰œ¤ˆ°™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°Ñ•áÑ•½É…Ñ¥½¸è€‰¹½¹”ˆ°(€€€€€€€€€õô(€€€€€€€€ø(€€€€€€€€€íÍÕµµ…É¥•Ì¹±•¹Ñ €ø€À€ü€‰¡½½Í”„ÁÉ½©•Ðˆ€è€‰É•…Ñ”„Á±…¸‰ô(€€€€€€€€ð½„ø(€€€€€€ð½‘¥Øø(€€€€¤ì(€ô((€€¼¼ƒŠRŠR I•½Ù•Éä5½‘”…Ñ¥Ù”ƒŠPÑ…­•ÌÁÉ¥½É¥Ñä½Ù•È•Ù•ÉåÑ¡¥¹œ•±Í”½¸Ñ¡¥Ì(€€¼¼Á…”€¡µ¥±•ÍÑ½¹”‰É•…­Ì¥¹±Õ‘•¤è€‰9½Éµ…°É•½µµ•¹‘…Ñ¥½¹ÌÁ…ÕÍ•(€€¼¼Õ¹Ñ¥°Ñ¡¥Ì¥ÌÉ•Í½±Ù•ˆ¥ÌÑ¡”Ý¡½±”Á½¥¹Ð°µ…Ñ¡¥¹œÑ¡”¥µ„½Áä¸(€€¼¼½Ù•ÉÌ‰½Ñ ÑÉ¥•ÉÌ€¡¥¹…Ñ¥Ù¥Ñä‘•…ä€¬¡ÕÉ¸É¥Í¬¤ƒŠPÍ•”(€€¼¼½µÁ½¹•¹ÑÌ½I•½Ù•Éå5½‘•…É¹ÑÍà™½È¡½Ü¥ÐÑ•±±ÌÑ¡•´…Á…ÉÐ¸ƒŠRŠR (€¥˜€¡É•½Ù•ÉåÑ¥Ù”¤ì(€€€É•ÑÕÉ¸€ (€€€€€€ñ‘¥ØÍÑå±”õíìµ…á]¥‘Ñ è€àÈÀ°µ…É¥¸è€ˆÀ…ÕÑ¼ˆ°Á…‘‘¥¹œè€ˆÈÑÁà€ÈÑÁàˆõôø(€€€€€€€€ñI•½Ù•Éå5½‘•…É(€€€€€€€€€½¹½µÁ±•Ñ”õì ¤€ôøÍ•ÑI•½Ù•ÉåÑ¥Ù”¡™…±Í”¥ô(€€€€€€€€€½¹¥Íµ¥ÍÌõì ¤€ôøÍ•ÑI•½Ù•ÉåÑ¥Ù”¡™…±Í”¥ô(€€€€€€€€¼ø(€€€€€€ð½‘¥Øø(€€€€¤ì(€ô((€€¼¼ƒŠRŠR I¥Í¬%¹Ñ•ÉÉÕÁÐƒŠPÑ¡”‘•Ñ•Ñ¥½¸µ½µ•¹Ð™½È„¡ÕÉ¸µÉ¥Í¬Í¥¹…°(€€¼¼±ÕÍÑ•È€¡±¥ˆ½É¥Í­M¥¹…±Ì¹ÑÌ¤¸M¡½Ý¸½¹”Á•ÈÁÉ½©•ÐÁ•È‘…äÕ¹±•ÍÌ(€€¼¼‘¥Íµ¥ÍÍ•ì¡½½Í¥¹œ€‰	•¥¸É•½Ù•Éäˆ…Ñ¥Ù…Ñ•ÌI•½Ù•Éä5½‘”…‰½Ù”¸ƒŠRŠR (€¥˜€¡ÁÉ½©•Ðü¹¥€˜˜É¥Í­ÍÍ•ÍÍµ•¹Ð€˜˜Í¡½Õ±‘QÉ¥•ÉI¥Í­%¹Ñ•ÉÉÕÁÐ¡É¥Í­ÍÍ•ÍÍµ•¹Ð¤€˜˜€…É¥Í­%¹Ñ•ÉÉÕÁÑ¥Íµ¥ÍÍ•¤ì(€€€½¹ÍÐ‘¥Íµ¥ÍÍ•‘-•ä€ô‰µ}É¥Í­}¥¹Ñ•ÉÉÕÁÑ}‘¥Íµ¥ÍÍ•‘|‘íÁÉ½©•Ð¹¥‘õ|‘í¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤¹Í±¥” À°€ÄÀ¥õ€ì(€€€É•ÑÕÉ¸€ (€€€€€€ñ¡ÕÉ¹I¥Í­%¹Ñ•ÉÉÕÁÐ(€€€€€€€…ÍÍ•ÍÍµ•¹ÐõíÉ¥Í­ÍÍ•ÍÍµ•¹Ñô(€€€€€€€½¹	•¥¹I•½Ù•Éäõí…Íå¹Œ€ ¤€ôøì(€€€€€€€€€ÑÉäì(€€€€€€€€€€€½¹ÍÐÉ•Ì€ô…Ý…¥Ð™•Ñ  ˆ½…Á¤½É•½Ù•Éäµµ½‘”ˆ°ì(€€€€€€€€€€€€€µ•Ñ¡½è€‰A=MPˆ°(€€€€€€€€€€€€€¡•…‘•ÉÌèì€‰½¹Ñ•¹ÐµQåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆô°(€€€€€€€€€€€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ìÑÉ¥•Èè€‰É¥Í¬ˆ°ÁÉ½©•Ñ%èÁÉ½©•Ð¹¥ô¤°(€€€€€€€€€€€ô¤ì(€€€€€€€€€€€¥˜€¡É•Ì¹½¬¤Í•ÑI•½Ù•ÉåÑ¥Ù”¡ÑÉÕ”¤ì(€€€€€€€€€ô…Ñ íô(€€€€€€€õô(€€€€€€€½¹¥Íµ¥ÍÌõì ¤€ôøì(€€€€€€€€€ÍÑ½É…”¹Í•Ð¡‘¥Íµ¥ÍÍ•‘-•ä°€ˆÄˆ¤ì(€€€€€€€€€Í•ÑI¥Í­%¹Ñ•ÉÉÕÁÑ¥Íµ¥ÍÍ•¡ÑÉÕ”¤ì(€€€€€€€õô(€€€€€€¼ø(€€€€¤ì(€ô((€€¼¼ƒŠRŠR 5¥±•ÍÑ½¹”	É•…¬¥¹Ñ•ÉÍÑ¥Ñ¥…°ƒŠPµ…¹‘…Ñ½Éä¡•­Á½¥¹Ð…™Ñ•Èµ¥±•ÍÑ½¹”½ÍÑ…”¡…¹”°½È„ÍÑ…±±•µ¥±•ÍÑ½¹”ƒŠRŠR (€¥˜€¡µ¥±•ÍÑ½¹•	É•…¬€˜˜€…µ¥±•ÍÑ½¹•	É•…­¥Íµ¥ÍÍ•¤ì(€€€½¹ÍÐ¥ÍMÑ…±±¥¹œ€ôµ¥±•ÍÑ½¹•	É•…¬¹ÑÉ¥•È€ôôô€‰ÍÑ…±±¥¹œˆì(€€€É•ÑÕÉ¸€ (€€€€€€ñ‘¥ØÍÑå±”õíìµ…á]¥‘Ñ è€ÔØÀ°µ…É¥¸è€ˆÀ…ÕÑ¼ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÐÁÁà€ÄÙÁàˆ€è€ˆàÁÁà€ÈÑÁàˆõôø(€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÄØõô…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€ÀõôÑÉ…¹Í¥Ñ¥½¸õíì‘ÕÉ…Ñ¥½¸è€À¸Ðõôø(€€€€€€€€€ì¼¨!•…‘•È€¨½ô(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€ÄÀ°µ…É¥¹	½ÑÑ½´è€Èàõôø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíìÝ¥‘Ñ è€ÌÈ°¡•¥¡Ðè€ÌÈ°‰½É‘•ÉI…‘¥ÕÌè€à°‰…­É½Õ¹è¥ÍMÑ…±±¥¹œ€ü€‰Ù…È ´µ‰´µ…µ‰•È¤ˆ€è€‰Ù…È ´µ‰´µÉ•¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°™±•áM¡É¥¹¬è€Àõôø(€€€€€€€€€€€€€€ñ±•ÉÑ¥É±”Í¥é”õìÄÙô½±½Èõí¥ÍMÑ…±±¥¹œ€ü€ˆŒÀÀÀˆ€è€ˆ™™˜‰ô€¼ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÀ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆ°µ…É¥¸è€Àõôø(€€€€€€€€€€€€€€€í¥ÍMÑ…±±¥¹œ€ü€‰MÑ¥±°½Á•¸ˆ€è€‰5…¹‘…Ñ½Éä¡•­Á½¥¹Ð‰ô(€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÐ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°µ…É¥¸è€À°±¥¹•!•¥¡Ðè€Ä¸Ìõôø(€€€€€€€€€€€€€€€í¥ÍMÑ…±±¥¹œ(€€€€€€€€€€€€€€€€€€üMÑ¥±°Ý½É­¥¹œ½¸è€‘íÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡µ¥±•ÍÑ½¹•	É•…¬¹ÑÉ¥•É1…‰•°¥õ€(€€€€€€€€€€€€€€€€€€èe½Ô©ÕÍÐ½µÁ±•Ñ•è€‘íÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡µ¥±•ÍÑ½¹•	É•…¬¹ÑÉ¥•É1…‰•°¥õô(€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°±¥¹•!•¥¡Ðè€Ä¸Ø°µ…É¥¹	½ÑÑ½´è€ÈÐõôø(€€€€€€€€€€€í¥ÍMÑ…±±¥¹œ(€€€€€€€€€€€€€€ü€‰Q¡¥Ì¡…Ì‰••¸½Á•¸±½¹•ÈÑ¡…¸•áÁ•Ñ•¸9¼©Õ‘µ•¹ÐƒŠPÍ½µ”µ¥±•ÍÑ½¹•Ì©ÕÍÐÉÕ¸±½¹œ¸!•É”ÌÝ¡…ÐÌ±¥­•±ä…ÑÕ…±±ä½¥¹œ½¸¸ˆ(€€€€€€€€€€€€€€è€‰	•™½É”å½Ôµ½Ù”Ñ¼Ñ¡”¹•áÐµ¥±•ÍÑ½¹”°¡•É”ÌÝ¡…Ð½Õ±ÍÑ¥±°­¥±°Ñ¡¥Ì¸‰ô(€€€€€€€€€€ð½Àø((€€€€€€€€€ì¼¨€Ì‰ÉÕÑ…°Á½¥¹ÑÌ€¨½ô(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…Àè€ÄÀ°µ…É¥¹	½ÑÑ½´è€ÈÐõôø(€€€€€€€€€€€íµ¥±•ÍÑ½¹•	É•…¬¹‰ÉÕÑ…±}Á½¥¹ÑÌ¹µ…À ¡Á½¥¹Ð°¤¤€ôø€ (€€€€€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€€€€€­•äõí¥ô(€€€€€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°àè€´àõô(€€€€€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°àè€Àõô(€€€€€€€€€€€€€€€ÑÉ…¹Í¥Ñ¥½¸õíì‘•±…äè€À¸Ä€¬¤€¨€À¸Ààõô(€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°(€€€€€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€‰™±•àµÍÑ…ÉÐˆ°(€€€€€€€€€€€€€€€€€…Àè€ÄÀ°(€€€€€€€€€€€€€€€€€Á…‘‘¥¹Q½Àè€È°(€€€€€€€€€€€€€€€€€Á…‘‘¥¹	½ÑÑ½´è€È°(€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíìÝ¥‘Ñ è€Ø°¡•¥¡Ðè€Ø°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µÉ•¤ˆ°µ…É¥¹Q½Àè€Ø°™±•áM¡É¥¹¬è€Àõô€¼ø(€€€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°µ…É¥¸è€À°±¥¹•!•¥¡Ðè€Ä¸ØõôùíÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡Á½¥¹Ð¥ôð½Àø(€€€€€€€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€€€€€€€¤¥ô(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€ì¼¨I•½µµ•¹‘•…Ñ¥½¸€¨½ô(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÈ°Á…‘‘¥¹œè€ˆÄÙÁà€ÄáÁàˆ°µ…É¥¹	½ÑÑ½´è€ÈÐõôø(€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÀ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆ°µ…É¥¸è€ˆÀ€À€áÁàˆõôùI•½µµ•¹‘•…Ñ¥½¸‰•™½É”½¹Ñ¥¹Õ¥¹œð½Àø(€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°™½¹Ñ]•¥¡Ðè€ÔÀÀ°µ…É¥¸è€À°±¥¹•!•¥¡Ðè€Ä¸ØõôûŠHíÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡µ¥±•ÍÑ½¹•	É•…¬¹É•½µµ•¹‘•‘}…Ñ¥½¸¥ôð½Àø(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€ì¼¨­¹½Ý±•‘”‰ÕÑÑ½¸€¨½ô(€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€½¹ÍÐ‘¥Íµ¥ÍÍ-•ä€ô‰µ}µ¥±•ÍÑ½¹•}‰É•…­}‘¥Íµ¥ÍÍ•‘|‘íµ¥±•ÍÑ½¹•	É•…¬¹•¹•É…Ñ•‘}…Ñõ€ì(€€€€€€€€€€€€€€¼¼=ÁÑ¥µ¥ÍÑ¥…±±ä‘¥Íµ¥ÍÌ¥¸U$°É•Ù•ÉÐ¥˜Í•ÉÙ•È™…¥±Ì(€€€€€€€€€€€€€Í•Ñ5¥±•ÍÑ½¹•	É•…­¥Íµ¥ÍÍ•¡ÑÉÕ”¤ì(€€€€€€€€€€€€€ÍÑ½É…”¹Í•Ð¡‘¥Íµ¥ÍÍ-•ä°€ˆÄˆ¤ì(€€€€€€€€€€€€€™•Ñ  ˆ½…Á¤½™½Õ¹‘•Èµµ•µ½Éäˆ°ì(€€€€€€€€€€€€€€€µ•Ñ¡½è€‰AQ ˆ°(€€€€€€€€€€€€€€€¡•…‘•ÉÌèì€‰½¹Ñ•¹ÐµQåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆô°(€€€€€€€€€€€€€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ìÁ•¹‘¥¹}µ¥±•ÍÑ½¹•}‰É•…¬è¹Õ±°ô¤°(€€€€€€€€€€€€€ô¤¹…Ñ   ¤€ôøì(€€€€€€€€€€€€€€€€¼¼M•ÉÙ•ÈAQ ™…¥±•ƒŠP­••ÀÑ¡”±½…°‘¥Íµ¥ÍÌ™±…œÍ¼Ñ¡”(€€€€€€€€€€€€€€€€¼¼¥¹Ñ•ÉÍÑ¥Ñ¥…°‘½•Í¸ÐÉ•…ÁÁ•…Èµ¥µÍ•ÍÍ¥½¸°‰ÕÐ±•…ÈÑ¡”(€€€€€€€€€€€€€€€€¼¼ÍÑ½É…”­•äÍ¼¥ÐÉ”µÍ¡½ÝÌ½¸¡…ÉÉ•±½…€¡Í•ÉÙ•È¥ÌÍ½ÕÉ”½˜ÑÉÕÑ ¤¸(€€€€€€€€€€€€€€€ÍÑ½É…”¹É•µ½Ù”¡‘¥Íµ¥ÍÍ-•ä¤ì(€€€€€€€€€€€€€ô¤ì(€€€€€€€€€€€õô(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€Ý¥‘Ñ è€ˆÄÀÀ”ˆ°Á…‘‘¥¹œè€ˆÄÑÁà€Àˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÈ°‰½É‘•Èè€‰¹½¹”ˆ°(€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µ‰œ¤ˆ°(€€€€€€€€€€€€€™½¹ÑM¥é”è€ÄÐ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€$Ù”…­¹½Ý±•‘•Ñ¡¥ÌƒŠP½¹Ñ¥¹Õ”Ñ¼Ñ½‘…äÌÑ…Í¬ƒŠH(€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€ð½‘¥Øø(€€€€¤ì(€ô((€€¼¼ƒŠRŠR ½¹”ÍÑ…Ñ”ƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR (€¥˜€¡‘½¹”¤ì(€€€É•ÑÕÉ¸€ (€€€€€€ñ‘¥ØÍÑå±”õíìµ…á]¥‘Ñ è€ÔØÀ°µ…É¥¸è€ˆÀ…ÕÑ¼ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÌÙÁà€Àˆ€è€ˆØÁÁà€ÈÑÁàˆ°Ñ•áÑ±¥¸è€‰•¹Ñ•Èˆõôø(€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø¥¹¥Ñ¥…°õíìÍ…±”è€À¸à°½Á…¥Ñäè€Àõô…¹¥µ…Ñ”õíìÍ…±”è€Ä°½Á…¥Ñäè€Äõôø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíìÝ¥‘Ñ è€ØÐ°¡•¥¡Ðè€ØÐ°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µÉ••¸µ‘¥´¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µÉ••¸µ‰¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°µ…É¥¸è€ˆÀ…ÕÑ¼€ÈÁÁàˆõôø(€€€€€€€€€€€€ñ¡•­¥É±”ÈÍ¥é”õìÈáô½±½Èô‰Ù…È ´µ‰´µÉ••¸¤ˆ€¼ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ñ ÈÍÑå±”õíì™½¹ÑM¥é”è¥Í5½‰¥±”€ü€ÈÀ€è€ÈÈ°™½¹Ñ]•¥¡Ðè€àÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆ´À¸ÀÍ•´ˆ°µ…É¥¹	½ÑÑ½´è€ÄÀõôø(€€€€€€€€€€€%¹Í¥¡Ð±½•¸	Õ¥±‘5¥¹…‘…ÁÑÌ¸(€€€€€€€€€€ð½ Èø(€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÐ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è¥Í¥ÉÍÑM•ÍÍ¥½¸€ü€ÄØ€è€ÈÀ°±¥¹•!•¥¡Ðè€Ä¸Øõôø(€€€€€€€€€€€í‘¥ÍÁ±…å9…µ”€ü½µ”‰…¬Ñ½µ½ÉÉ½Ü°€‘í‘¥ÍÁ±…å9…µ”¹ÍÁ±¥Ð ˆ€ˆ¥lÁuô¸½¹Í¥ÍÑ•¹ä½µÁ½Õ¹‘Ì¹€€è€‰½µ”‰…¬Ñ½µ½ÉÉ½Ü¸½¹Í¥ÍÑ•¹ä½µÁ½Õ¹‘Ì¸‰ô(€€€€€€€€€€ð½Àø((€€€€€€€€€ì¼¨ƒŠRŠR ¥ÉÍÐµÍ•ÍÍ¥½¸è€Üµ‘…äÁÉ½©•Ñ¥½¸ƒŠRŠR €¨½ô(€€€€€€€€€í¥Í¥ÉÍÑM•ÍÍ¥½¸€˜˜€  ¤€ôøì(€€€€€€€€€€€½¹ÍÐÍ¬€ô€¡ÁÉ½©•Ðü¹ÍÑ…ÉÑÕÁ}ÍÑ…”€üü€‰%‘•„ˆ¤¹Ñ½1½Ý•É…Í” ¤ì(€€€€€€€€€€€½¹ÍÐµ¥±•ÍÑ½¹•Ì€ô]-}=9}5%1MQ=9MmÍ­t€üü]-}=9}5%1MQ=9L¹¥‘•„ì(€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€àõô(€€€€€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€€€€€€€€€ÑÉ…¹Í¥Ñ¥½¸õíì‘•±…äè€À¸Ìõô(€€€€€€€€€€€€€€€ÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÐ°Á…‘‘¥¹œè€ˆÄáÁà€ÈÁÁàˆ°µ…É¥¹	½ÑÑ½´è€ÈÀ°Ñ•áÑ±¥¸è€‰±•™Ðˆõô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÀ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆ°µ…É¥¹	½ÑÑ½´è€ÄÐõôø(€€€€€€€€€€€€€€€€€%˜å½Ô‘¼Ñ¡¥Ì•Ù•Éä‘…äƒŠPÝ••¬€Ä™½È„íÁÉ½©•Ðü¹ÍÑ…ÉÑÕÁ}ÍÑ…”€üü€‰%‘•„‰ôÍÑ…”™½Õ¹‘•È(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€íµ¥±•ÍÑ½¹•Ì¹µ…À ¡´°¤¤€ôø€ (€€€€€€€€€€€€€€€€€€ñ‘¥Ø­•äõí¥ôÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€ÄÈ°…±¥¹%Ñ•µÌè€‰™±•àµÍÑ…ÉÐˆ°Á…‘‘¥¹	½ÑÑ½´è¤€ðµ¥±•ÍÑ½¹•Ì¹±•¹Ñ €´€Ä€ü€ÄÀ€è€À°µ…É¥¹	½ÑÑ½´è¤€ðµ¥±•ÍÑ½¹•Ì¹±•¹Ñ €´€Ä€ü€ÄÀ€è€À°‰½É‘•É	½ÑÑ½´è¤€ðµ¥±•ÍÑ½¹•Ì¹±•¹Ñ €´€Ä€ü€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ€è€‰¹½¹”ˆõôø(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°™½¹Ñ…µ¥±äè€‰µ½¹½ÍÁ…”ˆ°Á…‘‘¥¹Q½Àè€Ä°™±•áM¡É¥¹¬è€À°µ¥¹]¥‘Ñ è€ÌØõôù…äí´¹‘…åôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°±¥¹•!•¥¡Ðè€Ä¸Ôõôùí´¹µ¥±•ÍÑ½¹•ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€€€€€€€¤ì(€€€€€€€€€ô¤ ¥ô((€€€€€€€€€í…Ñ¥Ù•A…ÑÑ•É¸€˜˜€ (€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹	½ÑÑ½´è€ÈÀ°Ñ•áÑ±¥¸è€‰±•™Ðˆõôø(€€€€€€€€€€€€€€ñA…åÝ…±±5½µ•¹Ð(€€€€€€€€€€€€€€€ÑÉ¥•ÈõíÁ±…¸€ôôô€‰™É•”ˆ€ü€‰Á…ÑÑ•É¸ˆ€è€‰Á…ÑÑ•É¸‰ô(€€€€€€€€€€€€€€€Á…ÑÑ•É¹5•ÍÍ…”õí…Ñ¥Ù•A…ÑÑ•É¸¹µ•ÍÍ…•ô(€€€€€€€€€€€€€€€½¹¥Íµ¥ÍÌõì ¤€ôøÍ•ÑÑ¥Ù•A…ÑÑ•É¸¡¹Õ±°¥ô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¥ô((((€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è¥Í5½‰¥±”€ü€‰½±Õµ¸ˆ€è€‰É½Üˆ°…Àè€ÄÀ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆõôø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÉ½ÕÑ•È¹ÁÕÍ  ˆ½É•™±•Ðˆ¥ôÍÑå±”õíìÁ…‘‘¥¹œè€ˆÄÉÁà€ÈÁÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°‰½É‘•Èè€‰¹½¹”ˆ°‰…­É½Õ¹è€‰Ù…È ´µÉ…µÁÉ¥µ…Éä¤ˆ°½±½Èè€‰Ý¡¥Ñ”ˆ°™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€ØÀÀ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥ÐˆõôùI•™±•Ð½¸Ñ½‘…äƒŠHð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÉ½ÕÑ•È¹ÁÕÍ  ˆ½½Ù•ÉÙ¥•Üˆ¥ôÍÑå±”õíìÁ…‘‘¥¹œè€ˆÄÉÁà€ÈÁÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°™½¹ÑM¥é”è€ÄÌ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥ÐˆõôùY¥•Ü™Õ±°‘…Í¡‰½…Éð½‰ÕÑÑ½¸ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø((€€€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹Q½Àè€ÈÐ°Á…‘‘¥¹œè€ˆÄÑÁà€ÄáÁàˆ°‰…­É½Õ¹è€‰É‰„ ää°ÄÀÈ°ÈÐÄ°À¸ÀØ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥É‰„ ää°ÄÀÈ°ÈÐÄ°À¸Äà¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÈ°Ñ•áÑ±¥¸è€‰•¹Ñ•Èˆõôø(€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¸è€ˆÀ€À€ÄÁÁàˆõôù-¹½Ü„™½Õ¹‘•ÈÝ¡¼¹••‘ÌÑ¡¥Ìüð½Àø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€à°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°™±•á]É…Àè€‰ÝÉ…Àˆõôø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÉ½ÕÑ•È¹ÁÕÍ  ˆ½¥¹Ù¥Ñ”ˆ¥ôÍÑå±”õíìÁ…‘‘¥¹œè€ˆÝÁà€ÄÑÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€à°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°™½¹ÑM¥é”è€ÄÈ°™½¹Ñ]•¥¡Ðè€ØÀÀ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆõôø(€€€€€€€€€€€€€%¹Ù¥Ñ”„™½Õ¹‘•ÈƒŠH(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÉ½ÕÑ•È¹ÁÕÍ  ˆ½ÁÉ½É•ÍÌˆ¥ôÍÑå±”õíìÁ…‘‘¥¹œè€ˆÝÁà€ÄÑÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€à°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™½¹ÑM¥é”è€ÄÈ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆõôø(€€€€€€€€€€€€€M¡…É”Ñ¡¥ÌÝ••¬ÌÁÉ½É•ÍÌ(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€¤ì(€ô((€€¼¼ƒŠRŠR É••Ñ¥¹œ±¥¹”ƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR (€½¹ÍÐ™¥ÉÍÑ9…µ”€ô‘¥ÍÁ±…å9…µ”ü¹ÍÁ±¥Ð ˆ€ˆ¥lÁt€üü¹Õ±°ì(€½¹ÍÐÉ••Ñ¥¹1¥¹”€ô™¥ÉÍÑ9…µ”(€€€€ü€‘í•ÑÉ••Ñ¥¹œ ¥ô°€‘í™¥ÉÍÑ9…µ•õ€(€€€€è•ÑÉ••Ñ¥¹œ ¤ì((€½¹ÍÐ¥Í…å=¹•½±‘MÑ…ÉÐ€ô…½Õ¹Ñ•…åÌ€ðô€Ä€˜˜ÍÑÉ•…¬€ôôô€À€˜˜€…‘½¹”ì(€½¹ÍÐÝ••­=¹•MÑ…•-•ä€ô€¡ÁÉ½©•Ðü¹ÍÑ…ÉÑÕÁ}ÍÑ…”€üü€‰%‘•„ˆ¤¹Ñ½1½Ý•É…Í” ¤ì(€½¹ÍÐÝ••­=¹•5¥±•ÍÑ½¹•Ì€ô]-}=9}5%1MQ=9MmÝ••­=¹•MÑ…•-•åt€üü]-}=9}5%1MQ=9L¹¥‘•„ì(€½¹ÍÐÝ••­=¹•Q…É•Ð€ôÝ••­=¹•5¥±•ÍÑ½¹•ÍmÝ••­=¹•5¥±•ÍÑ½¹•Ì¹±•¹Ñ €´€Åtü¹µ¥±•ÍÑ½¹”€üü]-}=9}5%1MQ=9L¹¥‘•…lÉt¹µ¥±•ÍÑ½¹”ì(€½¹ÍÐÝ••­=¹•MÑ…ÉÑ…Ñ”€ô…½Õ¹ÑÉ•…Ñ•‘Ð€ü¹•Ü…Ñ”¡…½Õ¹ÑÉ•…Ñ•‘Ð¤€è¹•Ü…Ñ” ¤ì(€½¹ÍÐÝ••­=¹•…åÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Üô°€¡|°¥¹‘•à¤€ôøì(€€€½¹ÍÐ‘…Ñ”€ô…‘‘…åÌ¡Ý••­=¹•MÑ…ÉÑ…Ñ”°¥¹‘•à¤ì(€€€½¹ÍÐ­•ä€ô±½…±…å-•ä¡‘…Ñ”¤ì(€€€½¹ÍÐ½µÁ±•Ñ•€ô	½½±•…¸¡ÍÑ½É…”¹•Ð¡‰µ}Ñ…Í­}‘½¹•|‘í­•åõ€¤ñðÍÑ½É…”¹•Ð¡‰µ}¡•­¥¹}‘½¹•}‘…Ñ•|‘íÕÍ•É%‘õ€¤€ôôô­•äñðÍÑ½É…”¹•Ð ‰‰µ}¡•­¥¹}‘½¹•}‘…Ñ”ˆ¤€ôôô­•ä¤ì(€€€É•ÑÕÉ¸ì(€€€€€‘…äè¥¹‘•à€¬€Ä°(€€€€€½µÁ±•Ñ•°(€€€€€…Ñ¥Ù”è¥¹‘•à€ôôô5…Ñ ¹µ¥¸ Ø°5…Ñ ¹µ…à À°…½Õ¹Ñ•…åÌ¤¤°(€€€ôì(€ô¤ì((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ½‘…äµµ½½ˆ‘…Ñ„µµ½½õíµ½½‘ô‘…Ñ„µÑ¥¬õíµ½½‘Q¥­ô‘…Ñ„µ•¹…•õí•¹…•€ü€‰ÑÉÕ”ˆ€è€‰™…±Í”‰ô‘…Ñ„µ…±´õí…±´€˜˜€…•¹…•€ü€‰ÑÉÕ”ˆ€è€‰™…±Í”‰ôÍÑå±”õíìµ…á]¥‘Ñ è€‰Ù…È ´µµ½½µµ…à°€äÈÁÁà¤ˆ°Ý¥‘Ñ è€ˆÄÀÀ”ˆ°µ¥¹]¥‘Ñ è€À°‰½áM¥é¥¹œè€‰‰½É‘•Èµ‰½àˆ°µ…É¥¸è€ˆÀ…ÕÑ¼ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÀ€ÉÁà€ÈáÁàˆ€è€ˆÈÁÁà€áÁà€ÐáÁàˆ°½Ù•É™±½Ý`è€‰±¥Àˆõôø((€€€€€ì¼¨Q…Í¬µ™¥ÉÍÐÑ½À½˜Á…”¸=¹±äÑ¡”1¥Ñ”½AÉ¼Ñ½±”±¥Ù•Ì¡•É”èÍÑÉ•…¬°µ½µ•¹ÑÕ´°(€€€€€€€€€ÍÑ…”ÁÉ½É•ÍÌ…¹Ñ¡”Ý••­±äÁ¥ÑÕÉ”…É”¥¸Ñ¡”5½É¹¥¹œ	É¥•™¥¹œ…¹Ñ¡”(€€€€€€€€€½™½Õ¹‘•ÈAÕ±Í”°Í¼É•Á•…Ñ¥¹œÑ¡•´…‰½Ù”Ñ¡”Ñ…Í¬Ý…Ì¹½¥Í”¸€¨½ô(€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€´Øõô(€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€ÑÉ…¹Í¥Ñ¥½¸õíì‘ÕÉ…Ñ¥½¸è€À¸ÈÔõô(€€€€€€€ÍÑå±”õíìµ…É¥¹	½ÑÑ½´è€ÄÐõô(€€€€€€ø(€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰ÍÁ…”µ‰•ÑÝ••¸ˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€ÄÀ°µ…É¥¹	½ÑÑ½´è€ÄÀõôø(€€€€€€€€€€ñ5½½‘MÑÉ¥Àµ½½õíµ½½‘ô•¹…•õí•¹…•‘ô€¼ø(€€€€€€€€€€ñU%5½‘•Q½±”µ½‘”õíÕ¥5½‘•ô½¹¡…¹”õíÍ•ÑU%5½‘•ô€¼ø(€€€€€€€€ð½‘¥Øø((€€€€€€€ì¼¨$ÕÍ…”Ý…É¹¥¹œ€¨½ô(€€€€€€€í…¥UÍ…”€˜˜€……¥UÍ…”¹Õ¹±¥µ¥Ñ•€˜˜€¡…¥UÍ…”¹µ½¹Ñ¡±å1¥µ¥Ð€´…¥UÍ…”¹µ½¹Ñ¡±åUÍ•¤€ðô€Ô€˜˜€ (€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€à°Á…‘‘¥¹œè€ˆÝÁà€ÄÉÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°µ…É¥¹Q½Àè€ÄÀõôø(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ØÀÀ°™±•àè€Äõôø(€€€€€€€€€€€€€í…¥UÍ…”¹µ½¹Ñ¡±å1¥µ¥Ð€´…¥UÍ…”¹µ½¹Ñ¡±åUÍ•‘ô$…±±ÌÉ•µ…¥¹¥¹œÑ¡¥Ìµ½¹Ñ ¸(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€ñ„¡É•˜ôˆ½ÕÁÉ…‘”ˆÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°Ñ•áÑ•½É…Ñ¥½¸è€‰¹½¹”ˆ°Ý¡¥Ñ•MÁ…”è€‰¹½ÝÉ…ÀˆõôùUÁÉ…‘”™½ÈÕ¹±¥µ¥Ñ•ƒŠHð½„ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€¥ô(€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø((€€€€€ì¼¨ƒŠRŠR Ù•¹¥¹œµ½‘”ƒŠPÍÕÉ™…•ÌÑ¡”•Ù•¹¥¹œ¡•¬µ¥¸‘¥É•Ñ±ä€¡¥ÐÕÍ•Ñ¼(€€€€€€€€€€€€‰”É•…¡…‰±”½¹±ä¥¹Í¥‘”Ñ¡”€‰]¡äÑ¡¥ÌÑ…Í¬üˆ‘É…Ý•È¤…¹(€€€€€€€€€€€€½±±…ÁÍ•ÌÑ¡”Ñ…Í¬É•½µµ•¹‘…Ñ¥½¸¥¹Ñ¼„Í¥¹±”€‰M¡½ÜÑ…Í¬ˆ(€€€€€€€€€€€€Á¥±°°Í¼Ñ¡”Á…”…¥¹Ì½¹”±•…È•Ù•¹¥¹œ™½ÕÌ¥¹ÍÑ•…½˜(€€€€€€€€€€€€ÍÑ…­¥¹œÑ¡”¡•¬µ¥¸½¸Ñ½À½˜•Ù•ÉåÑ¡¥¹œ•±Í”¸ƒŠRŠR €¨½ô(€€€€€í¥ÍÙ•¹¥¹MÕÉ™…•€˜˜€…Ñ…Í­A¥±±áÁ…¹‘•€˜˜€ (€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€´Øõô(€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€€€ÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…Àè€ÄÈ°µ…É¥¹	½ÑÑ½´è€ÄØõô(€€€€€€€€ø(€€€€€€€€€€ñÙ•¹¥¹±½Í•½ÕÐ(€€€€€€€€€€€Ñ…Í¬õí…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€üü¹Õ±±ô(€€€€€€€€€€€ÁÉ½©•Ñ%õí…Ñ¥Ù•AÉ½©•Ñ%€üü¹Õ±±ô(€€€€€€€€€€€½¹M…Ù•õì ¤€ôøìÍÑ½É…”¹Í•Ð¡¡•­¥¹M±½Ð„¹­•ä°€ˆÄˆ¤ìõô(€€€€€€€€€€¼ø(€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€Í•ÑQ…Í­A¥±±áÁ…¹‘•¡ÑÉÕ”¤ì(€€€€€€€€€€€€€€¼¼…É¥Í¸Ð¥¸Ñ¡”=4å•ÐÑ¡¥ÌÑ¥¬ƒŠPÝ…¥Ð½¹”™É…µ”¸(€€€€€€€€€€€€€É•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”  ¤€ôø…Ñ¥½¹…É‘I•˜¹ÕÉÉ•¹Ðü¹ÍÉ½±±%¹Ñ½Y¥•Ü¡ì‰•¡…Ù¥½Èè€‰Íµ½½Ñ ˆ°‰±½¬è€‰ÍÑ…ÉÐˆô¤¤ì(€€€€€€€€€€€õô(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰ÍÁ…”µ‰•ÑÝ••¸ˆ°…Àè€ÄÀ°(€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄÁÁà€áÁà€ÄÁÁà€ÄÑÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€äää°(€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°(€€€€€€€€€€€€€ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°Ý¥‘Ñ è€ˆÄÀÀ”ˆ°Ñ•áÑ±¥¸è€‰±•™Ðˆ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÔÀÀõôø(€€€€€€€€€€€€€Q½‘…ä™…Á½ÌíÌÑ…Í¬¥ÌÍÑ¥±°¡•É”¥˜å½ÔÝ…¹Ð¥Ð¸(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì(€€€€€€€€€€€€€™±•áM¡É¥¹¬è€À°‰½É‘•ÉI…‘¥ÕÌè€äää°Á…‘‘¥¹œè€ˆÙÁà€ÄÑÁàˆ°(€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°½±½Èè€ˆŒÄÔÄÌÁ„ˆ°™½¹ÑM¥é”è€ÄÈ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°(€€€€€€€€€€€õôø(€€€€€€€€€€€€€M¡½ÜÑ…Í¬(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€¥ô(((€€€€€ì¼¨ƒŠVCŠV@AI=UP%5AI=Y59P€ŒÈƒŠPQM,µ%IMP1e=UPƒŠVCŠV@(€€€€€€€€€AÉ½©•Ð‰…‘”¥Ì€Ä±¥¹”°Ñ¡•¸Q%=8I¥ÌÑ¡”™¥ÉÍÐ™Õ±°‰±½¬¸(€€€€€€€€€±°½¹Ñ•áÐ€¡å•ÍÑ•É‘…ä°…¹…±åÍ¥Ì°¡•¬µ¥¹Ì¤µ½Ù•Ì¥¹Ñ¼„(€€€€€€€€€½±±…ÁÍ¥‰±”‘É…Ý•È‰•±½ÜÑ¡”…Ñ¥½¸…É¸(€€€€€ƒŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠV@€¨½ô(((€€€€€í‘•‰ÑMÕÁÁÉ•ÍÍ¥½¸€˜˜€……¥Ñ¥½¸€˜˜€ (€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÄÀõô(€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°(€€€€€€€€€€€‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°(€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄÈ°(€€€€€€€€€€€Á…‘‘¥¹œè¥Í5½‰¥±”€ü€Äà€è€ÈÈ°(€€€€€€€€€€€µ…É¥¹	½ÑÑ½´è€ÄÐ°(€€€€€€€€€õô(€€€€€€€€ø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€ÄÈ°…±¥¹%Ñ•µÌè€‰™±•àµÍÑ…ÉÐˆõôø(€€€€€€€€€€€€ñ±•ÉÑ¥É±”Í¥é”õìÈÁô½±½Èô‰Ù…È ´µ‰´µÉ•¤ˆÍÑå±”õíì™±•áM¡É¥¹¬è€À°µ…É¥¹Q½Àè€Èõô€¼ø(€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆ°™½¹Ñ…µ¥±äè€ˆ45½¹¼œ°µ½¹½ÍÁ…”ˆ°µ…É¥¹	½ÑÑ½´è€àõôø(€€€€€€€€€€€€€€€á•ÕÑ¥½¸‘•‰Ð(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ñÀÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°™½¹ÑM¥é”è¥Í5½‰¥±”€ü€ÄÔ€è€ÄØ°±¥¹•!•¥¡Ðè€Ä¸ÐÔ°µ…É¥¸è€ˆÀ€À€ÄÁÁàˆõôø(€€€€€€€€€€€€€€€íÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡‘•‰ÑMÕÁÁÉ•ÍÍ¥½¸¹‘•‰Ñ5•ÍÍ…”¥ô(€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€€í‘•‰ÑMÕÁÁÉ•ÍÍ¥½¸¹¥¹Ñ•ÉÙ•¹Ñ¥½¹!¥¹Ð€˜˜€ (€€€€€€€€€€€€€€€€ñÀÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°™½¹ÑM¥é”è€ÄÌ°±¥¹•!•¥¡Ðè€Ä¸ÔÔ°µ…É¥¸è€ˆÀ€À€ÄÑÁàˆõôø(€€€€€€€€€€€€€€€€€í‘•‰ÑMÕÁÁÉ•ÍÍ¥½¸¹¥¹Ñ•ÉÙ•¹Ñ¥½¹!¥¹Ñô(€€€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÙ½¥¡…¹‘±•­¹½Ý±•‘••‰Ð ¥ô(€€€€€€€€€€€€€€€‘¥Í…‰±•õí…Ñ¥½¹1½…‘¥¹ô(€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µÉ•µ‰¤ˆ°(€€€€€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µÉ•µ‘¥´¤ˆ°(€€€€€€€€€€€€€€€€€½±½Èè€‰Ù…È ´µ‰´µÉ•¤ˆ°(€€€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€à°(€€€€€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆåÁà€ÄÉÁàˆ°(€€€€€€€€€€€€€€€€€ÕÉÍ½Èè…Ñ¥½¹1½…‘¥¹œ€ü€‰‘•™…Õ±Ðˆ€è€‰Á½¥¹Ñ•Èˆ°(€€€€€€€€€€€€€€€€€™½¹ÑM¥é”è€ÄÌ°(€€€€€€€€€€€€€€€€€™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°(€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€í…Ñ¥½¹1½…‘¥¹œ€ü€‰•¹•É…Ñ¥¹œ¸¸¸ˆ€è€‰$Õ¹‘•ÉÍÑ…¹€´¥Ù”µ”Ñ½‘…äÌÑ…Í¬‰ô(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€¥ô((€€€€€ì¼¨I¥Í¬%¹Ñ•ÉÉÕÁÐƒŠPÍ…µ”É•…Í½¹¥¹œ…ÌÑ¡”¥¹Ñ•±±¥•¹”É¥‰•±½Üè„(€€€€€€€€€É¥Ñ¥…°±¥Ù”Í¥¹…°Í¡½Õ±‘¸Ð¼‘…É¬©ÕÍÐ‰•…ÕÍ”Ñ¡”Ñ…Í¬(€€€€€€€€€É•½µµ•¹‘…Ñ¥½¸¥ÌÑÕ­•‰•¡¥¹Ñ¡”•Ù•¹¥¹œÁ¥±°¸€¨½ô(€€€€€íÕ¥5½‘”€ôôô€‰ÁÉ¼ˆ€˜˜É¥Ñ¥…±M¥¹…°€ü€ñI¥Í­%¹Ñ•ÉÉÕÁÐÍ¥¹…°õíÉ¥Ñ¥…±M¥¹…±ô€¼ø€è¹Õ±±ô((€€€€€€ñ¹•Éå¡•¬(€€€€€€€¥¹™•ÉÉ•‘9½Ñ”õí…Ñ¥½¹…Ñ„ü¹¥¹Ñ•±±¥•¹”ü¹…Á…¥Ñäü¹¹½Ñ”€üü¹Õ±±ô(€€€€€€€½¹1¥¡Ñ•¸õì ¤€ôø¡…¹‘±•AÉ•Q…Í­I•Á±…”¡ìÉ•…Í½¸è€‰¹½}µ½Ñ¥Ù…Ñ¥½¸ˆ°µ½‘”è€‰Í¡É¥¹¬ˆô¥ô(€€€€€€¼ø(€€€€€ì¼¨1…ÍÐ¹¥¡ÐÌ½Ý¸™¥ÉÍÐµ½Ù”ÍÑ…åÌÙ¥Í¥‰±”¥¸‰½Ñ µ½‘•Ì¸€¨½ô(€€€€€íÕ¥5½‘”€ôôô€‰ÁÉ¼ˆ€ü¹Õ±°€è€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µ‘¥´ˆøñQ½µ½ÉÉ½Ý…ÉÉä€¼øð½‘¥Øùô(€€€€€ì¼¨1¥Ñ”€¡Ñ¡”‘•™…Õ±Ð¤­••ÁÌÑ¡”Ñ…Í¬™¥ÉÍÐèÑ¡”½Ñ¡•È‘…¥±ä…É‘ÌÍ¥Ð‰•¡¥¹½¹”ÅÕ¥•ÐÉ½Ü¸AÉ¼Í¡½ÝÌÑ¡•´¥¸Á±…”¸€¨½ô(€€€€€íÕ¥5½‘”€ôôô€‰ÁÉ¼ˆ€ü€ (€€€€€€€€ðø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µÍ•½¹‘…Éäˆøñ½µÁ…¹¥½¹	É¥•˜€¼øð½‘¥Øø(€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹	½ÑÑ½´è€ÄÈõôø(€€€€€€€€ñI…‘…É	…ÈÍ¥¹…°õíÉ…‘…È¹Í¥¹…±ôÍ•ÑÕÀõíÉ…‘…È¹Í•ÑÕÁô…ÕÑ¼õíÉ…‘…È¹…ÕÑ½ô½¹ÕÑ½¡…¹”õíÉ…‘…È¹É•±½…‘ôÑ½½­=Ù•Èõí	½½±•…¸¡…¥Ñ¥½¸ü¹É…‘…É%Ñ•µ%¥ô½¹U¹‘¼õíÕ¹‘½I…‘…ÉQ…­•½Ù•Éô½¹…¹ÑÑÑ•¹õí…¹ÑÑÑ•¹‘I…‘…Éô€¼ø(€€€€€€ð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µ‘¥´ˆøñQ½µ½ÉÉ½Ý…ÉÉä€¼øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µ‘¥´ˆøñ½±±½ÝUÁ…É€¼øñ]••­±å9½Ñ”€¼øð½‘¥Øø(€€€€€€€€ð¼ø(€€€€€€¤€è€ (€€€€€€€€ðø(€€€€€€€ì¼¨‘Õ”™½±±½ÜµÕÀ½ÈÉ•µ¥¹‘•ÈµÕÍÐ¹•Ù•ÈÍ¥Ð‰•¡¥¹„±½Í•É½Ü¸€¨½ô(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µ‘¥´ˆøñ½±±½ÝUÁ…É€¼øñ]••­±å9½Ñ”€¼øð½‘¥Øø(€€€€€€€€ñ½±±…‰•°ô‰±Í¼Ñ½‘…äˆÍÑ½É…•-•äô‰‰µ}Ñ½‘…å}…±Í½}½Á•¸ˆø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µÍ•½¹‘…Éäˆøñ½µÁ…¹¥½¹	É¥•˜€¼øð½‘¥Øø(€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹	½ÑÑ½´è€ÄÈõôø(€€€€€€€€ñI…‘…É	…ÈÍ¥¹…°õíÉ…‘…È¹Í¥¹…±ôÍ•ÑÕÀõíÉ…‘…È¹Í•ÑÕÁô…ÕÑ¼õíÉ…‘…È¹…ÕÑ½ô½¹ÕÑ½¡…¹”õíÉ…‘…È¹É•±½…‘ôÑ½½­=Ù•Èõí	½½±•…¸¡…¥Ñ¥½¸ü¹É…‘…É%Ñ•µ%¥ô½¹U¹‘¼õíÕ¹‘½I…‘…ÉQ…­•½Ù•Éô½¹…¹ÑÑÑ•¹õí…¹ÑÑÑ•¹‘I…‘…Éô€¼ø(€€€€€€ð½‘¥Øø(€€€€€€€€ð½½±ø(€€€€€€€€ð¼ø(€€€€€€¥ô((€€€€€ì¼¨ƒŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠV@(€€€€€€€€€Q%=8IƒŠP™¥ÉÍÐÉ•…°½¹Ñ•¹Ð‰±½¬€¡Ñ…Í¬µ™¥ÉÍÐ±…å½ÕÐ¤(€€€€€€€€€½±±…ÁÍ•‰•¡¥¹Ñ¡”€‰M¡½ÜÑ…Í¬ˆÁ¥±°…‰½Ù”‘ÕÉ¥¹œ•Ù•¹¥¹œµ½‘”°(€€€€€€€€€Õ¹Ñ¥°Ñ¡”™½Õ¹‘•È•áÁ±¥¥Ñ±ä•áÁ…¹‘Ì¥Ð¸(€€€€€ƒŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠVCŠV@€¨½ô(€€€€€ì …¥ÍÙ•¹¥¹MÕÉ™…•ñðÑ…Í­A¥±±áÁ…¹‘•¤€˜˜€ ðø(€€€€€ì……Ñ¥½¹…Ñ„€ü€ (€€€€€€€€¼¨1½…‘¥¹œÍ­•±•Ñ½¸ƒŠPÍ¡½Ý¸Ý¡¥±”$™•Ñ ¥Ì¥¸™±¥¡Ð€¨¼(€€€€€€€€¼¨9•Ù•ÈÍ¡½ÝÌ•¹•É¥ŒÑ…Í¬ìÝ…¥ÑÌ™½ÈÑ¡”É•…°Á•ÉÍ½¹…±¥Í•Ñ…Í¬€¨¼(€€€€€€€€ñ‘¥Ø(€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€Á…‘‘¥¹œè€Ä°(€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄÈ°(€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰½É‘•ÈÈ¤ˆ°(€€€€€€€€€€€µ…É¥¹	½ÑÑ½´è€ÄÐ°(€€€€€€€€€õô(€€€€€€€€ø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÄ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÈÁÁàˆ€è€ˆÈáÁà€ÌÁÁà€ÈÑÁàˆõôø(€€€€€€€€€€€ì¼¨5•Ñ„É½ÜÍ­•±•Ñ½¸€¨½ô(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€Ø°µ…É¥¹	½ÑÑ½´è€ÈÀ°Ñ•áÑ±¥¸è€‰•¹Ñ•Èˆõôø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…¹¥µ…Ñ”µÍÁ¥¸ˆÍÑå±”õíìÝ¥‘Ñ è€ÈÈ°¡•¥¡Ðè€ÈÈ°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°‰½É‘•Èè€ˆÉÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•ÈÈ¤ˆ°‰½É‘•ÉQ½Á½±½Èè€‰Ù…È ´µ‰´µ…•¹Ð¤ˆõô€¼ø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆõôùíÍÑÉ•…µ1…‰•°€üü€‰AÉ•Á…É¥¹œå½ÕÈ‘•¥Í¥½¸‰É¥•˜¸¸¸‰ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹Ñ…µ¥±äè€‰Ù…È ´µ™½¹Ðµµ½¹¼°µ½¹½ÍÁ…”¤ˆ°™½¹ÑM¥é”è€ä°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Å•´ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆõôø(€€€€€€€€€€€€€€€±¥¹¥¹œÕÉÉ•¹Ð¡åÁ½Ñ¡•Í¥Ì€™…µÀìÉ¥Í¬µ½‘•±Ì(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€ì¼¨AÉ¥µ…Éä…Ñ¥½¸Í­•±•Ñ½¸€¨½ô(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÄÙÁàˆ€è€ˆÄáÁàˆ°µ…É¥¹	½ÑÑ½´è€ÄÐõôø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€ÄÀ°…±¥¹%Ñ•µÌè€‰™±•àµÍÑ…ÉÐˆõôø(€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíìÝ¥‘Ñ è€ÈØ°¡•¥¡Ðè€ÈØ°‰½É‘•ÉI…‘¥ÕÌè€Ø°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°™±•áM¡É¥¹¬è€À°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”ˆõô€¼ø(€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™±•àè€Äõôø(€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€ÄÀ°Ý¥‘Ñ è€ÄÀÀ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€ÄÈ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”ˆõô€¼ø(€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€Èà°Ý¥‘Ñ è€ˆäÀ”ˆ°‰½É‘•ÉI…‘¥ÕÌè€Ø°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€à°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”€À¸ÀÕÌˆõô€¼ø(€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€Èà°Ý¥‘Ñ è€ˆÜÀ”ˆ°‰½É‘•ÉI…‘¥ÕÌè€Ø°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€ÄÀ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”€À¸ÅÌˆõô€¼ø(€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€ÄÐ°Ý¥‘Ñ è€ˆàÀ”ˆ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”€À¸ÄÕÌˆõô€¼ø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€ì¼¨I…Ñ¥½¹…±”Í­•±•Ñ½¸€¨½ô(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°Á…‘‘¥¹œè€ˆÄÑÁà€ÄÙÁàˆ°µ…É¥¹	½ÑÑ½´è€Äàõôø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€ÄÀ°Ý¥‘Ñ è€ÄÈÀ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°µ…É¥¹	½ÑÑ½´è€ÄÀ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”ˆõô€¼ø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€ÄÐ°Ý¥‘Ñ è€ˆäÔ”ˆ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°µ…É¥¹	½ÑÑ½´è€Ø°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”€À¸ÀÕÌˆõô€¼ø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€ÄÐ°Ý¥‘Ñ è€ˆàÀ”ˆ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”€À¸ÅÌˆõô€¼ø(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€ì¼¨É…™ÐÍ­•±•Ñ½¸€¨½ô(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°Á…‘‘¥¹œè€ˆÄÑÁà€ÄÙÁàˆõôø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€ÄÀ°Ý¥‘Ñ è€ÄÄÀ°‰½É‘•ÉI…‘¥ÕÌè€Ð°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°µ…É¥¹	½ÑÑ½´è€ÄÈ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”ˆõô€¼ø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì¡•¥¡Ðè€àÀ°‰½É‘•ÉI…‘¥ÕÌè€ä°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÑÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”€À¸ÅÌˆõô€¼ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€¤€è…¥•Ñ¡…¥±•€˜˜€……Ñ¥½¹1½…‘¥¹œ€ü€ (€€€€€€€€ñ%¹Ñ•±±¥•¹•U¹…Ù…¥±…‰±•…É(€€€€€€€€€±…ÍÑMÕ•ÍÍÐõíÕÍ•É%€ü€  ¤€ôøì(€€€€€€€€€€€½¹ÍÐÑÌ€ôÍÑ½É…”¹•Ð¡‰µ}Ñ½‘…å}…Ñ¥½¹}…¡•}ÑÍ|‘íÕÍ•É%‘õ€¤ì(€€€€€€€€€€€É•ÑÕÉ¸ÑÌ€ü9Õµ‰•È¡ÑÌ¤€è¹Õ±°ì(€€€€€€€€€ô¤ ¤€è¹Õ±±ô(€€€€€€€€€¡…Í1…ÍÑI•½µµ•¹‘…Ñ¥½¸õì„…±…ÍÑ½½‘Ñ¥½¹I•˜¹ÕÉÉ•¹Ñô(€€€€€€€€€™…¥±ÕÉ”õí…¥…¥±ÕÉ•ô(€€€€€€€€€½¹I•ÑÉäõì ¤€ôøìÍ•Ñ¥•Ñ¡…¥±•¡™…±Í”¤ìÍ•Ñ¥…¥±ÕÉ”¡¹Õ±°¤ìÍ•Ñ½É•Ñ¥½¹I•™É•Í ¡Ø€ôøØ€¬€Ä¤ìõô(€€€€€€€€€½¹UÍ•1…ÍÑI•½µµ•¹‘…Ñ¥½¸õì ¤€ôøì(€€€€€€€€€€€¥˜€¡±…ÍÑ½½‘Ñ¥½¹I•˜¹ÕÉÉ•¹Ð¤Í•Ñ¥Ñ¥½¸¡±…ÍÑ½½‘Ñ¥½¹I•˜¹ÕÉÉ•¹Ð¤ì(€€€€€€€€€€€Í•Ñ¥•Ñ¡…¥±•¡™…±Í”¤ì(€€€€€€€€€õô(€€€€€€€€€½¹½¹Ñ¥¹Õ•	…Í•±¥¹”õì ¤€ôøÍ•Ñ¥•Ñ¡…¥±•¡™…±Í”¥ô(€€€€€€€€€ÁÉ½©•Ñ%õíÁÉ½©•Ðü¹¥‘ô(€€€€€€€€¼ø(€€€€€€¤€è€ (€€€€€€€€ðø(€€€€€€€íÅÕ¥­½¹•=Á•¸€˜˜…Ñ¥½¹…Ñ„€˜˜€ (€€€€€€€€€€ñ‘¥ØÉ½±”ô‰É½ÕÀˆ…É¥„µ±…‰•°ô‰½¹™¥É´Ñ½‘…äÌÑ…Í¬¥Ì‘½¹”ˆÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€ÄÈ°Á…‘‘¥¹œè€ˆÄÉÁà€ÄÑÁàˆ°µ…É¥¹	½ÑÑ½´è€ÄÈõôø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°™½¹Ñ]•¥¡Ðè€ØÀÀ°µ…É¥¹	½ÑÑ½´è€Ðõôù¥å½Ô™¥¹¥Í Ñ½‘…ä™…Á½ÌíÌÑ…Í¬üð½‘¥Øø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°±¥¹•!•¥¡Ðè€Ä¸ÐÔ°µ…É¥¹	½ÑÑ½´è€ÄÀ°½Ù•É™±½Ý]É…Àè€‰…¹åÝ¡•É”ˆõôùí…Ñ¥½¹…Ñ„¹…Ñ¥½¹ôð½‘¥Øø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€àõôø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹ô(€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€€€€€¥˜€¡ÍÕ‰µ¥ÑÑ¥¹œ¤É•ÑÕÉ¸ì(€€€€€€€€€€€€€€€€€Í•ÑMÕ‰µ¥ÑÑ¥¹œ¡ÑÉÕ”¤ì(€€€€€€€€€€€€€€€€€ÍÑ½É…”¹Í•Ñ)M=8 ‰‰µ}Ñ½‘…å}…Ñ¥½¸ˆ°ì…Ñ¥½¸è…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€üü€ˆˆ°½ÕÑ½µ”è€‰½µÁ±•Ñ•ˆ°¹½Ñ”è€ˆˆ°½¹™¥‘•¹”è€Ì°É•½µµ•¹‘…Ñ¥½¹}¥è…Ñ¥½¹…Ñ„ü¹¥¹Ñ•±±¥•¹”ü¹É•½µµ•¹‘…Ñ¥½¹}¥€üü¹Õ±°°‘…Ñ”è±½…±…å-•ä ¤ô¤ì(€€€€€€€€€€€€€€€€€Ù½¥¡…¹‘±•¡•­%¸ ‰½µÁ±•Ñ•ˆ¤¹…Ñ   ¤€ôøìÍ•ÑMÕ‰µ¥ÑÑ¥¹œ¡™…±Í”¤ìô¤ì(€€€€€€€€€€€€€€€€€É½ÕÑ•È¹ÁÕÍ  ˆ½É•™±•Ðý½ÕÑ½µ”õ½µÁ±•Ñ•ˆ¤ì(€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€ÍÑå±”õíìµ¥¹!•¥¡Ðè€ÐÀ°Á…‘‘¥¹œè€ˆÀ€ÄÑÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€à°‰½É‘•Èè€‰¹½¹”ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°½±½Èè€ˆŒÄÔÄÄÀäˆ°™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆõô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€íÍÕ‰µ¥ÑÑ¥¹œ€ü€‰I•½É‘¥¹œ¸¸¸ˆ€è€‰e•Ì°‘½¹”‰ô(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôøÍ•ÑEÕ¥­½¹•=Á•¸¡™…±Í”¥ôÍÑå±”õíìµ¥¹!•¥¡Ðè€ÐÀ°Á…‘‘¥¹œè€ˆÀ€ÄÑÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€à°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•ÈÈ¤ˆ°‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°™½¹ÑM¥é”è€ÄÌ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆõôù9½Ðå•Ðð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€¥ô(€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€É•˜õí…Ñ¥½¹…É‘I•™ô(€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÄÀõô(€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€ÑÉ…¹Í¥Ñ¥½¸õíì‘•±…äè€À¸Ààõô(€€€€€€€ÍÑå±”õíì(€€€€€€€€€µ…É¥¹	½ÑÑ½´è€ÄÐ°(€€€€€€€€€õô(€€€€€€ø(€€€€€€€€ñ‘¥ØÍÑå±”õíìÁ…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÑÁà€ÉÁà€Àˆ€è€ˆáÁà€À€Àˆõôø((€€€€€€€€€ì¼¨5•Ñ„É½ÜƒŠPÍ¥µÁ±¥™¥•€¨½ô(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€à°µ…É¥¹	½ÑÑ½´è€ÄØõôø(€€€€€€€€€€€íÁÉ½©•Ðü¹ÍÑ…ÉÑÕÁ}ÍÑ…”€˜˜€ (€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰‰´µ‰…‘”‰´µ‰…‘”µ…•¹ÐˆÍÑå±”õíìÑ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸ÀÙ•´ˆõôø(€€€€€€€€€€€€€€€íÁÉ½©•Ð¹ÍÑ…ÉÑÕÁ}ÍÑ…•ôÍÑ…”(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€¥ô(€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹¥Í$€˜˜€……Ñ¥½¹1½…‘¥¹œ€˜˜€ (€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰‰´µ‰…‘”‰´µ‰…‘”µ¹•ÕÑÉ…°ˆø(€€€€€€€€€€€€€€€½¹Ñ•áÐ…±¥‰É…Ñ•(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€¥ô(€€€€€€€€€€€í…Ñ¥½¹1½…‘¥¹œ€˜˜€ (€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆõôø(€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì‘¥ÍÁ±…äè€‰¥¹±¥¹”µ‰±½¬ˆ°Ý¥‘Ñ è€Ø°¡•¥¡Ðè€Ø°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°½Á…¥Ñäè€À¸Ø°…¹¥µ…Ñ¥½¸è€‰‰´µÁÕ±Í”€Ä¸ÉÌ•…Í”µ¥¸µ½ÕÐ¥¹™¥¹¥Ñ”ˆõô€¼ø(€€€€€€€€€€€€€€€íÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡ÍÑÉ•…µ1…‰•°€üü€‰…±¥‰É…Ñ¥¹œ¸¸¸ˆ¥ô(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€¥ô(€€€€€€€€€€€ì……Ñ¥½¹…Ñ„¹¥Í$€˜˜€……Ñ¥½¹1½…‘¥¹œ€˜˜€ (€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°™½¹ÑMÑå±”è€‰¥Ñ…±¥Œˆõôø(€€€€€€€€€€€€€€€	…Í•±¥¹”½‰©•Ñ¥Ù”(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€‰Ù…È ´µÍÁ…”´Ä¤ˆ°µ…É¥¹1•™Ðè€‰…ÕÑ¼ˆõôø(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€˜˜€ (€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰‰´µ‰…‘”ˆÍÑå±”õíì(€€€€€€€€€€€€€€€€€™½¹Ñ]•¥¡Ðè€ÜÀÀ°(€€€€€€€€€€€€€€€€€Ñ•áÑQÉ…¹Í™½É´è€‰…Á¥Ñ…±¥é”ˆ°(€€€€€€€€€€€€€€€€€½±½Èè…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€ôôô€‰‘••Àˆ€ü€‰Ù…È ´µ‰´µÉ•¤ˆ€è…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€ôôô€‰±¥¡Ðˆ€ü€‰Ù…È ´µ‰´µÉ••¸¤ˆ€è€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°(€€€€€€€€€€€€€€€€€‰…­É½Õ¹è…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€ôôô€‰‘••Àˆ€ü€‰É‰„ ÈÈÐ°àÔ°àÔ°À¸ÄÈ¤ˆ€è…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€ôôô€‰±¥¡Ðˆ€ü€‰É‰„ ÜÐ°ÄàÐ°ÄÜØ°À¸ÄÈ¤ˆ€è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°(€€€€€€€€€€€€€€€€€‰½É‘•Èè€ÅÁàÍ½±¥€‘í…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€ôôô€‰‘••Àˆ€ü€‰É‰„ ÈÈÐ°àÔ°àÔ°À¸Ì¤ˆ€è…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñä€ôôô€‰±¥¡Ðˆ€ü€‰É‰„ ÜÐ°ÄàÐ°ÄÜØ°À¸Ì¤ˆ€è€‰Ù…È ´µ‰´µ‰½É‘•È¤‰õ€°(€€€€€€€€€€€€€€€õôø(€€€€€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹‘¥™™¥Õ±Ñåô(€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€¥ô‰Ñ½‘…äµ…Ñ¥½¸ˆ(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€ÍÉ½±±5…É¥¹Q½Àè€ÄØ°(€€€€€€€€€€€€€µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ð¤ˆ°(€€€€€€€€€€€€€‘¥ÍÁ±…äè…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹”€˜˜…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”€˜˜€…¥Í5½‰¥±”€ü€‰É¥ˆ€è€‰‰±½¬ˆ°(€€€€€€€€€€€€€É¥‘Q•µÁ±…Ñ•½±Õµ¹Ìè…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹”€˜˜…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”€˜˜€…¥Í5½‰¥±”€ü€ˆÅ™È€ÈØÁÁàˆ€èÕ¹‘•™¥¹•°(€€€€€€€€€€€€€…Àè…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹”€˜˜…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”€˜˜€…¥Í5½‰¥±”€ü€ÄÐ€èÕ¹‘•™¥¹•°(€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€‰ÍÑ…ÉÐˆ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€€ñQ½‘…å½µµ…¹‘•¹Ñ•È(€€€€€€€€€€€€€…Ñ¥½¸õí±¥¹­¥™å¡…¹¹•±Ì¡Í…¹¥Ñ¥é•=ÕÑÁÕÐ¡…Ñ¥½¹…Ñ„¹…Ñ¥½¸¤¥ô(€€€€€€€€€€€€€±½Ý½¹™¥‘•¹”õí…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹•ô(€€€€€€€€€€€€€É…Ñ¥½¹…±”õíÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡…Ñ¥½¹…Ñ„¹É•™±•á¥½¸ü¹É…Ñ¥½¹…±”€üü…Ñ¥½¹…Ñ„¹Ý¡ä¥ô(€€€€€€€€€€€€€Ý¡å5½É”õíÝ¡åQ¡¥Í5…É­‘½Ý¸¡‰Õ¥±‘]¡åQ¡¥Ì¡ì¥Í$è…Ñ¥½¹…Ñ„¹¥Í$°¥Í1½Ý½¹™¥‘•¹”è…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹”°É•™±•á¥½¸è…Ñ¥½¹…Ñ„¹É•™±•á¥½¸°¥¹Ñ•±±¥•¹”è…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”ô¤¥ô(€€€€€€€€€€€€€•áÁ•Ñ•‘Ù¥‘•¹”õí…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”ü¹‘•¥Í¥½¸ü¹Ñ½Á}…¹‘¥‘…Ñ”ü¹•áÁ•Ñ•‘}•Ù¥‘•¹•ô(€€€€€€€€€€€€€­¥­•Èõí…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹1…‰•±ô(€€€€€€€€€€€€€…•¹Ðõíµ¥ÍÍ¥½¹•¹Ð¡…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹-¥¹¥ô(€€€€€€€€€€€€€É•…Í½¹Ìõí…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹I•…Í½¹Íô(€€€€€€€€€€€€€•á•ÕÑ•1…‰•°õíÁÉ•Á-¥¹€ü=Á•¸€‘íAIA}5QmÁÉ•Á-¥¹‘t¹±…‰•°¹Ñ½1½Ý•É…Í” ¥õ€€è€‰=Á•¸ÍÉ¥ÁÐ‰ô(€€€€€€€€€€€€€½¹á•ÕÑ”õì ¤€ôø•á•ÕÑ¥½¹MÉ¥ÁÑI•˜¹ÕÉÉ•¹Ðü¹ÍÉ½±±%¹Ñ½Y¥•Ü¡ì‰•¡…Ù¥½Èè€‰Íµ½½Ñ ˆ°‰±½¬è€‰ÍÑ…ÉÐˆô¥ô(€€€€€€€€€€€€€…Ñ¥½¹Q¥Ñ±”õí…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€üÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡…Ñ¥½¹…Ñ„¹…Ñ¥½¸¤€è¹Õ±±ô(€€€€€€€€€€€€€Ñ¥µ•Q•áÐõí…Ñ¥½¹…Ñ„ü¹Ñ¥µ”€üü¹Õ±±ô(€€€€€€€€€€€€€‘½¹”õí‘½¹•ô(€€€€€€€€€€€€€ÍÑÉ•…¬õíÍÑÉ•…­ô(€€€€€€€€€€€€€™¥ÉÍÑMÑ•Àõí…Ñ¥½¹…Ñ„ü¹™¥ÉÍÑMÑ•À€üü¹Õ±±ô(€€€€€€€€€€€€€½¹¹…”õíÍ•ÑQ¥µ•ÉIÕ¹¹¥¹ô(€€€€€€€€€€€€¼ø(€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹”€˜˜€ (€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹Q½Àè¥Í5½‰¥±”€ü€ÄÈ€è€Àõôø(€€€€€€€€€€€€€€€€ñ½¹Ñ•áÑ±¥¹µ•¹Ñ…É¥¹Ñ•±±¥•¹”õí…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹•ô€¼ø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¥ô(€€€€€€€€€€ð½‘¥Øø((((€€€€€€€€€ì…‘½¹”€˜˜€……Ñ¥½¹1½…‘¥¹œ€˜˜€ (€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µ‘¥´ˆø(€€€€€€€€€€€€ñI•Á±…•]¥Ñ¡I•…Í½¸(€€€€€€€€€€€€€Ñ…Í­Q•áÐõí…Ñ¥½¹…Ñ„¹…Ñ¥½¸€üü€ˆ‰ô(€€€€€€€€€€€€€ÁÉ½©•Ñ%õíÁÉ½©•Ðü¹¥€üü¹Õ±±ô(€€€€€€€€€€€€€‰ÕÍäõíÉ•Á±…¥¹Q…Í­ô(€€€€€€€€€€€€€½¹I•Á±…”õí¡…¹‘±•AÉ•Q…Í­I•Á±…•ô(€€€€€€€€€€€€¼ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¥ô((€€€€€€€€€ì¼¨MÉ¥ÁÐ¥¹ÍÑÉÕÑ¥½¸€¡½¹±äÝ¡•¸Ñ¡•É”¥Ì¹¼ÁÉ•Á…É•Ý½É¬Ñ¼Í¡½Ü¥¹ÍÑ•…¤€¨½ô(€€€€€€€€€ì…ÁÉ•Á-¥¹€˜˜€ñ‘¥ØÍÑå±”õíì(€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ì¤ˆ°(€€€€€€€€€€€Á…‘‘¥¹œè€‰Ù…È ´µÍÁ…”´È¤Ù…È ´µÍÁ…”´Ì¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµ±œ¤ˆ°(€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°(€€€€€€€€€õôø(€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµÍ´¤ˆ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°µ…É¥¸è€ˆÀ€À€ÅÁàˆõôø(€€€€€€€€€€€€€€€í¥Í=ÕÑÉ•…¡Ñ¥½¸€ü€‰AÉ•Á…É”Ñ¡”µ•ÍÍ…”ˆ€è€‰AÉ•Á…É”Ñ¡”ÍÉ¥ÁÐ‰ô(€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¸è€Àõôø(€€€€€€€€€€€€€€€í¥Í=ÕÑÉ•…¡Ñ¥½¸(€€€€€€€€€€€€€€€€€€ü€‰AÉ½©•Ð½¹Ñ•áÐ¥ÌÁÉ”µ™¥±±•¸‘©ÕÍÐ½¹±äÝ¡…Ð¥µÁÉ½Ù•Ì±…É¥Ñä¸ˆ(€€€€€€€€€€€€€€€€€€è€‰UÍ”Ñ¡”ÍÉ¥ÁÐ…ÌÝÉ¥ÑÑ•¸Õ¹±•ÍÌÑ¡”½¹Ñ•áÐ¥ÌÝÉ½¹œ¸‰ô(€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øùô((€€€€€€€€€ì¼¨MÕÁÁ±•µ•¹Ñ…Éä½¹Ñ•áÐƒŠPÑ¡”É…Ñ¥½¹…±”Ñ•áÐ¥ÑÍ•±˜¹½Ü±¥Ù•Ì(€€€€€€€€€€€€€½¹±ä¥¸•¥Í¥½¹	É¥•˜Ì€‰]¡ä¹½ÜˆÍ•Ñ¥½¸…‰½Ù”€¡±¥¹”øÈÔÌÌ¤ì(€€€€€€€€€€€€€Ñ¡¥ÌÕÍ•Ñ¼É•Á•…ÐÑ¡”¥‘•¹Ñ¥…°Á…É…É…Á „Í•½¹Ñ¥µ”(€€€€€€€€€€€€€Õ¹‘•È€‰MÑÉ…Ñ•¥ŒÉ…Ñ¥½¹…±”ˆÉ¥¡Ð‰•±½Ü¥Ð¸-•ÁÐ¡•É”èÑ¡”(€€€€€€€€€€€€€•¹Õ¥¹•±ä…‘‘¥Ñ¥½¹…°‰¥ÑÌÑ¡…Ð…É•¸Ð¥¸•¥Í¥½¹	É¥•˜¸€¨½ô(€€€€€€€€€ì¡…Ñ¥½¹…Ñ„¹É•™±•á¥½¸ü¹±…ÍÑI•™±•Ñ¥½¹UÍ•ñð…Ñ¥½¹…Ñ„¹É•™±•á¥½¸ü¹Ý…Í!…É‘…±±‰…¬ñðÕ¥5½‘”€ôôô€‰ÁÉ¼ˆ¤€˜˜€ (€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµá°¤ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€‰Ù…È ´µÍÁ…”´Ð¤ˆ€è€‰Ù…È ´µÍÁ…”´Ð¤Ù…È ´µÍÁ…”´Ð¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ô¤ˆõôø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÐÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´È¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€Ô°™½¹Ñ…µ¥±äè€ˆ45½¹¼œ°µ½¹½ÍÁ…”ˆõôø(€€€€€€€€€€€€€€€€ñ	É…¥¸Í¥é”õìÄÁô½±½Èô‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ€¼ø½¹Ñ•áÐ(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹É•™±•á¥½¸ü¹±…ÍÑI•™±•Ñ¥½¹UÍ•€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´È¤ˆõôø(€€€€€€€€€€€€€€€€€e½ÕÈå•ÍÑ•É‘…äÌÉ•™±•Ñ¥½¸Í¡…Á•Ñ¡¥ÌÉ•½µµ•¹‘…Ñ¥½¸¸(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹É•™±•á¥½¸ü¹Ý…Í!…É‘…±±‰…¬€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´È¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆõôø(€€€€€€€€€€€€€€€€€€ñ±•ÉÑ¥É±”Í¥é”õìÄÅô½±½Èô‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ€¼ø(€€€€€€€€€€€€€€€€€Q½‘…äÌ$‘É…™Ð‘¥‘¸Ðµ••Ð½ÕÈ½¹É•Ñ•¹•ÍÌ‰…È°Í¼Ñ¡¥Ì¥Ì„ÁÉ½Ù•¸™…±±‰…¬Ñ…Í¬¥¹ÍÑ•…ƒŠPÍÑ¥±°É•…°°©ÕÍÐ¹½Ð™É•Í¡±ä½µÁ½Í•¸(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€íÕ¥5½‘”€ôôô€‰ÁÉ¼ˆ€ü€  ¤€ôøì(€€€€€€€€€€€€€€€½¹ÍÐ¥Ñ•µÌ€ôl(€€€€€€€€€€€€€€€€€€¸¸¸¡…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”ü¹‘•¥Í¥½¸ü¹Ñ½Á}…¹‘¥‘…Ñ”ü¹•áÁ•Ñ•‘}•Ù¥‘•¹”(€€€€€€€€€€€€€€€€€€€€ümì±…‰•°è€‰áÁ•Ñ••Ù¥‘•¹”ˆ°Ù…±Õ”è…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”¹‘•¥Í¥½¸¹Ñ½Á}…¹‘¥‘…Ñ”¹•áÁ•Ñ•‘}•Ù¥‘•¹”õt(€€€€€€€€€€€€€€€€€€€€èmt¤°(€€€€€€€€€€€€€€€€€€¸¸¸¡…Ñ¥½¹…Ñ„¹¥Í1½Ý½¹™¥‘•¹”(€€€€€€€€€€€€€€€€€€€€ümì±…‰•°è€‰U¹•ÉÑ…¥¹Ñäˆ°Ù…±Õ”è€‰Q¡¥ÌÉ•½µµ•¹‘…Ñ¥½¸¥Ì¥¹Ñ•¹‘•Ñ¼…Ñ¡•È„½¹É•Ñ”Í¥¹…°‰•™½É”ÍÑÉ½¹•ÈÕ¥‘…¹”¥Ì¥Ù•¸¸ˆõt(€€€€€€€€€€€€€€€€€€€€èmt¤°(€€€€€€€€€€€€€€€tì(€€€€€€€€€€€€€€€¥˜€ …¥Ñ•µÌ¹±•¹Ñ ¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹Q½Àè€‰Ù…È ´µÍÁ…”´È¤ˆ°Á…‘‘¥¹œè€ˆÄÁÁà€ÄÉÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµµ¤ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ¥¹Ñ•°µ‘¥´¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ¥¹Ñ•°µ‰¤ˆ°‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…Àè€Øõôø(€€€€€€€€€€€€€€€€€€€í¥Ñ•µÌ¹µ…À ¡¥Ñ•´°¤¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø­•äõí¥ôÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€à°™½¹ÑM¥é”è€ÄÈ°±¥¹•!•¥¡Ðè€Ä¸Ôõôø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™±•áM¡É¥¹¬è€À°µ¥¹]¥‘Ñ è€äÀõôùí¥Ñ•´¹±…‰•±ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆõôùí¥Ñ•´¹Ù…±Õ•ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€ô¤ ¤€è¹Õ±±ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¥ô((€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½½µÍ•½¹‘…ÉäˆøñI…‘…ÉQ½‘…äÁÉ½©•Ñ%õíÁÉ½©•Ðü¹¥€üü¹Õ±±ô€¼øð½‘¥Øø(€€€€€€€€€€ñ‘¥ØÉ•˜õí¡¥‘•1•…ä€ü•á•ÕÑ¥½¹MÉ¥ÁÑI•˜€èÕ¹‘•™¥¹•‘ôÍÑå±”õíìÍÉ½±±5…É¥¹Q½Àè€ÄØõôø(€€€€€€€€€í…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€˜˜…¥Ñ¥½¸ü¹É…‘…É%Ñ•µ%€˜˜É…‘…È¹Í¥¹…°¹¥Ñ•´ü¹¥€ôôô…¥Ñ¥½¸¹É…‘…É%Ñ•µ%€˜˜€ (€€€€€€€€€€€€ñI…‘…É%Ñ•µ…É¥Ñ•´õíÉ…‘…È¹Í¥¹…°¹¥Ñ•µô½¹¡…¹”õíÉ…‘…È¹É•±½…‘ô€¼ø(€€€€€€€€€€¥ô(€€€€€€€€€í…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€˜˜€……¥Ñ¥½¸ü¹É…‘…É%Ñ•µ%€˜˜€ (€€€€€€€€€€€€ñAÉ•Á…É•‘]½É¬(€€€€€€€€€€€€€Ñ…Í¬õí…Ñ¥½¹…Ñ„¹…Ñ¥½¹ô(€€€€€€€€€€€€€µ¥ÍÍ¥½¹-¥¹õí…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹-¥¹€üü¹Õ±±ô(€€€€€€€€€€€€€™¥ÉÍÑMÑ•Àõí…Ñ¥½¹…Ñ„¹™¥ÉÍÑMÑ•Áô(€€€€€€€€€€€€€ÁÉ½©•Ñ%õíÁÉ½©•Ðü¹¥€üü¹Õ±±ô(€€€€€€€€€€€€€½¹UÍ•É…™Ðõì¡Ð¤€ôøÍ•ÑÉ…™Ñ5•ÍÍ…”¡Ð¥ô(€€€€€€€€€€€€¼ø(€€€€€€€€€€¥ô(€€€€€€€€€í…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€˜˜…Ñ¥½¹…Ñ„¹‘½¹•]¡•¸€˜˜€ (€€€€€€€€€€€€ñÀÍÑå±”õíìµ…É¥¸è€ˆáÁà€ÉÁà€Àˆ°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµÍ´¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°±¥¹•!•¥¡Ðè€Ä¸Ôõôø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹Ñ]•¥¡Ðè€ÜÀÀõôù½¹”Ý¡•¸èð½ÍÁ…¸øíÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡…Ñ¥½¹…Ñ„¹‘½¹•]¡•¸¥ô(€€€€€€€€€€€€ð½Àø(€€€€€€€€€€¥ô(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€ì¼¨ƒŠRŠR 5•ÍÍ…”Ñ•µÁ±…Ñ”ƒŠPÁÉ”µ™¥±±•Ý¥Ñ É•…°ÁÉ½©•ÐÙ…±Õ•ÌƒŠRŠR €¨½ô(€€€€€€€€€í¡¥‘•1•…ä€ü¹Õ±°€è¹½É…™Ð€ü€ (€€€€€€€€€€€€ñ‘¥ØÉ•˜õí•á•ÕÑ¥½¹MÉ¥ÁÑI•™ôÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµá°¤ˆ°Á…‘‘¥¹œè€‰Ù…È ´µÍÁ…”´Ð¤ˆ°‘¥ÍÁ±…äè€‰É¥ˆ°…Àè€‰Ù…È ´µÍÁ…”´Ì¤ˆõôø(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹1…‰•°€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆõôø(€€€€€€€€€€€€€€€€€Q½‘…ä¥Ì„í…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹1…‰•°¹Ñ½1½Ý•É…Í” ¥ô‘…åí…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹I•…Í½¹Ìü¹lÁt€ü€è€‘í…Ñ¥½¹…Ñ„¹µ¥ÍÍ¥½¹I•…Í½¹ÍlÁuõ€€è€ˆ‰ô(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹™¥ÉÍÑMÑ•À€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€ÈõôùMÑ…ÉÐÝ¥Ñ ð½‘¥Øø(€€€€€€€€€€€€€€€€€€ñÀÍÑå±”õíìµ…É¥¸è€À°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµ‰…Í”¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°±¥¹•!•¥¡Ðè€‰Ù…È ´µ±•…‘¥¹œµÉ•±…á•¤ˆõôùíÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡…Ñ¥½¹…Ñ„¹™¥ÉÍÑMÑ•À¥ôð½Àø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹‘½¹•]¡•¸€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€Èõôù½¹”Ý¡•¸ð½‘¥Øø(€€€€€€€€€€€€€€€€€€ñÀÍÑå±”õíìµ…É¥¸è€À°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµ‰…Í”¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°±¥¹•!•¥¡Ðè€‰Ù…È ´µ±•…‘¥¹œµÉ•±…á•¤ˆõôùíÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡…Ñ¥½¹…Ñ„¹‘½¹•]¡•¸¥ôð½Àø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¤€è€ (€€€€€€€€€€ñ‘¥ØÉ•˜õí•á•ÕÑ¥½¹MÉ¥ÁÑI•™ôÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµá°¤ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€‰Ù…È ´µÍÁ…”´Ð¤ˆ€è€‰Ù…È ´µÍÁ…”´Ð¤Ù…È ´µÍÁ…”´Ð¤ˆõôø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè¥Í5½‰¥±”€ü€‰ÍÑÉ•Ñ ˆ€è€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰ÍÁ…”µ‰•ÑÝ••¸ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´È¤ˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆ°™±•á¥É•Ñ¥½¸è¥Í5½‰¥±”€ü€‰½±Õµ¸ˆ€è€‰É½Üˆõôø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆõôø(€€€€€€€€€€€€€€€í¥Í=ÕÑÉ•…¡Ñ¥½¸€ü€‰á•ÕÑ¥½¸‘É…™Ðˆ€è€‰á•ÕÑ¥½¸ÍÉ¥ÁÐ‰ô(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆ°Ý¥‘Ñ è¥Í5½‰¥±”€ü€ˆÄÀÀ”ˆ€è€‰…ÕÑ¼ˆõôø(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÙ½¥¡…¹‘±•M¡…É•5•ÍÍ…” ¥ô(€€€€€€€€€€€€€€€€€ÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°…Àè€Ô°Á…‘‘¥¹œè€ˆÑÁà€ÄÁÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµ±œ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°™±•àè¥Í5½‰¥±”€ü€Ä€è€ˆÀ€À…ÕÑ¼ˆõô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€íÍ¡…É•€ü€ðøñ¡•¬Í¥é”õìÄÅô½±½Èô‰Ù…È ´µ‰´µÉ••¸¤ˆ€¼øM¡…É•ð¼ø€è€ðûŠ\M¡…É”ð¼ùô(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí¡…¹‘±•½Áåô(€€€€€€€€€€€€€€€€€ÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°…Àè€Ô°Á…‘‘¥¹œè€ˆÑÁà€ÄÁÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµ±œ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°™±•àè¥Í5½‰¥±”€ü€Ä€è€ˆÀ€À…ÕÑ¼ˆõôø(€€€€€€€€€€€€€€€€€í½Á¥•€ü€ðøñ¡•¬Í¥é”õìÄÅô½±½Èô‰Ù…È ´µ‰´µÉ••¸¤ˆ€¼ø½Á¥•ð¼ø€è€ðøñ½ÁäÍ¥é”õìÄÅô€¼ø½Áäð¼ùô(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€í¥Í=ÕÑÉ•…¡Ñ¥½¸€ü€ (€€€€€€€€€€€€€€ñÑ•áÑ…É•„(€€€€€€€€€€€€€€€Ù…±Õ”õí‘É…™Ñ5•ÍÍ…”€üü€ˆ‰ô(€€€€€€€€€€€€€€€½¹¡…¹”õí”€ôøÍ•ÑÉ…™Ñ5•ÍÍ…”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô(€€€€€€€€€€€€€€€É½ÝÌõìÑô(€€€€€€€€€€€€€€€ÍÑå±”õíìÝ¥‘Ñ è€ˆÄÀÀ”ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•ÈÈ¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµ±œ¤ˆ°Á…‘‘¥¹œè€‰Ù…È ´µÍÁ…”´Ì¤Ù…È ´µÍÁ…”´Ì¤ˆ°™½¹ÑM¥é”è¥Í5½‰¥±”€ü€‰Ù…È ´µÑ•áÐµµ¤ˆ€è€‰Ù…È ´µÑ•áÐµ‰…Í”¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°½ÕÑ±¥¹”è€‰¹½¹”ˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°É•Í¥é”è€‰Ù•ÉÑ¥…°ˆ°‰½áM¥é¥¹œè€‰‰½É‘•Èµ‰½àˆ°±¥¹•!•¥¡Ðè€‰Ù…È ´µ±•…‘¥¹œµÉ•±…á•¤ˆ°ÑÉ…¹Í¥Ñ¥½¸è€‰‰½É‘•Èµ½±½È€À¸ÄÕÌˆõô(€€€€€€€€€€€€€€€½¹½ÕÌõí”€ôøì”¹Ñ…É•Ð¹ÍÑå±”¹‰½É‘•É½±½È€ô€‰Ù…È ´µ‰´µ…•¹Ðµ‰¤ˆìõô(€€€€€€€€€€€€€€€½¹	±ÕÈõí”€ôøì”¹Ñ…É•Ð¹ÍÑå±”¹‰½É‘•É½±½È€ô€‰Ù…È ´µ‰´µ‰½É‘•ÈÈ¤ˆìõô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è¥Í5½‰¥±”€ü€‰Ù…È ´µÑ•áÐµµ¤ˆ€è€‰Ù…È ´µÑ•áÐµ‰…Í”¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°µ…É¥¸è€À°±¥¹•!•¥¡Ðè€‰Ù…È ´µ±•…‘¥¹œµÉ•±…á•¤ˆ°™½¹ÑMÑå±”è€‰¥Ñ…±¥Œˆõôø™±‘ÅÕ¼ííÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡‘É…™Ñ5•ÍÍ…”€üü…Ñ¥½¹…Ñ„¹µ•ÍÍ…”¥ô™É‘ÅÕ¼ìð½Àø(€€€€€€€€€€€€¥ô(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¥ô(€€€€€€€€€í…Ñ¥½¹…Ñ„¹É½Õ¹‘•‘%¸€˜˜…Ñ¥½¹…Ñ„¹É½Õ¹‘•‘%¸¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹Q½Àè€‰Ù…È ´µÍÁ…”´Ì¤ˆ°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆõôø(€€€€€€€€€€€€€]¡•É”Ñ¡•äÑ…±¬…‰½ÕÐÑ¡¥Ìéìˆ€‰ô(€€€€€€€€€€€€€í…Ñ¥½¹…Ñ„¹É½Õ¹‘•‘%¸¹µ…À ¡œ°¤¤€ôø€ (€€€€€€€€€€€€€€€€ñ„­•äõíœ¹ÕÉ±ô¡É•˜õíœ¹ÕÉ±ôÑ…É•Ðô‰}‰±…¹¬ˆÉ•°ô‰¹½½Á•¹•È¹½É•™•ÉÉ•ÈˆÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°µ…É¥¹I¥¡Ðè€ÄÀõôø(€€€€€€€€€€€€€€€€€íÍ…¹¥Ñ¥é•=ÕÑÁÕÐ¡œ¹Ñ¥Ñ±”¤¹Í±¥” À°€ØÀ¥õí¤€ð…Ñ¥½¹…Ñ„¹É½Õ¹‘•‘%¸„¹±•¹Ñ €´€Ä€ü€ˆˆ€è€ˆ‰ô(€€€€€€€€€€€€€€€€ð½„ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø((€€€€€€ð¼ø(€€€€€€¥ô((€€€€€ì¼¨ƒŠRŠR ¡½½Í”¡…¹¹•°€˜…Õ‘¥•¹”ƒŠRŠR €¨½ô(€€€€€ì…¹½É…™Ð€˜˜€…¡¥‘•1•…ä€˜˜€ (€€€€€€ñµ½Ñ¥½¸¹‘¥Ø¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÄÀõô…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€ÀõôÑÉ…¹Í¥Ñ¥½¸õíì‘•±…äè€À¸ÄÈõô(€€€€€€€ÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈ´Íá°¤ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€‰Ù…È ´µÍÁ…”´Ô¤ˆ€è€‰Ù…È ´µÍÁ…”´Ô¤Ù…È ´µÍÁ…”´Ø¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ð¤ˆõôø(€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ä¤ˆõôø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì(€€€€€€€€€€€Ý¥‘Ñ è€ÈÈ°¡•¥¡Ðè€ÈÈ°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°(€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°(€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°(€€€€€€€€€€€™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€àÀÀ°™±•áM¡É¥¹¬è€À°(€€€€€€€€€õôøÌð½‘¥Øø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµÍ´¤ˆ°™½¹Ñ]•¥¡Ðè€ØÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆõôù¡½½Í”¡…¹¹•°€™…µÀì…Õ‘¥•¹”ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ð¤ˆ°±¥¹•!•¥¡Ðè€‰Ù…È ´µ±•…‘¥¹œµ¹½Éµ…°¤ˆ°Á…‘‘¥¹1•™Ðè€ÌÀõôø(€€€€€€€€€íÑ…É•ÑUÍ•ÉÌ(€€€€€€€€€€€€ü€ðùI•… å½ÕÈ€ñÍÑÉ½¹œÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ÔÀÀõôùíÑ…É•ÑUÍ•ÉÍôð½ÍÑÉ½¹œø‘¥É•Ñ±ä¸Ð±•…ÍÐ€ÌÁ•½Á±”¸½¹”½Õ¹ÑÌ•Ù•¸¥˜Ñ¡•ä‘½¸ÐÉ•Á±ä¸ð¼ø(€€€€€€€€€€€€è€‰Ð±•…ÍÐ€ÌÁ•½Á±”¸½¹”½Õ¹ÑÌ…Ì‘½¹”•Ù•¸¥˜Ñ¡•ä‘½¸ÐÉ•Á±ä¸I•Á±¥•Ì…É”„‰½¹ÕÌ¸‰ô(€€€€€€€€ð½Àø(€€€€€€€ì  ¤€ôøì(€€€€€€€€€€¼¼M…µ”¡½¹•ÍÑä½¹ÍÑÉ…¥¹Ð…ÌÑ¡”Ñ¥±”É¥Ñ¡¥ÌÉ•Á±…•Ìè½¹±ä(€€€€€€€€€€¼¼€‰µ…¥°Á•ÉÍ½¹…±±äˆ•ÑÌ„Íå¹Ñ¡•Í¥é•µ…¥±Ñ¼è€¡É•…°‘É…™Ð(€€€€€€€€€€¼¼½¹Ñ•¹Ð‰•¡¥¹¥Ð¤¸Ù•ÉåÑ¡¥¹œ•±Í”•¥Ñ¡•È¡…Ì„É•…°ÕÉ°¥¸(€€€€€€€€€€¼¼MQ%9Q%=9L½È¡…Ì¹¼É•…°Ñ…É•Ð‘…Ñ„€¡¹¼Á¡½¹”¹Õµ‰•È°¹¼(€€€€€€€€€€¼¼ÁÉ½™¥±”UI0¤ƒŠPÑ¡½Í”ÍÑ…äÍ•±•Ñ…‰±”‰ÕÐ¥¹•ÉÐ°Í…µ”…Ì‰•™½É”°(€€€€€€€€€€¼¼¹•Ù•È„™…‰É¥…Ñ•±¥¹¬½È„™…‰É¥…Ñ•É•¥Á¥•¹Ð½Õ¹Ð¸(€€€€€€€€€½¹ÍÐ¡…¹¹•±Ì€ô‘•ÍÑ¥¹…Ñ¥½¹Ì¹µ…À¡€ôøì(€€€€€€€€€€€½¹ÍÐ¥Íµ…¥°€ô¹±…‰•°€ôôô€‰µ…¥°Á•ÉÍ½¹…±±äˆì(€€€€€€€€€€€½¹ÍÐµ…¥±!É•˜€ô¥Íµ…¥°(€€€€€€€€€€€€€€üµ…¥±Ñ¼èýÍÕ‰©•Ðô‘í•¹½‘•UI%½µÁ½¹•¹Ð¡ÁÉ½©•Ðü¹¹…µ”€üEÕ¥¬ÅÕ•ÍÑ¥½¸…‰½ÕÐ€‘íÁÉ½©•Ð¹¹…µ•õ€€è€‰EÕ¥¬ÅÕ•ÍÑ¥½¸ˆ¥ô™‰½‘äô‘í•¹½‘•UI%½µÁ½¹•¹Ð¡‘É…™Ñ5•ÍÍ…”€üü…Ñ¥½¹…Ñ„ü¹µ•ÍÍ…”€üü€ˆˆ¥õ€(€€€€€€€€€€€€€€èÕ¹‘•™¥¹•ì(€€€€€€€€€€€½¹ÍÐ¡É•˜€ô¹ÕÉ°€üüµ…¥±!É•˜ì(€€€€€€€€€€€É•ÑÕÉ¸ì€¸¸¹°¡É•˜°¥¹•ÉÐè€…¡É•˜ôì(€€€€€€€€€ô¤ì(€€€€€€€€€½¹ÍÐ‘•™…Õ±Ñ¡…¹¹•°€ô¡…¹¹•±Ì¹™¥¹¡Œ€ôø€…Œ¹¥¹•ÉÐ¤€üü¡…¹¹•±ÍlÁtì(€€€€€€€€€½¹ÍÐ…Ñ¥Ù”€ô¡…¹¹•±Ì¹™¥¹¡Œ€ôøŒ¹±…‰•°€ôôôÍ•±•Ñ•‘¡…¹¹•°¤€üü‘•™…Õ±Ñ¡…¹¹•°ì((€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€ðø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€‰Ù…È ´µÍÁ…”´È¤ˆ°™±•á]É…Àè€‰ÝÉ…Àˆ°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ð¤ˆõôø(€€€€€€€€€€€€€€€í¡…¹¹•±Ì¹µ…À¡Œ€ôøì(€€€€€€€€€€€€€€€€€½¹ÍÐ¥ÍÑ¥Ù”€ô…Ñ¥Ù”ü¹±…‰•°€ôôôŒ¹±…‰•°ì(€€€€€€€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€€€­•äõíŒ¹±…‰•±ô(€€€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑM•±•Ñ•‘¡…¹¹•°¡Œ¹±…‰•°¥ô(€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€à°(€€€€€€€€€€€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆáÁà€ÄÑÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµ™Õ±°°€ääåÁà¤ˆ°(€€€€€€€€€€€€€€€€€€€€€€€‰½É‘•Èè€ÅÁàÍ½±¥€‘í¥ÍÑ¥Ù”€ü€‰Ù…È ´µ‰´µ…•¹Ðµ‰¤ˆ€è€‰Ù…È ´µ‰´µ‰½É‘•ÈÈ¤‰õ€°(€€€€€€€€€€€€€€€€€€€€€€€‰…­É½Õ¹è¥ÍÑ¥Ù”€ü€‰Ù…È ´µ‰´µ…•¹Ðµ‘¥´¤ˆ€è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°(€€€€€€€€€€€€€€€€€€€€€€€ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°Ñ•áÑ±¥¸è€‰±•™Ðˆ°(€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸…É¥„µ¡¥‘‘•¸ÍÑå±”õíì(€€€€€€€€€€€€€€€€€€€€€€€Ý¥‘Ñ è€Ü°¡•¥¡Ðè€Ü°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°™±•áM¡É¥¹¬è€À°(€€€€€€€€€€€€€€€€€€€€€€€‰…­É½Õ¹è¥ÍÑ¥Ù”€ü€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ€è€‰Ù…È ´µ‰´µ‰½É‘•ÈÌ¤ˆ°(€€€€€€€€€€€€€€€€€€€€€õô€¼ø(€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì‘¥ÍÁ±…äè€‰‰±½¬ˆ°™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµáÌ¤ˆ°™½¹Ñ]•¥¡Ðè€ØÀÀ°½±½Èè¥ÍÑ¥Ù”€ü€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ€è€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆõôø(€€€€€€€€€€€€€€€€€€€€€€€€€íŒ¹¥½¹ôíŒ¹±…‰•±ô(€€€€€€€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì‘¥ÍÁ±…äè€‰‰±½¬ˆ°™½¹ÑM¥é”è€ÄÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°µ…É¥¹Q½Àè€Äõôø(€€€€€€€€€€€€€€€€€€€€€€€€€íŒ¹¥¹•ÉÐ€ü€‰9¼±¥¹­•‘•ÍÑ¥¹…Ñ¥½¸ƒŠP‘¼Ñ¡¥Ì½¹”µ…¹Õ…±±äˆ€èÑ…É•ÑUÍ•ÉÌ€üI•… €‘íÑ…É•ÑUÍ•ÉÍõ€€è€‰=Á•¹Ì¥¸„¹•ÜÑ…ˆ‰ô(€€€€€€€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€€€ô¥ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ñ„(€€€€€€€€€€€€€€€¡É•˜õí…Ñ¥Ù”ü¹¡É•™ô(€€€€€€€€€€€€€€€Ñ…É•Ðõí…Ñ¥Ù”ü¹¡É•˜€ü€‰}‰±…¹¬ˆ€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€É•°õí…Ñ¥Ù”ü¹¡É•˜€ü€‰¹½½Á•¹•È¹½É•™•ÉÉ•Èˆ€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€½¹±¥¬õì……Ñ¥Ù”ü¹¡É•˜€ü€¡”¤€ôø”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰¥¹±¥¹”µ™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°(€€€€€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄÁÁà€ÈÁÁàˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµ±œ¤ˆ°(€€€€€€€€€€€€€€€€€‰…­É½Õ¹è…Ñ¥Ù”ü¹¡É•˜€ü€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ€è€‰Ù…È ´µ‰´µ‰œÐ¤ˆ°(€€€€€€€€€€€€€€€€€½±½Èè…Ñ¥Ù”ü¹¡É•˜€ü€‰Ù…È ´µ‰´µ‰œ¤ˆ€è€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°(€€€€€€€€€€€€€€€€€™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµÍ´¤ˆ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°Ñ•áÑ•½É…Ñ¥½¸è€‰¹½¹”ˆ°(€€€€€€€€€€€€€€€€€ÕÉÍ½Èè…Ñ¥Ù”ü¹¡É•˜€ü€‰Á½¥¹Ñ•Èˆ€è€‰‘•™…Õ±Ðˆ°(€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€í…Ñ¥Ù”€üM•¹Ù¥„€‘í…Ñ¥Ù”¹±…‰•±õ€€è€‰M•¹‰ô(€€€€€€€€€€€€€€ð½„ø(€€€€€€€€€€€€ð¼ø(€€€€€€€€€€¤ì(€€€€€€€ô¤ ¥ô(€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€¥ô((€€€€€ì¼¨ƒŠRŠR ¡•¬µ¥¸ƒŠRŠR €¨½ô(€€€€€€ñµ½Ñ¥½¸¹‘¥Ø¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÄÀõô…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€ÀõôÑÉ…¹Í¥Ñ¥½¸õíì‘•±…äè€À¸ÄØõô(€€€€€€€ÍÑå±”õíì‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈ´Íá°¤ˆ°Á…‘‘¥¹œè¥Í5½‰¥±”€ü€‰Ù…È ´µÍÁ…”´Ô¤ˆ€è€‰Ù…È ´µÍÁ…”´Ô¤Ù…È ´µÍÁ…”´Ø¤ˆõôø((€€€€€€€ì¼¨MÑ…”µ½Ñ¥Ù…Ñ½È€¨½ô(€€€€€€€íÁÉ½©•Ðü¹ÍÑ…ÉÑÕÁ}ÍÑ…”€˜˜€ (€€€€€€€€€€ñÀ(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€™½¹ÑM¥é”è€‰Ù…È ´µÑ•áÐµÍ´¤ˆ°(€€€€€€€€€€€€€½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°(€€€€€€€€€€€€€µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ð¤ˆ°(€€€€€€€€€€€€€±¥¹•!•¥¡Ðè€‰Ù…È ´µ±•…‘¥¹œµ¹½Éµ…°¤ˆ°(€€€€€€€€€€€€€™½¹ÑMÑå±”è€‰¥Ñ…±¥Œˆ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€íì(€€€€€€€€€€€€€%‘•„è€‰Ð%‘•„ÍÑ…”°½¹”½¹Ù•ÉÍ…Ñ¥½¸Ý¥Ñ „É•…°Á•ÉÍ½¸‰•…ÑÌ„Ý••¬½˜Á±…¹¹¥¹œ¸ˆ°(€€€€€€€€€€€€€Y…±¥‘…Ñ¥½¸è€‰Y…±¥‘…Ñ¥½¸¥Ì…‰½ÕÐ‰•¡…Ù¥½ÕÈ°¹½Ð½Á¥¹¥½¹Ì¸¥Í½µ•½¹”½µµ¥ÐÑ¥µ”½Èµ½¹•äüˆ°(€€€€€€€€€€€€€5Y@è€‰MÑ½ÀÁ½±¥Í¡¥¹œ¸Ù•Éä‘…äå½Ô‘½¸ÐÍ¡…É”¥Ð°å½ÔÉ”‰Õ¥±‘¥¹œ¥¸Ñ¡”‘…É¬¸ˆ°(€€€€€€€€€€€€€1…Õ¹ è€‰Y¥Í¥‰¥±¥Ñä½µÁ½Õ¹‘Ì¸Ù•ÉäÁ½ÍÐ°•Ù•Éä4°•Ù•ÉäÍ¡…É”¥Ì„™ÕÑÕÉ”ÕÍÑ½µ•È¸ˆ°(€€€€€€€€€€€€€É½ÝÑ è€‰I•Ñ•¹Ñ¥½¸‰•…ÑÌ…ÅÕ¥Í¥Ñ¥½¸¸Q¡”‰•ÍÐ™½Õ¹‘•ÉÌ…±°¡ÕÉ¹•ÕÍ•ÉÌ¸ˆ°(€€€€€€€€€€€€€I•Ù•¹Õ”è€‰I•Ù•¹Õ”¥Ì„Í¥¹…°¸Q½‘…äÌ…Ñ¥½¸¡•±ÁÌå½ÔÉ•…¥Ð…ÕÉ…Ñ•±ä¸ˆ°(€€€€€€€€€€€õmÁÉ½©•Ð¹ÍÑ…ÉÑÕÁ}ÍÑ…•t€üü(€€€€€€€€€€€€€€‰5½µ•¹ÑÕ´½µÁ½Õ¹‘Ì¸Q¡”Ý½É¬å½Ô‘¼Ñ½‘…äÍ¡…Á•ÌÑ½µ½ÉÉ½ÜÌÉ•½µµ•¹‘…Ñ¥½¸¸‰ô(€€€€€€€€€€ð½Àø(€€€€€€€€¥ô((€€€€€€€ì¼¨AÉ½É•ÍÌÑÉ…­•È€¨½ô(€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€À°µ…É¥¹	½ÑÑ½´è€‰Ù…È ´µÍÁ…”´Ô¤ˆ°½Ù•É™±½Üè€‰¡¥‘‘•¸ˆõôø(€€€€€€€€€íl(€€€€€€€€€€€ì¸è€Ä°±…‰•°è€‰I•……Ñ¥½¸ˆ°‘½¹”èÑÉÕ”ô°(€€€€€€€€€€€ì¸è€È°±…‰•°è€‰‘¥ÐÍÉ¥ÁÐˆ°‘½¹”è€„…‘É…™Ñ5•ÍÍ…”ô°(€€€€€€€€€€€ì¸è€Ì°±…‰•°è€‰M•¹¥Ðˆ°‘½¹”è½Á¥•ô°(€€€€€€€€€€€ì¸è€Ð°±…‰•°è€‰¡•¬¥¸ˆ°‘½¹”è™…±Í”°…Ñ¥Ù”èÑÉÕ”ô°(€€€€€€€€€t¹µ…À ¡ÍÑ•À°¤¤€ôø€ (€€€€€€€€€€€€ñ‘¥Ø­•äõíÍÑ•À¹¹ôÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°™±•àè¤€ð€Ì€ü€Ä€è€‰¹½¹”ˆõôø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€Ìõôø(€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì(€€€€€€€€€€€€€€€€€Ý¥‘Ñ è€ÈÐ°¡•¥¡Ðè€ÈÐ°‰½É‘•ÉI…‘¥ÕÌè€ˆÔÀ”ˆ°™½¹ÑM¥é”è€ÄÀ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°(€€€€€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰•¹Ñ•Èˆ°(€€€€€€€€€€€€€€€€€‰…­É½Õ¹èÍÑ•À¹‘½¹”€ü€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ€èÍÑ•À¹…Ñ¥Ù”€ü€‰Ù…È ´µ‰´µ‰œÐ¤ˆ€è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°(€€€€€€€€€€€€€€€€€½±½ÈèÍÑ•À¹‘½¹”€ü€‰Ù…È ´µ‰´µ‰œ¤ˆ€èÍÑ•À¹…Ñ¥Ù”€ü€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ€è€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°(€€€€€€€€€€€€€€€€€‰½É‘•ÈèÍÑ•À¹…Ñ¥Ù”€ü€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•ÈÌ¤ˆ€è€‰¹½¹”ˆ°(€€€€€€€€€€€€€€€€€ÑÉ…¹Í¥Ñ¥½¸è€‰…±°€À¸ÉÌˆ°(€€€€€€€€€€€€€€€õôø(€€€€€€€€€€€€€€€€€íÍÑ•À¹‘½¹”€ü€‹ŠrLˆ€èÍÑ•À¹¹ô(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€ì…¥Í5½‰¥±”€˜˜€ (€€€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ä°½±½ÈèÍÑ•À¹‘½¹”€ü€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ€èÍÑ•À¹…Ñ¥Ù”€ü€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ€è€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°™½¹Ñ]•¥¡ÐèÍÑ•À¹…Ñ¥Ù”€ü€ØÀÀ€è€ÐÀÀ°Ý¡¥Ñ•MÁ…”è€‰¹½ÝÉ…Àˆõôø(€€€€€€€€€€€€€€€€€€€íÍÑ•À¹±…‰•±ô(€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€í¤€ð€Ì€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™±•àè€Ä°¡•¥¡Ðè€Ä°‰…­É½Õ¹èÍÑ•À¹‘½¹”€ü€‰Ù…È ´µ‰´µ‰½É‘•ÈÌ¤ˆ€è€‰Ù…È ´µ‰´µ‰½É‘•È¤ˆ°µ…É¥¸è€ˆÀ€ÑÁàˆ°µ…É¥¹	½ÑÑ½´è¥Í5½‰¥±”€ü€À€è€ÄÐ°ÑÉ…¹Í¥Ñ¥½¸è€‰‰…­É½Õ¹€À¸ÍÌˆõô€¼ø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¤¥ô(€€€€€€€€ð½‘¥Øø((€€€€€€€€ñÀÍÑå±”õíì™½¹Ñ…µ¥±äè€‰Ù…È ´µ™½¹Ðµµ½¹¼°µ½¹½ÍÁ…”¤ˆ°™½¹ÑM¥é”è€ä°Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Å•´ˆ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°µ…É¥¸è€ˆÀ€À€ÙÁàˆõôø(€€€€€€€€€¡•¬µ¥¸(€€€€€€€€ð½Àø(€€€€€€€€ñ ÈÍÑå±”õíì™½¹ÑM¥é”è¥Í5½‰¥±”€ü€ÄÔ€è€ÄØ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°µ…É¥¸è€ˆÀ€À€áÁàˆõôø(€€€€€€€€€!½Ü‘¥¥Ð¼ü(€€€€€€€€ð½ Èø(€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ¸Ô°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹	½ÑÑ½´è€ÄÐ°±¥¹•!•¥¡Ðè€Ä¸Øõôø(€€€€€€€€€Q…Àå½ÕÈ½ÕÑ½µ”Ñ¼±½œÑ½‘…äÌÉ•™±•Ñ¥½¸¸(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°µ…É¥¹	½ÑÑ½´è€Ðõôø(€€€€€€€€€í=UQ=5}!%AL¹µ…À ¡¡¥À°¤¤€ôø€ (€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€­•äõí¡¥À¹¥‘ô(€€€€€€€€€€€€€‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹ô(€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€€€¥˜€¡ÍÕ‰µ¥ÑÑ¥¹œ¤É•ÑÕÉ¸ì(€€€€€€€€€€€€€€€Í•ÑMÕ‰µ¥ÑÑ¥¹œ¡ÑÉÕ”¤ì(€€€€€€€€€€€€€€€€¼¼AÉ•Ù¥½ÕÍ±äÑ¡¥Ì…Ý…¥Ñ•¡…¹‘±•¡•­%¸Ì9Q%IÁÉ½µ¥Í”(€€€€€€€€€€€€€€€€¼¼¡…¥¸‰•™½É”¹…Ù¥…Ñ¥¹œƒŠP€ÐÍ•ÅÕ•¹Ñ¥…°¹•ÑÝ½É¬É½Õ¹µÑÉ¥ÁÌ(€€€€€€€€€€€€€€€€¼¼€¡Ñ…Í¬µ½µÁ±•Ñ”™•Ñ °Á•ÉÍ¥ÍÑ	•¡…Ù¥½ÉMÑ…Ñ”°„‘¥É•Ð(€€€€€€€€€€€€€€€€¼¼MÕÁ…‰…Í”Í½É”ÕÁ‘…Ñ”°„™½Õ¹‘•Èµ½¹Ñ•áÐAQ ¤…±°¡…Ñ¼(€€€€€€€€€€€€€€€€¼¼É•Í½±Ù”™¥ÉÍÐ¸9½¹”½˜Ñ¡…Ð¥Ì¹••‘•Ñ¼É•¹‘•È€½É•™±•ÐƒŠP(€€€€€€€€€€€€€€€€¼¼¥Ð½¹±ä¹••‘ÌÑ¡”½ÕÑ½µ”€¡UI0Á…É…´¤…¹Ñ¡¥Ì±½…°(€€€€€€€€€€€€€€€€¼¼Í¹…ÁÍ¡½Ð°Ý¡¥ ¡…¹‘±•¡•­%¸ÕÍ•Ñ¼ÝÉ¥Ñ”µ¥µ¡…¥¸°(€€€€€€€€€€€€€€€€¼¼…™Ñ•ÈÑ¡”™¥ÉÍÐ…Ý…¥Ñ•…±°¸]É¥Ñ¥¹œ¥Ð¡•É”°Íå¹¡É½¹½ÕÍ±ä°(€€€€€€€€€€€€€€€€¼¼‰•™½É”¹…Ù¥…Ñ¥¹œ°…¹±•ÑÑ¥¹œÑ¡”É•ÍÐ½˜¡…¹‘±•¡•­%¸Ì(€€€€€€€€€€€€€€€€¼¼Í•ÉÙ•ÈµÍ¥‘”‰½½­­••Á¥¹œÉÕ¸¥¸Ñ¡”‰…­É½Õ¹¥ÌÝ¡…Ð(€€€€€€€€€€€€€€€€¼¼…ÑÕ…±±äÕÑÌÑ¡”Ý…¥ÐƒŠPÑ¡”‰½½­­••Á¥¹œ‘½•Í¸Ð‰±½¬(€€€€€€€€€€€€€€€€¼¼…¹åÑ¡¥¹œ€½É•™±•ÐÉ•¹‘•ÉÌ¸(€€€€€€€€€€€€€€€ÍÑ½É…”¹Í•Ñ)M=8 ‰‰µ}Ñ½‘…å}…Ñ¥½¸ˆ°ì(€€€€€€€€€€€€€€€€€…Ñ¥½¸è…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸€üü€ˆˆ°(€€€€€€€€€€€€€€€€€½ÕÑ½µ”è¡¥À¹¥°(€€€€€€€€€€€€€€€€€¹½Ñ”è€ˆˆ°(€€€€€€€€€€€€€€€€€½¹™¥‘•¹”è€Ì°(€€€€€€€€€€€€€€€€€É•½µµ•¹‘…Ñ¥½¹}¥è…Ñ¥½¹…Ñ„ü¹¥¹Ñ•±±¥•¹”ü¹É•½µµ•¹‘…Ñ¥½¹}¥€üü¹Õ±°°(€€€€€€€€€€€€€€€€€‘…Ñ”è±½…±…å-•ä ¤°(€€€€€€€€€€€€€€€ô¤ì(€€€€€€€€€€€€€€€Ù½¥¡…¹‘±•¡•­%¸¡¡¥À¹¥¤¹…Ñ   ¤€ôøì(€€€€€€€€€€€€€€€€€Í•ÑMÕ‰µ¥ÑÑ¥¹œ¡™…±Í”¤ì(€€€€€€€€€€€€€€€ô¤ì(€€€€€€€€€€€€€€€É½ÕÑ•È¹ÁÕÍ ¡€½É•™±•Ðý½ÕÑ½µ”ô‘í¡¥À¹¥‘õ€¤ì(€€€€€€€€€€€€€õô(€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°(€€€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°(€€€€€€€€€€€€€€€©ÕÍÑ¥™å½¹Ñ•¹Ðè€‰ÍÁ…”µ‰•ÑÝ••¸ˆ°(€€€€€€€€€€€€€€€…Àè€ÄÀ°(€€€€€€€€€€€€€€€Á…‘‘¥¹œè¥Í5½‰¥±”€ü€ˆÄÍÁà€ÑÁàˆ€è€ˆÄÉÁà€ÙÁàˆ°(€€€€€€€€€€€€€€€‰½É‘•ÉQ½Àè¤€ôôô€À€ü€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ€è€‰¹½¹”ˆ°(€€€€€€€€€€€€€€€‰½É‘•É	½ÑÑ½´è€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°(€€€€€€€€€€€€€€€‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆ°(€€€€€€€€€€€€€€€½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°(€€€€€€€€€€€€€€€ÕÉÍ½ÈèÍÕ‰µ¥ÑÑ¥¹œ€ü€‰¹½Ðµ…±±½Ý•ˆ€è€‰Á½¥¹Ñ•Èˆ°(€€€€€€€€€€€€€€€™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°(€€€€€€€€€€€€€€€Ñ•áÑ±¥¸è€‰±•™Ðˆ…Ì½¹ÍÐ°(€€€€€€€€€€€€€€€ÑÉ…¹Í¥Ñ¥½¸è€‰‰…­É½Õ¹€À¸ÄÕÌˆ°(€€€€€€€€€€€€€€€½Á…¥ÑäèÍÕ‰µ¥ÑÑ¥¹œ€ü€À¸Ø€è€Ä°(€€€€€€€€€€€€€õô(€€€€€€€€€€€€€½¹5½ÕÍ•¹Ñ•Èõí”€ôøì¥˜€ …ÍÕ‰µ¥ÑÑ¥¹œ¤”¹ÕÉÉ•¹ÑQ…É•Ð¹ÍÑå±”¹‰…­É½Õ¹€ô€‰Ù…È ´µ‰´µ‰œÌ¤ˆìõô(€€€€€€€€€€€€€½¹5½ÕÍ•1•…Ù”õí”€ôøì”¹ÕÉÉ•¹ÑQ…É•Ð¹ÍÑå±”¹‰…­É½Õ¹€ô€‰ÑÉ…¹ÍÁ…É•¹Ðˆìõô(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñÍÁ…¸ø(€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì‘¥ÍÁ±…äè€‰‰±½¬ˆ°™½¹ÑM¥é”è¥Í5½‰¥±”€ü€ÄÐ€è€ÄÈ¸Ô°™½¹Ñ]•¥¡Ðè€ØÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆõôø(€€€€€€€€€€€€€€€€€íÍÕ‰µ¥ÑÑ¥¹œ€ü€‰I•½É‘¥¹œ¸¸¸ˆ€è¡¥À¹±…‰•±ô(€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì‘¥ÍÁ±…äè€‰‰±½¬ˆ°™½¹ÑM¥é”è€ÄÀ¸Ô°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°µ…É¥¹Q½Àè€Èõôø(€€€€€€€€€€€€€€€€€í¡¥À¹‘•ÍÉ¥ÁÑ¥½¹ô(€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°™±•áM¡É¥¹¬è€ÀõôûŠèð½ÍÁ…¸ø(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€¤¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°µ…É¥¸è€ˆÄÁÁà€À€Àˆ°±¥¹•!•¥¡Ðè€Ä¸Ôõôø(€€€€€€€€€e½ÕÈ½ÕÑ½µ”Í•±•Ñ¥½¸Ý¥±°™••¥¹Ñ¼€½É•™±•Ð™½È±•…É¹¥¹œ…ÁÑÕÉ”¸(€€€€€€€€ð½Àø(€€€€€€€€ñQÉ…­•‘1¥¹­ÌÁÉ½©•Ñ%õíÁÉ½©•Ðü¹¥‘ôÍÕ•ÍÑ•‘M½ÕÉ”õí¥¹™•ÉM½ÕÉ”¡…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸¥ô¹Õ‘”õí¹••‘ÍQÉ…­•‘1¥¹¬¡…Ñ¥½¹…Ñ„ü¹…Ñ¥½¸¥ô€¼ø(€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€ð¼ø¥ô(€€€€€ì¼¨½¹Ñ•áÐƒŠP‘•±¥‰•É…Ñ•±ä	1=\Ñ¡”Ñ…Í¬¸É¡•ÑåÁ”°ÍÑ…”É•…‘¥¹•ÍÌ…¹Ñ¡”(€€€€€€€€€ÁÉ½©•Ð½¡½ÍÐµ½…°¡¥ÁÌ…É”ÕÍ•™Õ°‰ÕÐÑ¡•ä…É”¹½ÐÑ¡”‘•¥Í¥½¸°Í¼Ñ¡•ä(€€€€€€€€€¹¼±½¹•ÈÍ¥Ð‰•ÑÝ••¸Ñ¡”™½Õ¹‘•È…¹Ñ½‘…äÌ…Ñ¥½¸¸€¨½ô(€€€€€€ñ‘¥ØÍÑå±”õíìµ…É¥¹Q½Àè€ÈÈ°‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…Àè€À°µ¥¹]¥‘Ñ è€Àõôø(€€€€€ì¼¨1¥¡ÑÝ•¥¡ÐÁÉ½©•Ð€¬ÍÑ…”‰…‘”ƒŠP]••­±äY¥¥°…¹Q¡”I•­½¹¥¹œ(€€€€€€€€€±¥Ù”¡•É”…Ì½µÁ…Ð¡¥ÁÌ°¹½Ð…ÌÑ¡•¥È½Ý¸‰…¹¹•ÉÌ¸A•ÈÑ¡”(€€€€€€€€€Q½‘…äµÁ…”Ñ…Í¬µ™¥ÉÍÐÉÕ±”è•¥Í¥½¹	É¥•˜¥ÌÑ¡”½¹±ä•±•µ•¹Ð(€€€€€€€€€…±±½Ý•„Á•Éµ…¹•¹Ñ±äµ½Á•¸™Õ±°‰±½¬¸Y¥¥°¥Ì„™•ÜÝ½É‘Ì°(€€€€€€€€€…±Ý…åÌÁÉ•Í•¹Ð½¹”±½…‘•ìI•­½¹¥¹œÉ•¹‘•ÉÌ¹½Ñ¡¥¹œ…Ð…±°(€€€€€€€€€•á•ÁÐÑ¡”øÄ‘…ä„µ½¹Ñ ¥Ð¡…ÌÍ½µ•Ñ¡¥¹œÉ•…°Ñ¼ÍÕÉ™…”¸	½Ñ (€€€€€€€€€½Á•¸Ñ¡•¥È™Õ±°‘•Ñ…¥°¥¸„µ½‘…°½¸Ñ…À°¹•Ù•È¥¹±¥¹”¸€¨½ô(€€€€€íÁÉ½©•Ð€˜˜€ (€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€à°µ…É¥¹	½ÑÑ½´è€ÄÐ°™±•á]É…Àè€‰ÝÉ…Àˆõôø(€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€ØÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÈ¤ˆ°±•ÑÑ•ÉMÁ…¥¹œè€ˆ´À¸ÀÅ•´ˆõôø(€€€€€€€€€€€íÁÉ½©•Ð¹¹…µ”€üü€‰e½ÕÈÍÑ…ÉÑÕÀ‰ô(€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€íÁÉ½©•Ð¹ÍÑ…ÉÑÕÁ}ÍÑ…”€˜˜€ (€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì(€€€€€€€€€€€€€™½¹Ñ…µ¥±äè€ˆ45½¹¼œ°µ½¹½ÍÁ…”ˆ°(€€€€€€€€€€€€€™½¹ÑM¥é”è€ä°(€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÉÁà€áÁàˆ°(€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€‰Ù…È ´µÈµÍ´¤ˆ°(€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°(€€€€€€€€€€€€€½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°(€€€€€€€€€€€€€‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°(€€€€€€€€€€€€€Ñ•áÑQÉ…¹Í™½É´è€‰ÕÁÁ•É…Í”ˆ°(€€€€€€€€€€€€€±•ÑÑ•ÉMÁ…¥¹œè€ˆÀ¸Àá•´ˆ°(€€€€€€€€€€€õôø(€€€€€€€€€€€€€íÁÉ½©•Ð¹ÍÑ…ÉÑÕÁ}ÍÑ…•ô(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€¥ô(€€€€€€€€€€ñ¡½ÍÑ½…±	…¹¹•È(€€€€€€€€€€€ÁÉ½©•Ñ%õíÁÉ½©•Ð¹¥‘ô(€€€€€€€€€€€ÕÉÉ•¹ÑM½É”õí5…Ñ ¹É½Õ¹¡ÁÉ½©•Ð¹•á•ÕÑ¥½¹}Í½É”€üü€À¥ô(€€€€€€€€€€€ÍÑ…”õíÁÉ½©•Ð¹ÍÑ…ÉÑÕÁ}ÍÑ…”€üü€‰%‘•„‰ô(€€€€€€€€€€€•á•ÕÑ¥½¹M½É”õíÁÉ½©•Ð¹•á•ÕÑ¥½¹}Í½É”€üü€Áô(€€€€€€€€€€€ÍÑÉ•…¬õíÍÑÉ•…­ô(€€€€€€€€€€€ÍÑ…ÉÑÕÁMÕµµ…Éäõì¡ÁÉ½©•Ð…ÌÕ¹­¹½Ý¸…ÌI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸ø¤¹ÍÑ…ÉÑÕÁ}ÍÕµµ…Éä…ÌÍÑÉ¥¹œðÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€ÁÉ½©•Ñ9…µ”õíÁÉ½©•Ð¹¹…µ”€üüÁÉ½©•Ð¹Ñ¥Ñ±”€üü€ˆ‰ô(€€€€€€€€€€¼ø(€€€€€€€€€€ñI•­½¹¥¹A¥±°ÁÉ½©•Ñ%õíÁÉ½©•Ð¹¥‘ô€¼ø(€€€€€€€€€í¥Í…å=¹•½±‘MÑ…ÉÐ€ü€ (€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíìµ…É¥¹1•™Ðè€‰…ÕÑ¼ˆ°™½¹Ñ…µ¥±äè€ˆ45½¹¼œ°µ½¹½ÍÁ…”ˆ°™½¹ÑM¥é”è€ÄÀ°½±½Èè€‰Ù…È ´µ‰´µ…•¹Ð¤ˆõôø(€€€€€€€€€€€€€MÑ…ÉÐå½ÕÈÍÑÉ•…¬Ñ½‘…ä(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€¤€èÍÑÉ•…¬€ø€À€˜˜€ (€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíìµ…É¥¹1•™Ðè€‰…ÕÑ¼ˆ°™½¹Ñ…µ¥±äè€ˆ45½¹¼œ°µ½¹½ÍÁ…”ˆ°™½¹ÑM¥é”è€ÄÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆõôø(€€€€€€€€€€€€€íÍÑÉ•…­õ(€€€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€€€¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô((€€€€€ì¼¨ƒŠRŠR ½Õ¹‘•È…É¡•ÑåÁ”ƒŠP½µÁ…Ð°¹½¸µ‰±½­¥¹œÁÉ•Í•¹”½¸Ñ¡”‘…¥±ä(€€€€€€€€€Á…”¸•±¥‰•É…Ñ•±ä¹½Ð„µ½‘…°½È„‘¥Íµ¥ÍÌµÑ¼µÁÉ½••…Ñ”€¡Ñ¡…Ð(€€€€€€€€€Ý…ÌÑ¡”ÁÉ½‰±•´Ý¥Ñ Ñ¡”½±%¹¥Ñ¥…°¹…±åÍ¥Ì…É¤ƒŠP©ÕÍÐ„Íµ…±°(€€€€€€€€€Á•ÉÍ¥ÍÑ•¹Ð‰…‘”°Í¥¹”Ñ¡¥Ì¥Ì„½É”Í¥¹…°Ñ¡”$ÕÍ•Ì½¸•Ù•Éä(€€€€€€€€€Ñ…Í¬…¹¥ÐÍ¡½Õ±‰”Ù¥Í¥‰±”Í½µ•Ý¡•É”Ñ¡”™½Õ¹‘•È…ÑÕ…±±ä±½½­Ì(€€€€€€€€€‘…¥±ä°¹½Ð©ÕÍÐ½¸€½µ•µ½Éä¸Q…ÀÑ¡É½Õ ™½ÈÑ¡”™Õ±°•áÁ±…¹…Ñ¥½¸¸(€€€€€€€€€-•ÁÐ…±Ý…åÌµÙ¥Í¥‰±”…±½¹Í¥‘”Ñ¡”%¹Ñ•±±¥•¹”A…¹•°Á•ÈÑ¡”(€€€€€€€€€™½Õ¹‘•ÈÌ•áÁ±¥¥ÐÉ•ÅÕ•ÍÐƒŠP•Ù•ÉåÑ¡¥¹œ•±Í”Ñ¡…ÐÕÍ•Ñ¼±¥Ù”¥¸(€€€€€€€€€Ñ¡¥ÌÍÁ½Ðµ½Ù•¥¹Ñ¼€¡½ÈÍÑ…å•¥¸¤Ñ¡”€‰]¡äÑ¡¥ÌÑ…Í¬üˆ‘É…Ý•È¸€¨½ô(€€€€€ì  ¤€ôøì(€€€€€€€½¹ÍÐ…É¡•ÑåÁ”€ô•ÑÉ¡•ÑåÁ•¥ÍÁ±…ä¡…É¡•ÑåÁ•Q…Ì¤ì(€€€€€€€¥˜€ ……É¡•ÑåÁ”¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€ñ„(€€€€€€€€€€€¡É•˜ôˆ½µ•µ½Éäˆ(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€ÄÀ°(€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄÁÁà€ÄÑÁàˆ°µ…É¥¹	½ÑÑ½´è€ÈÈ°(€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°(€€€€€€€€€€€€€Ñ•áÑ•½É…Ñ¥½¸è€‰¹½¹”ˆ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€Äà°™±•áM¡É¥¹¬è€Àõôùí…É¡•ÑåÁ”¹¥½¹ôð½ÍÁ…¸ø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™±•àè€Ä°µ¥¹]¥‘Ñ è€Àõôø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆõôùí…É¡•ÑåÁ”¹¹…µ•ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹1•™Ðè€àõôûŠPå½ÕÈ™½Õ¹‘•È…É¡•ÑåÁ”ð½ÍÁ…¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°™±•áM¡É¥¹¬è€Àõôù1•…É¸µ½É”ƒŠHð½ÍÁ…¸ø(€€€€€€€€€€ð½„ø(€€€€€€€€¤ì(€€€€€ô¤ ¥ô((€€€€€ì¼¨ƒŠRŠR MÑ…”µÑÉ…¹Í¥Ñ¥½¸¹Õ‘”ƒŠP½¹”±¥¹”°±¥¹­ÌÑ¼Ñ¡”™Õ±°ÁÉ½µÁÐ½¸(€€€€€€€€€Ñ¡”ÁÉ½©•ÐÁ…”É…Ñ¡•ÈÑ¡…¸‘ÕÁ±¥…Ñ¥¹œ¥Ð¡•É”¸M•”(€€€€€€€€€±¥ˆ½Í•ÉÙ•È½ÍÑ…•QÉ…¹Í¥Ñ¥½¸¹ÑÌ™½È¡½ÜÑ¡¥Ì•ÑÌ½µÁÕÑ•¸ƒŠRŠR €¨½ô(€€€€€ì  ¤€ôøì(€€€€€€€€¼¼5•É•€ÌµÍ¥¹…°É•…‘¥¹•ÍÌƒŠP‰½Ñ ÍÑ…•9Õ‘”€¡ÍÑ…•QÉ…¹Í¥Ñ¥½¸¹ÑÌ°(€€€€€€€€¼¼™¥É•…™Ñ•ÈÑ…Í¬½É•™±•Ñ¥½¸¤…¹ÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”€¡±•Ù•°µÕÀ(€€€€€€€€¼¼A=MP°™¥É•½¹”Á•ÈQ½‘…ä±½…¤¹½Ü½µÁÕÑ”Ñ¡”M5Ñ¥•ÈÙ¥„(€€€€€€€€¼¼±¥ˆ½Í•ÉÙ•È½ÍÑ…•I•…‘¥¹•ÍÌ¹ÑÌ°Í¼Ñ¡•ä…¸Ð‘¥Í…É•”ƒŠPÑ¡¥Ì(€€€€€€€€¼¼É•¹‘•ÉÌ½¹”™É½´Ý¡¥¡•Ù•È±½…‘•™¥ÉÍÐ¸Q¡”Ñ¥•È¥ÑÍ•±˜(€€€€€€€€¼¼‘•¥‘•ÌÑ¡”½±½È½½Áäèµ¥±•ÍÑ½¹”½µÁ±•Ñ¥½¸…±½¹”¥ÌÍ¡½Ý¸(€€€€€€€€¼¼¡½¹•ÍÑ±ä…Ì€‰¡•­±¥ÍÐ‘½¹”°•Ù¥‘•¹”Ñ¡¥¸°ˆ¹½Ð‘É•ÍÍ•ÕÀ…Ì(€€€€€€€€¼¼Ñ¡”Í…µ”É••¸€‰É•…‘äˆÍÑ…Ñ”„™½Õ¹‘•ÈÝ¥Ñ É•…°•Ù¥‘•¹”…¹(€€€€€€€€¼¼Í½±¥É•™±•Ñ¥½¹ÌÝ½Õ±Í•”¸(€€€€€€€½¹ÍÐµ½µ•¹Ð€ôÍÑ…•9Õ‘”(€€€€€€€€€€üì(€€€€€€€€€€€€€ÕÉÉ•¹ÑMÑ…•1…‰•°èÍÑ…•9Õ‘”¹ÕÉÉ•¹ÑMÑ…”°(€€€€€€€€€€€€€¹•áÑMÑ…”èÍÑ…•9Õ‘”¹¹•áÑMÑ…”°ÁÉ½©•Ñ%èÍÑ…•9Õ‘”¹ÁÉ½©•Ñ%°(€€€€€€€€€€€€€½µÁ±•Ñ•èÍÑ…•9Õ‘”¹½µÁ±•Ñ•°Ñ½Ñ…°èÍÑ…•9Õ‘”¹Ñ½Ñ…°°Ñ¥•ÈèÍÑ…•9Õ‘”¹Ñ¥•È°(€€€€€€€€€€€€€•Ù¥‘•¹•¥±±•èÍÑ…•9Õ‘”¹•Ù¥‘•¹•¥±±•°•Ù¥‘•¹•Q½Ñ…°èÍÑ…•9Õ‘”¹•Ù¥‘•¹•Q½Ñ…°°(€€€€€€€€€€€€€É•…Í½¸èÍÑ…•9Õ‘”¹É•…Í½¸°(€€€€€€€€€€€ô(€€€€€€€€€€èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”€˜˜ÁÉ½©•Ð(€€€€€€€€€€€€üì(€€€€€€€€€€€€€€€ÕÉÉ•¹ÑMÑ…•1…‰•°èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹ÕÉÉ•¹Ñ}ÍÑ…”°(€€€€€€€€€€€€€€€¹•áÑMÑ…”èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹¹•áÑ}ÍÑ…”°ÁÉ½©•Ñ%èÁÉ½©•Ð¹¥°(€€€€€€€€€€€€€€€½µÁ±•Ñ•èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹½µÁ±•Ñ•°Ñ½Ñ…°èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹Ñ½Ñ…°°Ñ¥•ÈèÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹Ñ¥•È°(€€€€€€€€€€€€€€€•Ù¥‘•¹•¥±±•èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹•Ù¥‘•¹•¥±±•°•Ù¥‘•¹•Q½Ñ…°èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹•Ù¥‘•¹•Q½Ñ…°°(€€€€€€€€€€€€€€€É•…Í½¸èÑÉ…¹Í¥Ñ¥½¹±¥¥‰±”¹É•…Í½¸°(€€€€€€€€€€€€€ô(€€€€€€€€€€€€è¹Õ±°ì(€€€€€€€¥˜€ …µ½µ•¹Ð¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€½¹ÍÐ¥ÍI•…‘ä€ôµ½µ•¹Ð¹Ñ¥•È€ôôô€‰É•…‘äˆì(€€€€€€€½¹ÍÐ½±½È€ô¥ÍI•…‘ä€ü€‰Ù…È ´µ‰´µÉ••¸¤ˆ€è€‰Ù…È ´µ‰´µ…µ‰•È¤ˆì(€€€€€€€½¹ÍÐ‰½É‘•ÉY…È€ô¥ÍI•…‘ä€ü€‰Ù…È ´µ‰´µÉ••¸µ‰¤ˆ€è€‰Ù…È ´µ‰´µ…µ‰•È¤ˆì(€€€€€€€½¹ÍÐ‰Y…È€ô¥ÍI•…‘ä€ü€‰Ù…È ´µ‰´µÉ••¸µ‘¥´¤ˆ€è€‰Ù…È ´µ‰´µ‰œÌ¤ˆì(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€ñ„(€€€€€€€€€€€¡É•˜õíµ½µ•¹Ð¹ÁÉ½©•Ñ%€ü€½ÁÉ½©•ÑÌ¼‘íµ½µ•¹Ð¹ÁÉ½©•Ñ%‘õ€€è€ˆ½ÁÉ½©•ÑÌ‰ô(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰•¹Ñ•Èˆ°…Àè€ÄÐ°(€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄÙÁà€ÄáÁàˆ°µ…É¥¹	½ÑÑ½´è€ÈÈ°(€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄÐ°‰½É‘•Èè€ÅÁàÍ½±¥€‘í‰½É‘•ÉY…Éõ€°‰…­É½Õ¹è‰Y…È°(€€€€€€€€€€€€€Ñ•áÑ•½É…Ñ¥½¸è€‰¹½¹”ˆ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™±•áM¡É¥¹¬è€Àõôø(€€€€€€€€€€€€€€ñI…‘¥…±…Õ”(€€€€€€€€€€€€€€€Ù…±Õ”õíµ½µ•¹Ð¹½µÁ±•Ñ•‘ô(€€€€€€€€€€€€€€€µ…àõí5…Ñ ¹µ…à¡µ½µ•¹Ð¹Ñ½Ñ…°°€Ä¥ô(€€€€€€€€€€€€€€€Í¥é”õìÔÉô(€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õìÕô(€€€€€€€€€€€€€€€Ñ¡É•Í¡½±‘Ìõímìµ¥¸è€À°½±½Èõuô(€€€€€€€€€€€€€€€‘ÕÉ…Ñ¥½¸õìÀ¸áô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™±•àè€Ä°µ¥¹]¥‘Ñ è€Àõôø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€àÀÀ°½±½Èõôø(€€€€€€€€€€€€€€€í¥ÍI•…‘ä(€€€€€€€€€€€€€€€€€€üI•…‘ä™½È€‘íµ½µ•¹Ð¹¹•áÑMÑ…•ôƒŠP€‘íµ½µ•¹Ð¹½µÁ±•Ñ•‘ô¼‘íµ½µ•¹Ð¹Ñ½Ñ…±ôµ¥±•ÍÑ½¹•Í€(€€€€€€€€€€€€€€€€€€è¡•­±¥ÍÐ‘½¹”™½È€‘íµ½µ•¹Ð¹ÕÉÉ•¹ÑMÑ…•1…‰•°€üü€ˆ‰ôƒŠP•Ù¥‘•¹”ÍÑ¥±°Ñ¡¥¹ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¹Q½Àè€Èõôø(€€€€€€€€€€€€€€€í¥ÍI•…‘ä(€€€€€€€€€€€€€€€€€€ü5¥±•ÍÑ½¹•Ì‘½¹”°•Ù¥‘•¹”…ÁÑÕÉ•°É•™±•Ñ¥½¹Ì‰…¬¥ÐÕÀ¸I•…‘äÑ¼É•Ù¥•Ü€‘íµ½µ•¹Ð¹¹•áÑMÑ…•ôý€(€€€€€€€€€€€€€€€€€€èµ½µ•¹Ð¹É•…Í½¸ñð(€€€€€€€€€€€€€€€€€€€€¡µ½µ•¹Ð¹•Ù¥‘•¹•Q½Ñ…°(€€€€€€€€€€€€€€€€€€€€€€ü€‘íµ½µ•¹Ð¹•Ù¥‘•¹•¥±±•€üü€Áô¼‘íµ½µ•¹Ð¹•Ù¥‘•¹•Q½Ñ…±ô•Ù¥‘•¹”¥Ñ•µÌ…ÁÑÕÉ•Í¼™…ÈƒŠPÑ¡¥Ì¥Ì¹••ÍÍ…ÉäÝ½É¬°¹½ÐÁÉ½½˜å•Ð¹€(€€€€€€€€€€€€€€€€€€€€€€èe½ÔÙ”™¥¹¥Í¡•Ñ¡”¡•­±¥ÍÐƒŠPÑ¡…ÐÌ¹••ÍÍ…Éä°¹½ÐÁÉ½½˜¸M•”Ý¡…ÐÌµ¥ÍÍ¥¹œ¹€¥ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÄÄ°™±•áM¡É¥¹¬è€À°½±½È°™½¹Ñ]•¥¡Ðè€ÜÀÀõôùI•Ù¥•ÜƒŠHð½ÍÁ…¸ø(€€€€€€€€€€ð½„ø(€€€€€€€€¤ì(€€€€€ô¤ ¥ô(€€€€€€ð½‘¥Øø((€€€€€ì¼¨ƒŠRŠR AÉ¼µµ½‘”¥¹Ñ•±±¥•¹”ƒŠP‘•±¥‰•É…Ñ•±ä=UQM%Ñ¡”•Ù•¹¥¹œ€‰M¡½Ü(€€€€€€€€€€€€Ñ…Í¬ˆ½±±…ÁÍ”…‰½Ù”¸AÉ¼¥ÌÑ¡”™½Õ¹‘•ÈÌ½Ý¸Á•ÉÍ¥ÍÑ•¹Ð(€€€€€€€€€€€€¡½¥”€¡Ñ¡”Ñ½±”¥¸Ñ¡”¡•…‘•È¤°¹½ÐÍ½µ•Ñ¡¥¹œÑ¡…ÐÍ¡½Õ±(€€€€€€€€€€€€¼‘…É¬©ÕÍÐ‰•…ÕÍ”Ñ¡”Ñ…Í¬É•½µµ•¹‘…Ñ¥½¸¥ÌÑÕ­•‰•¡¥¹(€€€€€€€€€€€€„Á¥±°™½ÈÑ¡”•Ù•¹¥¹œ¸ƒŠRŠR €¨½ô(€€€€€íÕ¥5½‘”€ôôô€‰ÁÉ¼ˆ€˜˜…Ñ¥½¹…Ñ„ü¹¥¹Ñ•±±¥•¹”€ü€ (€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰É¥ˆ°É¥‘Q•µÁ±…Ñ•½±Õµ¹Ìè¥Í5½‰¥±”€ü€‰µ¥¹µ…à À°€Å™È¤ˆ€è€‰µ¥¹µ…à À°€Å™È¤€ÌÀÑÁàˆ°…Àè€ÄÐ°µ…É¥¹Q½Àè€ÄÐ°µ…É¥¹	½ÑÑ½´è€ÄÐõôø(€€€€€€€€€€ñ‘¥Øøñ]¡…Ñ¡…¹•‘…É¥Ñ•µÌõí…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹”¹Ý¡…Ñ}¡…¹•‘ô€¼øñ‘¥ØÍÑå±”õíìµ…É¥¹Q½Àè€ÄÐõôøñ%¹Ñ•±±¥•¹•A…¹•°‘…Ñ„õí…Ñ¥½¹…Ñ„¹¥¹Ñ•±±¥•¹•ô½¹MÝ…Àõí¡…¹‘±•MÝ…Á±Ñ•É¹…Ñ¥Ù•ôÉ••¹Ñ=ÕÑ½µ•ÌõíÉ••¹Ñ=ÕÑ½µ•Íô€¼øð½‘¥Øøð½‘¥Øø(€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°…Àè€ÄÐõôøñI¥Í­Í…ÁÍ…ÉÍ¥¹…±ÌõíÍÕÁÁ½ÉÑ¥¹M¥¹…±Íô€¼øð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€¤€è¹Õ±±ô((€€€€€ì¼¨	•å½¹Ñ¡”€Ì¡…¹•ÌƒŠP1½½À9…ÉÉ…Ñ¥Ù”€¡Ñ¡”€à¸ÔÕ¹±½¬¤€¨½ô(€€€€€€ñ1½½Á9…ÉÉ…Ñ¥Ù”(€€€€€€€É•™±•Ñ¥½¹½Õ¹Ðõì  ¤€ôøì(€€€€€€€€€ÑÉäì(€€€€€€€€€€€É•ÑÕÉ¸Á…ÉÍ•%¹Ð¡ÍÑ½É…”¹•Ð¡‰µ}É•™±•Ñ¥½¹}½Õ¹Ñ|‘í±½…±…å-•ä ¥õ€¤€üü€ˆÀˆ°€ÄÀ¤ì(€€€€€€€€€ô…Ñ ì(€€€€€€€€€€€É•ÑÕÉ¸€Àì(€€€€€€€€€ô(€€€€€€€ô¤ ¥ô(€€€€€€€Ñ…Í­Í½µÁ±•Ñ•õíÁÉ½©•Ðü¹Ñ…Í­Í½µÁ±•Ñ•€üü€Áô(€€€€€€¼ø((€€€€€ì¼¨ƒŠRŠR AÕÍ Á•Éµ¥ÍÍ¥½¸ÁÉ½µÁÐƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR €¨½ô(€€€€€€ñ¹¥µ…Ñ•AÉ•Í•¹”ø(€€€€€€€íÍ¡½ÝAÕÍ¡AÉ½µÁÐ€˜˜€ (€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€­•äô‰ÁÕÍ µÁÉ½µÁÐˆ(€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÈÐõô(€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€€€€€•á¥Ðõíì½Á…¥Ñäè€À°äè€ÄØõô(€€€€€€€€€€€ÑÉ…¹Í¥Ñ¥½¸õíì‘ÕÉ…Ñ¥½¸è€À¸ÌÔ°•…Í”èlÀ¸ÄØ°€Ä°€À¸Ì°€Åtõô(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€Á½Í¥Ñ¥½¸è€‰™¥á•ˆ°(€€€€€€€€€€€€€‰½ÑÑ½´è¥Í5½‰¥±”€ü€àÀ€è€ÌÈ°(€€€€€€€€€€€€€±•™Ðè€ˆÔÀ”ˆ°(€€€€€€€€€€€€€ÑÉ…¹Í™½É´è€‰ÑÉ…¹Í±…Ñ•` ´ÔÀ”¤ˆ°(€€€€€€€€€€€€€Ý¥‘Ñ è¥Í5½‰¥±”€ü€‰…±Œ ÄÀÀ”€´€ÌÉÁà¤ˆ€è€ÌàÀ°(€€€€€€€€€€€€€é%¹‘•àè€äää°(€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄØ°(€€€€€€€€€€€€€‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•È¤ˆ°(€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÈ¤ˆ°(€€€€€€€€€€€€€‰…­‘É½Á¥±Ñ•Èè€‰‰±ÕÈ ÈÁÁà¤ˆ°(€€€€€€€€€€€€€]•‰­¥Ñ	…­‘É½Á¥±Ñ•Èè€‰‰±ÕÈ ÈÁÁà¤ˆ°(€€€€€€€€€€€€€‰½áM¡…‘½Üè€ˆÀ€ÄÙÁà€ÐáÁàÉ‰„ À°À°À°À¸Ø¤ˆ°(€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄáÁà€ÈÁÁàˆ°(€€€€€€€€€€€€€‘¥ÍÁ±…äè€‰™±•àˆ°(€€€€€€€€€€€€€™±•á¥É•Ñ¥½¸è€‰½±Õµ¸ˆ°(€€€€€€€€€€€€€…Àè€ÄÈ°(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…±¥¹%Ñ•µÌè€‰™±•àµÍÑ…ÉÐˆ°…Àè€ÄÀõôø(€€€€€€€€€€€€€€ñÍÁ…¸ÍÑå±”õíì™½¹ÑM¥é”è€ÈÀ°™±•áM¡É¥¹¬è€ÀõôûÂ~RPð½ÍÁ…¸ø(€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€ÜÀÀ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐ¤ˆ°µ…É¥¹	½ÑÑ½´è€Ðõôø(€€€€€€€€€€€€€€€€€•Ðå½ÕÈ•Ù•¹¥¹œ¹Õ‘”(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€ñÀÍÑå±”õíì™½¹ÑM¥é”è€ÄÈ°½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÌ¤ˆ°µ…É¥¸è€À°±¥¹•!•¥¡Ðè€Ä¸ÔÔõôø(€€€€€€€€€€€€€€€€€	Õ¥±‘5¥¹¡•­Ì¥¸…Ð€áÁ´Ñ¼Í•”¥˜å½Ô™½±±½Ý•Ñ¡É½Õ ¸=¹”Ñ…ÀÑ¼•¹…‰±”ƒŠPå½Ô…¸ÑÕÉ¸¥Ð½™˜…¹åÑ¥µ”¸(€€€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ñ‘¥ØÍÑå±”õíì‘¥ÍÁ±…äè€‰™±•àˆ°…Àè€àõôø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÙ½¥É•ÅÕ•ÍÑAÕÍ¡A•Éµ¥ÍÍ¥½¸ ¥ô(€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€™±•àè€Ä°(€€€€€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄÁÁà€Àˆ°(€€€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°(€€€€€€€€€€€€€€€€€‰½É‘•Èè€‰¹½¹”ˆ°(€€€€€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ…•¹Ð¤ˆ°(€€€€€€€€€€€€€€€€€½±½Èè€ˆŒÀÀÀˆ°(€€€€€€€€€€€€€€€€€™½¹Ñ]•¥¡Ðè€ÜÀÀ°(€€€€€€€€€€€€€€€€€™½¹ÑM¥é”è€ÄÌ°(€€€€€€€€€€€€€€€€€ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°(€€€€€€€€€€€€€€€€€™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°(€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€¹…‰±”•Ù•¹¥¹œ¡•¬µ¥¸(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑM¡½ÝAÕÍ¡AÉ½µÁÐ¡™…±Í”¥ô(€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€Á…‘‘¥¹œè€ˆÄÁÁà€ÄÑÁàˆ°(€€€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÄÀ°(€€€€€€€€€€€€€€€€€‰½É‘•Èè€ˆÅÁàÍ½±¥Ù…È ´µ‰´µ‰½É‘•ÈÈ¤ˆ°(€€€€€€€€€€€€€€€€€‰…­É½Õ¹è€‰Ù…È ´µ‰´µ‰œÌ¤ˆ°(€€€€€€€€€€€€€€€€€½±½Èè€‰Ù…È ´µ‰´µÑ•áÐÐ¤ˆ°(€€€€€€€€€€€€€€€€€™½¹Ñ]•¥¡Ðè€ØÀÀ°(€€€€€€€€€€€€€€€€€™½¹ÑM¥é”è€ÄÈ°(€€€€€€€€€€€€€€€€€ÕÉÍ½Èè€‰Á½¥¹Ñ•Èˆ°(€€€€€€€€€€€€€€€€€™½¹Ñ…µ¥±äè€‰¥¹¡•É¥Ðˆ°(€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€9½Ð¹½Ü(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€€€¥ô(€€€€€€ð½¹¥µ…Ñ•AÉ•Í•¹”ø((€€€€€ì¼¨ƒŠRŠR 5½É¹¥¹œ	É¥•™¥¹œµ½‘…°ƒŠP™¥ÉÍÐ½Á•¸½˜Ñ¡”‘…ä°Í•ÉÙ•Èµ…Ñ•ƒŠRŠRŠR €¨½ô(€€€€€íÍ¡½Ý	É¥•™¥¹5½‘…°€˜˜€¡µ½É¹¥¹	É¥•™¥¹œñð‰É¥•™¥¹Ù…¥±…‰±”¤€˜˜€ (€€€€€€€€ñ5½É¹¥¹	É¥•™¥¹5½‘…°(€€€€€€€€€‰É¥•™¥¹œõíµ½É¹¥¹	É¥•™¥¹ô(€€€€€€€€€¥ÍA…åÝ…±±•õì…Á±…¹1½…‘¥¹œ€˜˜Á±…¸€ôôô€‰™É•”‰ô(€€€€€€€€€½¹¥Íµ¥ÍÌõì ¤€ôøì(€€€€€€€€€€€Í•ÑM¡½Ý	É¥•™¥¹5½‘…°¡™…±Í”¤ì(€€€€€€€€€€€½¹ÍÐÑ½‘…ä€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤¹Í±¥” À°€ÄÀ¤ì(€€€€€€€€€€€™•Ñ  ˆ½…Á¤½™½Õ¹‘•Èµµ•µ½Éäˆ°ì(€€€€€€€€€€€€€µ•Ñ¡½è€‰AQ ˆ°(€€€€€€€€€€€€€É•‘•¹Ñ¥…±Ìè€‰¥¹±Õ‘”ˆ°(€€€€€€€€€€€€€¡•…‘•ÉÌèì€‰½¹Ñ•¹ÐµQåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆô°(€€€€€€€€€€€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ì‰É¥•™¥¹}‘¥Íµ¥ÍÍ•‘}‘…Ñ”èÑ½‘…äô¤°(€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€¹Ñ¡•¸¡…Íå¹Œ€¡É•Ì¤€ôøì(€€€€€€€€€€€€€€€¥˜€ …É•Ì¹½¬¤ì(€€€€€€€€€€€€€€€€€½¹ÍÐ‰½‘ä€ô…Ý…¥ÐÉ•Ì¹©Í½¸ ¤¹…Ñ   ¤€ôø¹Õ±°¤ì(€€€€€€€€€€€€€€€€€½¹Í½±”¹•ÉÉ½È ‰…¥±•Ñ¼Á•ÉÍ¥ÍÐ‰É¥•™¥¹œ‘¥Íµ¥ÍÍ…°èˆ°É•Ì¹ÍÑ…ÑÕÌ°‰½‘äü¹•ÉÉ½È¤ì(€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€¹…Ñ  ¡•ÉÈ¤€ôø½¹Í½±”¹•ÉÉ½È ‰…¥±•Ñ¼Á•ÉÍ¥ÍÐ‰É¥•™¥¹œ‘¥Íµ¥ÍÍ…°èˆ°•ÉÈ¤¤ì(€€€€€€€€€õô(€€€€€€€€¼ø(€€€€€€¥ô(€€€€€íÁÉ½©•Ðü¹¥€˜˜€…É•½Ù•ÉåÑ¥Ù”€˜˜€ (€€€€€€€€ñ‘¥ØÍÑå±”õíìµ…á]¥‘Ñ è€àÈÀ°µ…É¥¸è€ˆÀ…ÕÑ¼ˆ°Á…‘‘¥¹œè€ˆÀ€ÈÑÁà€ÈÑÁàˆõôø(€€€€€€€€€€ñM¥¹…±…ÁÑÕÉ•½É´(€€€€€€€€€€€ÁÉ½©•Ñ%õíÁÉ½©•Ð¹¥‘ô(€€€€€€€€€€€½¹1½•õì ¤€ôøì(€€€€€€€€€€€€€™•Ñ ¡€½…Á¤½É¥Í¬µÍ¥¹…±ÌýÁÉ½©•Ñ%ô‘í•¹½‘•UI%½µÁ½¹•¹Ð¡ÁÉ½©•Ð¹¥¥õ€°ì…¡”è€‰¹¼µÍÑ½É”ˆô¤(€€€€€€€€€€€€€€€€¹Ñ¡•¸¡È€ôøÈ¹½¬€üÈ¹©Í½¸ ¤€è¹Õ±°¤(€€€€€€€€€€€€€€€€¹Ñ¡•¸ ¡èì½¬üè‰½½±•…¸ì…ÍÍ•ÍÍµ•¹Ðüè¡ÕÉ¹I¥Í­ÍÍ•ÍÍµ•¹Ðôð¹Õ±°¤€ôøì(€€€€€€€€€€€€€€€€€¥˜€¡ü¹½¬€˜˜¹…ÍÍ•ÍÍµ•¹Ð¤Í•ÑI¥Í­ÍÍ•ÍÍµ•¹Ð¡¹…ÍÍ•ÍÍµ•¹Ð¤ì(€€€€€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€€€¹…Ñ   ¤€ôøíô¤ì(€€€€€€€€€€€€€Í•ÑM¥¹…±!¥ÍÑ½ÉåI•™É•Í¡-•ä ¡¬¤€ôø¬€¬€Ä¤ì(€€€€€€€€€€€õô(€€€€€€€€€€¼ø(€€€€€€€€€€ñM¥¹…±!¥ÍÑ½Éå1¥ÍÐ(€€€€€€€€€€€ÁÉ½©•Ñ%õíÁÉ½©•Ð¹¥‘ô(€€€€€€€€€€€É•™É•Í¡-•äõíÍ¥¹…±!¥ÍÑ½ÉåI•™É•Í¡-•åô(€€€€€€€€€€€½¹ÍÍ•ÍÍµ•¹Ñ¡…¹”õíÍ•ÑI¥Í­ÍÍ•ÍÍµ•¹Ñô(€€€€€€€€€€¼ø(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô(€€€€ð½‘¥Øø(€€¤ì)ô()•áÁ½ÉÐ‘•™…Õ±Ð™Õ¹Ñ¥½¸Q½‘…åA…” ¤ì(€É•ÑÕÉ¸€ (€€€€ñMÕÍÁ•¹Í”™…±±‰…¬õìñ	Õ¥±‘5¥¹‘1½…‘•È€¼ùôø(€€€€€€ñQ½‘…å½¹Ñ•¹Ð€¼ø(€€€€ð½MÕÍÁ•¹Í”ø(€€¤ì(€€€ô
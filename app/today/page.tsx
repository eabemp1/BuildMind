"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useProjectSummariesQuery, useDashboardOverviewQuery, queryKeys } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { computeStartupScore } from "@/lib/buildmind";
import { computeScoreDelta, applyScoreDelta, getXP, recordScore } from "@/lib/scoring";
import { getStoredStreak, incrementDailyStreak, recordTaskCompletion, syncStreakFromServer } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { syncUrgencyFromServer } from "@/lib/urgency";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { notifyReflectPending } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import MorningBriefingCard from "@/components/MorningBriefingCard";
import { PaywallMoment } from "@/components/PaywallMoment";
import { Clock, CheckCircle2, Copy, Check, Flame, Brain, ArrowRight, Sparkles, AlertCircle, TrendingUp, RotateCcw, Zap } from "lucide-react";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { MobileCheckin } from "@/components/MobileCheckin";
import { ProfileCompletenessBar } from "@/components/ProfileCompletenessBar";
import { ReflectSheet } from "@/components/ReflectSheet";
import { LoopNarrative } from "@/components/LoopNarrative";
import { broadcastTabEvent, useTabSync } from "@/lib/tabSync";
import type { MorningBriefing } from "@/lib/founderContext";

type Outcome = "completed" | "blocked" | "partial" | "learned";
type ReflexionMeta = {
  verdict: string;
  criticPersona: string;
  rationale: string;
  loopRan: boolean;
  passedCritic: boolean;
  lastReflectionUsed: boolean;
};

// ── BuildMind Initial Analysis (shown on first task load) ────────────────────
type InitialAnalysis = {
  transition_state: string;
  key_risks: [string, string, string];
  immediate_priorities: [string, string, string];
  health_score: number;
  founder_pattern: string;
  operating_mode: string;
  generated_at: string;
  stage: string;
};

// ── Milestone Break interstitial (fires after milestone/stage change) ────────
type MilestoneBreakResult = {
  trigger: "milestone_complete" | "stage_transition";
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
};

// ── Fallback actions (used when API is unavailable) ──────────────────────────
const DESTINATIONS: Record<string, { icon: string; label: string; url?: string }[]> = {
  idea:       [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "r/startups", url: "https://reddit.com/r/startups/submit" }, { icon: "📱", label: "Text 3 people" }],
  validation: [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💼", label: "LinkedIn DM" }, { icon: "📱", label: "WhatsApp" }],
  prototype:  [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "🎥", label: "Loom → share" }],
  mvp:        [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "WhatsApp" }],
  launch:     [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com/posts/new" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com/post" }, { icon: "📰", label: "Hacker News", url: "https://news.ycombinator.com/submit" }],
  revenue:    [{ icon: "📞", label: "Call directly" }, { icon: "📧", label: "Email personally" }, { icon: "💼", label: "LinkedIn" }, { icon: "𝕏", label: "Twitter DM" }],
};

const STATIC_ACTIONS: Record<string, { action: string; message: string; why: string; time: string; destKey: string }> = {
  idea:       { action: "Talk to 5 people who have this problem before writing any code.", message: "Hey, quick question — what's your biggest challenge with [your problem area]? I'm researching it and would love 10 minutes.", why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.", time: "2 hours", destKey: "idea" },
  validation: { action: "Send this outreach message to 10 potential users today.", message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens? Not pitching, just learning.", why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.", time: "1–2 hours", destKey: "validation" },
  prototype:  { action: "Record a 3-minute Loom walkthrough and send it to 5 people today.", message: "Hey — I've built a rough prototype for [problem]. Would you watch a 3-minute demo and tell me what confuses you most? Brutal honesty only.", why: "Dropbox got 75K signups from a demo video before writing any backend code. Ship something real.", time: "Under 2 hours", destKey: "prototype" },
  mvp:        { action: "Send your working link to one warm contact before end of day.", message: "Hey — I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks?", why: "The version they see today teaches you more than 3 more days of polishing. Ship it.", time: "30 minutes", destKey: "mvp" },
  launch:     { action: "Post on Product Hunt this week — imperfect listing beats no listing.", message: "We just launched [product] on Product Hunt — it [solves problem] for [target users]. Would love your support and brutal feedback: [link]", why: "You don't need to be ready. You need to be visible.", time: "3 hours to prepare", destKey: "launch" },
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
  if (description.trim()) return description.trim().slice(0, 120);
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

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "var(--bm-text3)", "var(--bm-text3)", "var(--bm-text2)", "var(--bm-text)", "var(--bm-text)"];

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
  if (base.length >= 500) return base;
  return `${base}

For context, I am not asking for encouragement or a polite "sounds interesting." I am trying to understand the real workflow before I build more around assumptions. What do you do today, where does it slow down, what workaround have you accepted as normal, and what would make you care enough to change it?

If a call is too much, reply with three bullets:
1. what you do now
2. the most annoying part
3. whether this is painful enough to solve soon

If you are not the right person, one referral would help too.`.trim();
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

function TodayContent() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstSession = searchParams.get("first_session") === "true";
  const queryClient = useQueryClient();
  const { plan } = usePlan();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const { data: overview } = useDashboardOverviewQuery();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  // Ref guard — prevents iOS double-tap from firing handleCheckIn twice
  const checkInFired = useRef(false);
  // Product Improvement #2 — Task-first layout: context collapsed by default
  const [isContextOpen, setIsContextOpen] = useState(false);
  // Product Improvement #1 — Reflect as a bottom-sheet modal (not separate route)
  const [showReflectSheet, setShowReflectSheet] = useState(false);
  const [reflectionCount, setReflectionCount] = useState(() => {
    // Persist across navigation — LoopNarrative uses this for progressive unlock
    try {
      const today = new Date().toISOString().split("T")[0];
      return parseInt(storage.get(`bm_reflection_count_${today}`) ?? "0", 10);
    } catch { return 0; }
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  // AI-personalised action state
  const [aiAction, setAiAction] = useState<ActionData | null>(null);
  const [debtSuppression, setDebtSuppression] = useState<DebtSuppression | null>(null);
  const [aiUsage, setAiUsage] = useState<{ monthlyUsed: number; monthlyLimit: number; unlimited: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Progressive streaming label — shows which agent is currently running
  const [streamLabel, setStreamLabel] = useState<string | null>(null);

  // Initial Analysis — BuildMind first-impression card
  const [initialAnalysis, setInitialAnalysis] = useState<InitialAnalysis | null>(null);
  const [initialAnalysisDismissed, setInitialAnalysisDismissed] = useState(false);

  // Milestone Break interstitial — fires after milestone/stage change
  const [milestoneBreak, setMilestoneBreak] = useState<MilestoneBreakResult | null>(null);
  const [milestoneBreakDismissed, setMilestoneBreakDismissed] = useState(false);

  // Editable draft — pre-filled with real project values
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  // Yesterday's stored reflection — drives the causal thread UI
  const [yesterdayReflection, setYesterdayReflection] = useState<StoredReflection | null>(null);

  // Pattern detection — surfaces after check-in
  const [activePattern, setActivePattern] = useState<{ signal: string; message: string; severity: string } | null>(null);

  // Morning briefing
  const [briefingAvailable, setBriefingAvailable] = useState(false);
  const [morningBriefing, setMorningBriefing] = useState<MorningBriefing | null>(null);

  // Win attribution
  const [revenueDelta, setRevenueDelta] = useState<string>("");
  const [showRevenueField, setShowRevenueField] = useState(false);

  useEffect(() => {
    fetch("/api/ai/usage-status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { monthlyUsed?: number; monthlyLimit?: number; unlimited?: boolean } | null) => {
        if (d) setAiUsage({ monthlyUsed: d.monthlyUsed ?? 0, monthlyLimit: d.monthlyLimit ?? 30, unlimited: d.unlimited ?? false });
      })
      .catch(() => {});

    fetch("/api/morning-briefing", { cache: "no-store" })
      .then(r => r.json().then((body: { ok?: boolean; data?: MorningBriefing; upgradePrompt?: boolean }) => ({ status: r.status, body })))
      .then(({ status, body }) => {
        if (status === 200 && body?.ok && body?.data) {
          setMorningBriefing(body.data);
          setBriefingAvailable(true);
        } else if (status === 403 && body?.upgradePrompt === true) {
          setBriefingAvailable(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    syncStreakFromServer().then(s => setStreak(s)).catch(() => {
      try { setStreak(getStoredStreak()); } catch {}
    });
    syncUrgencyFromServer().catch(() => {});

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);

      // Resolve display name from user metadata
      const meta = data.user?.user_metadata ?? {};
      const name = (meta.full_name as string) || (meta.name as string) || data.user?.email?.split("@")[0] || null;
      setDisplayName(name);

      if (uid) {
        storage.onSignIn(uid);
        const today = new Date().toISOString().split("T")[0];
        const checkinKey = `bm_checkin_done_date_${uid}`;
        const cachedDoneDate = storage.get(checkinKey);
        if (cachedDoneDate === today) setDone(true);

        fetchBehaviorState<{
          checkin_done_date: string;
          today_action: StoredReflection;
        }>(["checkin_done_date", "today_action"]).then(values => {
          if (values.checkin_done_date === today) {
            storage.set(checkinKey, today);
            storage.set("bm_checkin_done_date", today);
            setDone(true);
          }
          if (values.today_action?.outcome) {
            storage.setJSON("bm_today_action", values.today_action);
            setYesterdayReflection(values.today_action);
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
    const project = summaries[0] ?? null;
    if (!project) return;
    const projectId = project.id;
    if (!userId || !projectId) return;

    // ── Fetch pending milestone-break interstitial ──────────────────────────
    // Stored by /api/ai/milestone-break when a milestone or stage transition fires
    fetch("/api/founder-context", { cache: "no-store" })
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

    const today = new Date().toISOString().split("T")[0];
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
    // If either timestamp is missing/zero, treat as cache-miss so we always
    // fetch fresh for new users or after storage is cleared.
    const reflectionIsNewerThanCache = lastReflectionTime > 0 && cachedAt > 0
      ? lastReflectionTime > cachedAt
      : lastReflectionTime > 0;

    const serverCache = await fetchBehaviorState<{ today_action_cache: CachedTodayAction }>(["today_action_cache"]);
    if (
      !reflectionIsNewerThanCache &&
      serverCache.today_action_cache?.date === today &&
      serverCache.today_action_cache?.projectId === projectId &&
      serverCache.today_action_cache?.stage === currentStage &&
      isActionData(serverCache.today_action_cache.data)
    ) {
      storage.setJSON(cacheKey, serverCache.today_action_cache);
      setAiAction({ ...serverCache.today_action_cache.data, isAI: true });
      return;
    }
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
        return;
      }
      if (cached?.date === today && cached?.projectId === projectId && cached?.data) {
        storage.remove(cacheKey);
        storage.remove(`bm_today_action_cache_ts_${userId}`);
      }
    } catch {
      storage.remove(cacheKey);
    }

    setActionLoading(true);

    // ── Fetch Initial Analysis in parallel with today's action ──────────────
    // Shows the "BuildMind Initial Analysis" card on first task load
    const analysisKey = `bm_initial_analysis_${projectId}`;
    const cachedAnalysis = storage.getJSON<InitialAnalysis | null>(analysisKey, null);
    if (cachedAnalysis && cachedAnalysis.stage === currentStage) {
      setInitialAnalysis(cachedAnalysis);
    } else {
      fetch("/api/ai/initial-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((d: { ok?: boolean; data?: InitialAnalysis } | null) => {
          if (d?.ok && d.data) {
            setInitialAnalysis(d.data);
            storage.setJSON(analysisKey, d.data);
          }
        })
        .catch(() => {});
    }

    const pendingMilestones = project.pendingMilestones ?? [];
    const pendingTasks = project.pendingTasks ?? [];

    const requestBody = JSON.stringify({
      userId,
      projectId,
      stage: currentStage,
      pendingMilestones,
      pendingTasks,
      completionRate: project.completion_rate ?? 0,
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
                if (actionData.reflexion?.loopRan) {
                  const cacheValue = { date: today, projectId, stage: currentStage, data: actionData };
                  const nowTs = Date.now().toString();
                  storage.setJSON(cacheKey, cacheValue);
                  if (userId) storage.set(`bm_today_action_cache_ts_${userId}`, nowTs);
                  persistBehaviorState({ today_action_cache: cacheValue });
                }
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
            if (actionData.reflexion?.loopRan) {
              const cacheValue = { date: today, projectId, stage: currentStage, data: actionData };
              const nowTs = Date.now().toString();
              storage.setJSON(cacheKey, cacheValue);
              if (userId) storage.set(`bm_today_action_cache_ts_${userId}`, nowTs);
              persistBehaviorState({ today_action_cache: cacheValue });
            }
          }
        })
        .catch(() => {})
        .finally(() => { if (!signal.aborted) setActionLoading(false); });
      return;
    }

    if (!signal.aborted) setActionLoading(false);
    })();

    return () => { abortController.abort(); };
  }, [summaries, userId]);

  const project = summaries[0] ?? null;
  const score = project ? computeStartupScore({
    ...project,
    xp: getXP(),
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
      const today = new Date().toISOString().split("T")[0];
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
    : aiAction ?? { ...staticAction, isAI: false };
  const destinations = DESTINATIONS[aiAction?.destKey ?? stageKey] ?? DESTINATIONS.idea;

  // Memoize MobileCheckin visibility — avoids calling storage.get() on every
  // render (including each keystroke in the note textarea) and prevents the
  // React Strict Mode double-invoke side-effect in the render phase.
  const checkinSlot = useMemo(() => {
    const h = new Date().getHours();
    const morningKey = `bm_morning_checkin_${new Date().toDateString()}`;
    const eveningKey = `bm_evening_checkin_${new Date().toDateString()}`;
    if (h >= 6 && h < 10 && !storage.get(morningKey)) return { type: "morning" as const, key: morningKey };
    if (h >= 18 && h < 22 && !storage.get(eveningKey)) return { type: "evening" as const, key: eveningKey };
    return null;
  // Re-evaluate once per hour is sufficient; userId dependency ensures it
  // re-runs after storage namespace is initialized for the current user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const OUTREACH_KEYWORDS = ["dm", "message", "send", "email", "outreach", "call", "text", "reach out", "post", "tweet", "share"];
  const isOutreachAction = OUTREACH_KEYWORDS.some(kw =>
    actionData.action.toLowerCase().includes(kw) || actionData.message.toLowerCase().includes(kw)
  );

  // Hydrate draft with real project values on action change
  useEffect(() => {
    setDraftMessage(buildPersonalizedDraftFromAction(actionData.action, actionData.message, productName, targetUsers, problem));
  }, [actionData.action, actionData.message, productName, targetUsers, problem]);

  function handleCopy() {
    navigator.clipboard.writeText(draftMessage ?? actionData.message).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function handleShareMessage() {
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

  async function handleCheckIn() {
    if (!outcome) return;
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
      const todayKey = `bm_task_done_${new Date().toISOString().slice(0, 10)}`;
      storage.set(todayKey, "1");

      try {
        const tcRes = await fetch("/api/founder-context/task-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: project?.startup_stage ?? "Idea", projectId: project?.id }),
        });
        if (tcRes.ok) {
          const tcData = await tcRes.json();
          if (tcData.tasksCompletedTotal != null) {
            const localTotal = parseInt(storage.get("bm_tasks_completed_total") ?? "0", 10) || 0;
            const resolved = Math.max(tcData.tasksCompletedTotal, localTotal);
            storage.set("bm_tasks_completed_total", String(resolved));
          }
          if (tcData.pattern?.signal) {
            setActivePattern(tcData.pattern);
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

      const todayDate = new Date().toISOString().split("T")[0];
      const todayActionState = { action: actionData.action, outcome, note, confidence };
      storage.setJSON("bm_today_action", todayActionState);
      persistBehaviorState({
        today_action: todayActionState,
        checkin_done_date: todayDate,
      });

      if (revenueDelta && parseFloat(revenueDelta) > 0) {
        storage.setJSON("bm_today_revenue_delta", {
          amount: Math.round(parseFloat(revenueDelta) * 100),
          note: actionData.action.slice(0, 120),
          date: new Date().toISOString().split("T")[0],
        });
      }

      if (userId) {
        storage.set(`bm_checkin_done_date_${userId}`, todayDate);
      }
      storage.set("bm_checkin_done_date", todayDate);

      if (userId && project) {
        try {
          const delta = computeScoreDelta(outcome, confidence);
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
          void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
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
              last_active: new Date().toISOString().split("T")[0],
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
        const mappedOutcome = outcomeMap[outcome as string] ?? "partial";
        fetch("/api/ai/reflexion-outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            log_row_id:   aiAction.log_row_id,
            outcome:      mappedOutcome,
            outcome_note: note?.trim() || undefined,
          }),
        }).catch(() => {}); // best-effort — never blocks the check-in
      }

      // ── Increment daily streak ────────────────────────────────────────────
      // Streak is earned here — on Today page action completion — not on Reflect
      // or any other page. incrementDailyStreak() is idempotent for the same day.
      const newStreak = incrementDailyStreak();
      setStreak(newStreak);

      // Notify other open tabs so they show the done state immediately
      const todayBroadcast = new Date().toISOString().split("T")[0];
      broadcastTabEvent({ type: "checkin_done", date: todayBroadcast });
      broadcastTabEvent({ type: "streak_updated", streak: newStreak });

      setDone(true);
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

  // ── Milestone Break interstitial — mandatory checkpoint after milestone/stage change ──
  if (milestoneBreak && !milestoneBreakDismissed) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "40px 16px" : "80px 24px" }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--bm-red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertCircle size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Mandatory checkpoint</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", margin: 0, lineHeight: 1.3 }}>
                You just completed: {milestoneBreak.triggerLabel}
              </p>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 24 }}>
            Before you move to the next milestone, here's what could still kill this.
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
                  borderLeft: "2px solid var(--bm-red)",
                  paddingLeft: 14,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
              >
                <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>{point}</p>
              </motion.div>
            ))}
          </div>

          {/* Recommended action */}
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Recommended action before continuing</p>
            <p style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500, margin: 0, lineHeight: 1.6 }}>→ {milestoneBreak.recommended_action}</p>
          </div>

          {/* Acknowledge button */}
          <button
            onClick={() => {
              const dismissKey = `bm_milestone_break_dismissed_${milestoneBreak.generated_at}`;
              // Optimistically dismiss in UI, revert if server fails
              setMilestoneBreakDismissed(true);
              storage.set(dismissKey, "1");
              fetch("/api/founder-context", {
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
            {outcome === "completed"
              ? "Task done. BuildMind is learning."
              : outcome === "blocked"
              ? "Noted. Tomorrow's task will remove the blocker."
              : outcome === "partial"
              ? "Progress counts. Tomorrow picks up here."
              : "Insight logged. BuildMind adapts."}
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

          {plan === "free" && briefingAvailable && !activePattern && (
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <PaywallMoment trigger="morning_briefing" />
            </div>
          )}

          {plan !== "free" && morningBriefing && !activePattern && (
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <MorningBriefingCard initialBriefing={morningBriefing} />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "center" }}>
            <button onClick={() => setShowReflectSheet(true)} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reflect on today →</button>
            <button onClick={() => router.push("/overview")} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>View full dashboard</button>
          </div>
        </motion.div>

        <div style={{ marginTop: 24, padding: "14px 18px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "0 0 10px" }}>Know a founder who needs this?</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => router.push("/invite")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", background: "var(--bm-accent-dim)", color: "var(--bm-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Invite a founder →
            </button>
            <button onClick={() => router.push("/weekly-share")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
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

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: isMobile ? "0 0 24px" : "20px 8px 48px" }}>

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
          {streak > 1 && (
            <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--bm-text4)" }}>
              {streak}d
            </span>
          )}
        </div>
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
                  &ldquo;{project.problem.slice(0, 100)}{project.problem.length > 100 ? "…" : ""}&rdquo;
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

      {/* ══ BUILDMIND INITIAL ANALYSIS CARD ══════════════════════════════════════
          Shows perceived intelligence on first task load — creates emotional connection
          and trust before the founder even reads their task.
      ═══════════════════════════════════════════════════════════════════════════ */}
      {initialAnalysis && !initialAnalysisDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.35 }}
          style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border2)",
            borderRadius: 14,
            padding: isMobile ? "18px" : "20px 22px",
            marginBottom: 16,
            position: "relative",
          }}
        >
          {/* Dismiss */}
          <button
            onClick={() => setInitialAnalysisDismissed(true)}
            style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", padding: 4, fontSize: 16, lineHeight: 1 }}
            aria-label="Dismiss"
          >×</button>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--bm-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Zap size={13} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>BuildMind Initial Analysis</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", margin: 0, lineHeight: 1.3 }}>
                {initialAnalysis.transition_state.charAt(0).toUpperCase() + initialAnalysis.transition_state.slice(1)}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Key Risks */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Key Risks</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {initialAnalysis.key_risks.map((risk, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--bm-amber)", flexShrink: 0, marginTop: 5 }} />
                    <p style={{ fontSize: 12, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{risk}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Immediate Priorities */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Immediate Priorities</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {initialAnalysis.immediate_priorities.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--bm-accent)", flexShrink: 0, marginTop: 5 }} />
                    <p style={{ fontSize: 12, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{p}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom stats row */}
          <div style={{ display: "flex", gap: 0, borderRadius: 10, border: "1px solid var(--bm-border)", overflow: "hidden" }}>
            {[
              { label: "Startup Health", value: `${initialAnalysis.health_score}/100` },
              { label: "Founder Pattern", value: initialAnalysis.founder_pattern },
              { label: "Suggested Mode", value: initialAnalysis.operating_mode },
            ].map((stat, i, arr) => (
              <div key={stat.label} style={{ flex: 1, padding: "10px 12px", borderRight: i < arr.length - 1 ? "1px solid var(--bm-border)" : "none" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 3px" }}>{stat.label}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--bm-text)", margin: 0, lineHeight: 1.3 }}>{stat.value}</p>
              </div>
            ))}
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
          mrr:            project?.mrr ?? 0,
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
      {plan === "free" && briefingAvailable && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginBottom: 16 }}>
          <PaywallMoment trigger="morning_briefing" />
        </motion.div>
      )}

      {plan !== "free" && morningBriefing && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginBottom: 16 }}>
          <MorningBriefingCard initialBriefing={morningBriefing} />
        </motion.div>
      )}

      {/* ══ HERO HEADER ══════════════════════════════════════════════════════════ */}
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

          {streak > 1 && (
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
                  "{yesterdayReflection.action.slice(0, 100)}{yesterdayReflection.action.length > 100 ? "…" : ""}"
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
                  {yesterdayCausal}
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
                {debtSuppression.debtMessage}
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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        style={{
          padding: 1,
            borderRadius: 12,
            background: "var(--bm-border2)",
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
              <span style={{ fontSize: 11, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--bm-accent)", opacity: 0.6, animation: "bm-pulse 1.2s ease-in-out infinite" }} />
                {streamLabel ?? "Calibrating..."}
              </span>
            )}
            {!actionData.isAI && !actionLoading && (
              <span style={{ fontSize: 10, color: "var(--bm-text4)", fontStyle: "italic" }}>
                Baseline objective
              </span>
            )}
            <span style={{ fontSize: 11, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
              <Clock size={11} /> {actionData.time}
            </span>
          </div>

          {/* Primary action */}
          <div style={{
            background: "var(--bm-bg)",
            border: "1px solid var(--bm-border)",
            borderRadius: 10,
            padding: isMobile ? "16px" : "18px 18px",
            marginBottom: 14,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: "var(--bm-accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 500, flexShrink: 0,
              fontFamily: "'DM Mono', monospace",
            }}>01</div>
            <div>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 7 }}>
                Primary Objective
              </div>
              <p style={{ fontSize: isMobile ? 20 : 22, fontWeight: 400, color: "var(--bm-text)", lineHeight: 1.42, margin: "0 0 8px", letterSpacing: "-0.025em" }}>
                {actionData.action}
              </p>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 400, margin: 0, lineHeight: 1.55 }}>
                {isOutreachAction
                  ? "Execute this before opening the rest of the day. The system will learn from the result."
                  : "This is the highest-leverage operating move for the current stage. Everything else is secondary."}
              </p>
            </div>
          </div>

          {/* Script instruction */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            padding: "8px 12px", borderRadius: 9,
            background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
          }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 1px" }}>
                {isOutreachAction ? "Prepare the message" : "Prepare the script"}
              </p>
              <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: 0 }}>
                {isOutreachAction
                  ? "Project context is pre-filled. Adjust only what improves clarity."
                  : "Use the script as written unless the context is wrong."}
              </p>
            </div>
          </div>

          {/* Why — with reflexion rationale */}
          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: isMobile ? "16px" : "14px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 400, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Mono', monospace" }}>
              <Brain size={10} color="var(--bm-text3)" /> Strategic rationale
            </div>
            <p style={{ fontSize: isMobile ? 14 : 13, color: "var(--bm-text2)", margin: "0 0 10px", lineHeight: 1.6 }}>
              {actionData.reflexion?.rationale ?? actionData.why}
            </p>
            {actionData.reflexion?.lastReflectionUsed && (
              <div style={{ fontSize: 11, color: "var(--bm-text3)", borderTop: "1px solid var(--bm-border)", paddingTop: 10 }}>
                Your yesterday's reflection shaped this recommendation.
              </div>
            )}
          </div>

          {/* ── Message template — pre-filled with real project values ── */}
          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: isMobile ? "16px" : "14px 16px" }}>
            <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexDirection: isMobile ? "column" : "row" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {isOutreachAction ? "Execution draft" : "Execution script"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: isMobile ? "100%" : "auto" }}>
                <button
                  onClick={() => void handleShareMessage()}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flex: isMobile ? 1 : "0 0 auto" }}
                >
                  {shared ? <><Check size={11} color="var(--bm-accent)" /> Shared</> : <>↗ Share</>}
                </button>
                <button onClick={handleCopy}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flex: isMobile ? 1 : "0 0 auto" }}>
                  {copied ? <><Check size={11} color="var(--bm-accent)" /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
            </div>
            {isOutreachAction ? (
              <textarea
                value={draftMessage ?? ""}
                onChange={e => setDraftMessage(e.target.value)}
                rows={4}
                style={{ width: "100%", background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)", borderRadius: 9, padding: "10px 13px", fontSize: isMobile ? 14 : 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, transition: "border-color 0.15s" }}
                onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
                onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
              />
            ) : (
              <p style={{ fontSize: isMobile ? 14 : 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{draftMessage ?? actionData.message}&rdquo;</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Destinations ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: isMobile ? "18px" : "20px 24px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "var(--bm-bg4)", color: "var(--bm-text3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, flexShrink: 0,
          }}>3</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>Send it — pick one channel below</div>
        </div>
        <p style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 14, lineHeight: 1.5, paddingLeft: 30 }}>
          {targetUsers
            ? <>Reach your <strong style={{ color: "var(--bm-text3)", fontWeight: 500 }}>{targetUsers}</strong> directly. At least 3 people. Done counts even if they don't reply.</>
            : "At least 3 people. Done counts as done even if they don't reply. Replies are a bonus."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 9 }}>
          {destinations.map(d => (
            <a key={d.label} href={d.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: isMobile ? "16px 8px" : "14px 8px", borderRadius: 12, border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bm-border2)"; e.currentTarget.style.background = "var(--bm-bg4)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; e.currentTarget.style.background = "var(--bm-bg3)"; }}>
              <span style={{ fontSize: 22 }}>{d.icon}</span>
              <span style={{ fontSize: 11, color: "var(--bm-text3)", textAlign: "center", lineHeight: 1.3 }}>{d.label}</span>
            </a>
          ))}
        </div>
      </motion.div>

      {/* ── Check-in ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: isMobile ? "18px" : "20px 24px" }}>

        {/* Stage motivator */}
        {project?.startup_stage && (
          <p
            style={{
              fontSize: 12,
              color: "var(--bm-text3)",
              marginBottom: 14,
              lineHeight: 1.5,
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
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20, overflow: "hidden" }}>
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

        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>How did it go?</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9, marginBottom: 18 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setOutcome(chip.id)}
              style={{ padding: isMobile ? "14px" : "12px 14px", borderRadius: 10, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`, background: outcome === chip.id ? chip.bg : "var(--bm-bg3)", color: outcome === chip.id ? chip.color : "var(--bm-text3)", fontSize: isMobile ? 14 : 13, fontWeight: outcome === chip.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
              {chip.label}
            </button>
          ))}
        </div>

        {/* Structured skip reasons: shown when blocked/partial, feeds the learning loop */}
        {(outcome === "blocked" || outcome === "partial") && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 8, fontWeight: 500 }}>
              What got in the way? <span style={{ fontWeight: 400, opacity: 0.7 }}>(helps BuildMind learn)</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {[
                { label: "Not the right time", value: "timing" },
                { label: "Wrong platform", value: "platform" },
                { label: "Too hard today", value: "difficulty" },
                { label: "I already did this", value: "duplicate" },
                { label: "Missing context / info", value: "missing_context" },
                { label: "Lost motivation", value: "motivation" },
              ].map(reason => (
                <button
                  key={reason.value}
                  onClick={() => setNote(prev => prev === reason.label ? "" : reason.label)}
                  style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 11,
                    border: `1px solid ${note === reason.label ? "var(--bm-border3)" : "var(--bm-border)"}`,
                    background: note === reason.label ? "var(--bm-bg4)" : "var(--bm-bg3)",
                    color: note === reason.label ? "var(--bm-text)" : "var(--bm-text3)",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}>
                  {reason.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confidence */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 10 }}>
            Confidence level: <span style={{ color: CONFIDENCE_COLORS[confidence], fontWeight: 600 }}>{CONFIDENCE_LABELS[confidence]}</span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => setConfidence(v)}
                style={{ flex: 1, height: 32, borderRadius: 9, border: `1px solid ${confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-border)"}`, background: confidence === v ? `${CONFIDENCE_COLORS[v]}15` : "var(--bm-bg3)", color: confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-text3)", fontSize: 12, fontWeight: confidence === v ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What happened? (optional)"
          style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: isMobile ? "13px 14px" : "10px 14px", fontSize: isMobile ? 16 : 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.55, transition: "border-color 0.15s", marginBottom: 14 }}
          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />

        {/* Win attribution */}
        {outcome === "completed" && (
          <div style={{ marginBottom: 14 }}>
            {!showRevenueField ? (
              <button
                onClick={() => setShowRevenueField(true)}
                style={{ background: "none", border: "none", padding: 0, color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textDecorationStyle: "dotted" }}
              >
                + Did this move the revenue needle?
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--bm-text3)", whiteSpace: "nowrap" }}>Revenue added:</span>
                <span style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 600 }}>GHS</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={revenueDelta}
                  onChange={e => setRevenueDelta(e.target.value)}
                  placeholder="0"
                  style={{ width: 80, background: "transparent", border: "none", borderBottom: "1px solid var(--bm-border3)", color: "var(--bm-text)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", padding: "2px 0" }}
                />
                <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>/mo</span>
                <button onClick={() => { setShowRevenueField(false); setRevenueDelta(""); }} style={{ background: "none", border: "none", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", padding: 0, fontFamily: "inherit", marginLeft: "auto" }}>✕</button>
              </div>
            )}
          </div>
        )}

        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleCheckIn} disabled={!outcome || submitting}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: !outcome ? "var(--bm-bg4)" : "var(--bm-text)", color: !outcome ? "var(--bm-text3)" : "var(--bm-bg)", fontWeight: 700, fontSize: 14, cursor: !outcome ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {submitting ? "Recording…" : <>Record check-in <ArrowRight size={16} /></>}
        </motion.button>
      </motion.div>
      {/* Product Improvement #1 — Reflect bottom sheet */}
      <ReflectSheet
        open={showReflectSheet}
        onClose={() => setShowReflectSheet(false)}
        onDone={() => {
          setShowReflectSheet(false);
          // Write reflection timestamp so cache-bust logic sees it on this tab
          if (userId) {
            storage.set(`bm_last_reflection_ts_${userId}`, Date.now().toString());
          }
          // Notify other tabs so their cache is also busted
          const todayStr = new Date().toISOString().split("T")[0];
          broadcastTabEvent({ type: "reflection_done", date: todayStr });
          setReflectionCount(c => {
            const next = c + 1;
            try {
              storage.set(`bm_reflection_count_${todayStr}`, String(next));
            } catch {}
            return next;
          });
        }}
        projectStage={project?.startup_stage ?? "Idea"}
        taskAction={actionData?.action}
      />

      {/* Beyond the 3 changes — Loop Narrative (the 8.5 unlock) */}
      <LoopNarrative
        reflectionCount={reflectionCount}
        tasksCompleted={project?.tasksCompleted ?? 0}
      />
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

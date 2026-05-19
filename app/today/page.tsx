"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useProjectSummariesQuery, useDashboardOverviewQuery, queryKeys } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { computeStartupScore } from "@/lib/buildmind";
import { computeScoreDelta, applyScoreDelta, getXP, recordScore } from "@/lib/scoring";
import { fetchAndSyncStoredPlanFromBillingStatus, getStoredStreak, recordTaskCompletion, syncStreakFromServer } from "@/lib/plan";
import { syncUrgencyFromServer } from "@/lib/urgency";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { notifyReflectPending } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import { PaywallMoment } from "@/components/PaywallMoment";
import { Clock, CheckCircle2, Copy, Check, Flame, Brain, ArrowRight, Sparkles, AlertCircle, TrendingUp, RotateCcw } from "lucide-react";
import { storage } from "@/lib/storage";
import { MobileCheckin } from "@/components/MobileCheckin";
import { ProfileCompletenessBar } from "@/components/ProfileCompletenessBar";

type Outcome = "completed" | "blocked" | "partial" | "learned";
type ReflexionMeta = {
  verdict: string;
  criticPersona: string;
  rationale: string;
  loopRan: boolean;
  passedCritic: boolean;
  lastReflectionUsed: boolean;
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
  data?: ActionData;
};

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
  prototype:  [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X\", url: \"https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "🎥", label: "Loom → share" }],
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

const OUTCOME_CHIPS: { id: Outcome; label: string; color: string; bg: string; border: string }[] = [
  { id: "completed", label: "Nailed it ✓",         color: "var(--bm-green)", bg: "var(--bm-accent-dim)",           border: "var(--bm-accent-bd)"            },
  { id: "partial",   label: "Partly done ◐",       color: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)",         border: "rgba(232,160,32,0.22)"          },
  { id: "blocked",   label: "Got blocked ✕",       color: "var(--bm-red)",   bg: "rgba(224,85,85,0.08)",          border: "rgba(224,85,85,0.22)"           },
  { id: "learned",   label: "Learned something ↯", color: "#A78BFA",         bg: "rgba(167,139,250,0.08)",        border: "rgba(167,139,250,0.22)"         },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "var(--bm-red)", "var(--bm-amber)", "var(--bm-text2)", "var(--bm-teal)", "var(--bm-accent)"];

// ── Outcome colour helpers ───────────────────────────────────────────────────
const OUTCOME_META: Record<Outcome, { icon: string; label: string; color: string }> = {
  completed: { icon: "✓", label: "Nailed it",          color: "var(--bm-green)" },
  partial:   { icon: "◐", label: "Partly done",        color: "var(--bm-amber)" },
  blocked:   { icon: "✕", label: "Got blocked",        color: "var(--bm-red)"   },
  learned:   { icon: "↯", label: "Learned something",  color: "#A78BFA"         },
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
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  // AI-personalised action state
  const [aiAction, setAiAction] = useState<ActionData | null>(null);
  const [aiUsage, setAiUsage] = useState<{ monthlyUsed: number; monthlyLimit: number; unlimited: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Editable draft — pre-filled with real project values
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  // Yesterday's stored reflection — drives the causal thread UI
  const [yesterdayReflection, setYesterdayReflection] = useState<StoredReflection | null>(null);

  // Pattern detection — surfaces after check-in
  const [activePattern, setActivePattern] = useState<{ signal: string; message: string; severity: string } | null>(null);

  // Paywall
  const [plan, setPlan] = useState<string>("free");
  const [briefingAvailable, setBriefingAvailable] = useState(false);

  // Win attribution
  const [revenueDelta, setRevenueDelta] = useState<string>("");
  const [showRevenueField, setShowRevenueField] = useState(false);

  useEffect(() => {
    fetchAndSyncStoredPlanFromBillingStatus().then(p => setPlan(p)).catch(() => {});

    fetch("/api/ai/usage-status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { monthlyUsed?: number; monthlyLimit?: number; unlimited?: boolean } | null) => {
        if (d) setAiUsage({ monthlyUsed: d.monthlyUsed ?? 0, monthlyLimit: d.monthlyLimit ?? 30, unlimited: d.unlimited ?? false });
      })
      .catch(() => {});

    fetch("/api/morning-briefing", { cache: "no-store" })
      .then(r => r.json().then((body: { ok?: boolean; data?: unknown; upgradePrompt?: boolean }) => ({ status: r.status, body })))
      .then(({ status, body }) => {
        if (status === 200 && body?.ok && body?.data) {
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
        const today = new Date().toISOString().split("T")[0];
        const checkinKey = `bm_checkin_done_date_${uid}`;
        if (storage.get(checkinKey) === today) {
          setDone(true);
        }
      }
    });

    // Load yesterday's reflection from localStorage so the causal thread is visible
    try {
      const stored = storage.getJSON("bm_today_action", null) as StoredReflection | null;
      if (stored?.outcome) {
        setYesterdayReflection(stored);
      }
    } catch {}
  }, []);

  // Fetch personalised action from AI once we have project data
  useEffect(() => {
    void (async () => {
    const project = summaries[0] ?? null;
    if (!project) return;
    const projectId = project.id;
    if (!userId || !projectId) return;

    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `bm_today_action_cache_${userId}`;
    try {
      const cached = storage.getJSON<CachedTodayAction | null>(cacheKey, null);
      if (cached?.date === today && cached?.projectId === projectId && cached?.data) {
        setAiAction({ ...cached.data, isAI: true });
        return;
      }
    } catch {}

    setActionLoading(true);

    const pendingMilestones = project.pendingMilestones ?? [];
    const pendingTasks = project.pendingTasks ?? [];

    const requestBody = JSON.stringify({
      userId,
      projectId,
      stage: project.startup_stage ?? "Idea",
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
      });

      if (streamRes.ok && streamRes.body) {
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
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

            if (event === "done" && payload && typeof payload === "object") {
              const p = payload as Record<string, unknown>;
              const actionData = { ...p, isAI: true } as ActionData;
              setAiAction(actionData);
              if ((p.reflexion as Record<string, unknown>)?.loopRan) {
                storage.setJSON(cacheKey, { date: today, projectId, data: actionData });
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
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(json => {
          if (json?.success && json?.data) {
            const actionData = { ...json.data, isAI: true };
            setAiAction(actionData);
            if (actionData.reflexion?.loopRan) {
              storage.setJSON(cacheKey, { date: today, projectId, data: actionData });
            }
          }
        })
        .catch(() => {})
        .finally(() => setActionLoading(false));
      return;
    }

    setActionLoading(false);
    })();
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
    }
    storage.set(storageKey, currentStage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.startup_stage]);

  const staticAction = STATIC_ACTIONS[stageKey] ?? STATIC_ACTIONS.idea;
  const actionData = aiAction ?? { ...staticAction, isAI: false };
  const destinations = DESTINATIONS[aiAction?.destKey ?? stageKey] ?? DESTINATIONS.idea;

  const OUTREACH_KEYWORDS = ["dm", "message", "send", "email", "outreach", "call", "text", "reach out", "post", "tweet", "share"];
  const isOutreachAction = OUTREACH_KEYWORDS.some(kw =>
    actionData.action.toLowerCase().includes(kw) || actionData.message.toLowerCase().includes(kw)
  );

  // Hydrate draft with real project values on action change
  useEffect(() => {
    setDraftMessage(hydrateScript(actionData.message, productName, targetUsers, problem));
  }, [actionData.message, productName, targetUsers, problem]);

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

  async function handleCheckIn() {
    if (!outcome) return;
    setSubmitting(true);
    try {
      recordTaskCompletion();
      if (!storage.get("bm_first_task_completed_tracked")) {
        trackFunnelStep("first_task_completed");
        storage.set("bm_first_task_completed_tracked", "1");
      }
      const today = new Date();
      const todayKey = `bm_task_done_${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      storage.set(todayKey, "1");

      try {
        const tcRes = await fetch("/api/founder-context/task-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: project?.startup_stage ?? "Idea" }),
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
      storage.setJSON("bm_today_action", { action: actionData.action, outcome, note, confidence });

      if (revenueDelta && parseFloat(revenueDelta) > 0) {
        storage.setJSON("bm_today_revenue_delta", {
          amount: Math.round(parseFloat(revenueDelta) * 100),
          note: actionData.action.slice(0, 120),
          date: new Date().toISOString().split("T")[0],
        });
      }

      if (userId) {
        localStorage.setItem(`bm_checkin_done_date_${userId}`, todayDate);
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

      setDone(true);
    } finally { setSubmitting(false); }
  }

  if (isLoading) return <BuildMindLoader />;

  // ── Done state ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "36px 0" : "60px 24px", textAlign: "center" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle2 size={28} color="var(--bm-accent)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 10 }}>Check-in recorded</h2>
          <p style={{ fontSize: 14, color: "var(--bm-text3)", marginBottom: 20, lineHeight: 1.6 }}>
            {displayName ? `Come back tomorrow, ${displayName.split(" ")[0]}. Consistency compounds.` : "Come back tomorrow. Consistency compounds."}
          </p>

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
    <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "4px 0 24px" : "28px 24px" }}>

      {/* ── First-session banner ── */}
      {isFirstSession && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 14, padding: isMobile ? "16px" : "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <Sparkles size={16} color="var(--bm-accent)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>
            Your roadmap is ready. <strong style={{ color: "var(--bm-text)" }}>Here's your first action.</strong> Complete it before you do anything else — momentum starts now.
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
      {(() => {
        const h = new Date().getHours();
        const isMorning = h >= 6 && h < 10;
        const isEvening = h >= 18 && h < 22;
        const morningKey = `bm_morning_checkin_${new Date().toDateString()}`;
        const eveningKey = `bm_evening_checkin_${new Date().toDateString()}`;
        const doneMorning = typeof window !== "undefined" && !!localStorage.getItem(morningKey);
        const doneEvening = typeof window !== "undefined" && !!localStorage.getItem(eveningKey);
        if (isMorning && !doneMorning) {
          return (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 16 }}>
              <MobileCheckin type="morning" onComplete={(note) => {
                localStorage.setItem(morningKey, "1");
                fetch("/api/morning-checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => {});
              }} />
            </motion.div>
          );
        }
        if (isEvening && !doneEvening) {
          return (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 16 }}>
              <MobileCheckin type="evening" onComplete={(note) => {
                localStorage.setItem(eveningKey, "1");
                fetch("/api/evening-checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => {});
              }} />
            </motion.div>
          );
        }
        return null;
      })()}

      {/* ── Pre-check-in paywall ── */}
      {plan === "free" && briefingAvailable && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginBottom: 16 }}>
          <PaywallMoment trigger="morning_briefing" />
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PERSONALISED HEADER — greeting + startup context at a glance
      ══════════════════════════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 20 }}>

        {/* Greeting row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "0 0 2px" }}>{greetingLine}</p>
            <h1 style={{ fontSize: isMobile ? 22 : 18, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>
              {productName
                ? <>Here's what moves <span style={{ color: "var(--bm-accent)" }}>{productName}</span> forward today</>
                : "Today's Action"}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streak > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.18)" }}>
                <Flame size={12} color="var(--bm-amber)" />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-amber)" }}>{streak}d streak</span>
              </div>
            )}
          </div>
        </div>

        {/* Target user sub-line */}
        {targetUsers && (
          <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "4px 0 0" }}>
            Serving <strong style={{ color: "var(--bm-text2)", fontWeight: 500 }}>{targetUsers}</strong>
            {project?.startup_stage ? <> · <span style={{ color: "var(--bm-accent)" }}>{project.startup_stage} stage</span></> : null}
          </p>
        )}

        {/* AI usage warning */}
        {aiUsage && !aiUsage.unlimited && (aiUsage.monthlyLimit - aiUsage.monthlyUsed) <= 5 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, background: "rgba(240,108,108,0.06)", border: "1px solid rgba(240,108,108,0.18)", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--bm-red)", fontWeight: 600, flex: 1 }}>
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
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* Left: outcome dot + connector */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 2 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: yesterdayReflection.outcome === "completed" ? "rgba(74,222,128,0.12)"
                  : yesterdayReflection.outcome === "blocked" ? "rgba(239,68,68,0.12)"
                  : yesterdayReflection.outcome === "partial" ? "rgba(245,158,11,0.12)"
                  : "rgba(167,139,250,0.12)",
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
                  background: yesterdayReflection.outcome === "completed" ? "rgba(74,222,128,0.08)"
                    : yesterdayReflection.outcome === "blocked" ? "rgba(239,68,68,0.08)"
                    : yesterdayReflection.outcome === "partial" ? "rgba(245,158,11,0.08)"
                    : "rgba(167,139,250,0.08)",
                  border: `1px solid ${yesterdayReflection.outcome === "completed" ? "rgba(74,222,128,0.2)"
                    : yesterdayReflection.outcome === "blocked" ? "rgba(239,68,68,0.2)"
                    : yesterdayReflection.outcome === "partial" ? "rgba(245,158,11,0.2)"
                    : "rgba(167,139,250,0.2)"}`,
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
                background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
              }}>
                <RotateCcw size={10} color="var(--bm-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11, color: "var(--bm-text2)", margin: 0, lineHeight: 1.55 }}>
                  {yesterdayCausal}
                </p>
              </div>
            </div>
          </div>
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
              background: "var(--bm-accent-dim)", color: "var(--bm-accent)",
              border: "1px solid var(--bm-accent-bd)", fontWeight: 600,
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

      {/* ══════════════════════════════════════════════════════════════════════
          ACTION CARD
      ══════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        style={{
          padding: 1,
          borderRadius: 19,
          background: actionData.isAI
            ? "linear-gradient(135deg, var(--bm-accent-bd) 0%, rgba(74,184,176,0.18) 100%)"
            : "var(--bm-border)",
          marginBottom: 14,
          transition: "background 0.4s",
        }}
      >
        <div style={{ background: "var(--bm-bg2)", borderRadius: 18, padding: isMobile ? "18px" : "24px" }}>

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {project?.startup_stage && (
              <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {project.startup_stage} Stage
              </span>
            )}
            {actionData.isAI ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 20,
                  background: "rgba(167,139,250,0.10)", color: "#a78bfa",
                  border: "1px solid rgba(167,139,250,0.25)", fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Brain size={9} /> 3-agent loop
                </span>
                {actionData.reflexion?.criticPersona && (
                  <span style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 20,
                    background: actionData.reflexion.passedCritic ? "rgba(74,184,176,0.08)" : "rgba(232,160,32,0.08)",
                    color: actionData.reflexion.passedCritic ? "var(--bm-teal)" : "var(--bm-amber)",
                    border: `1px solid ${actionData.reflexion.passedCritic ? "rgba(74,184,176,0.2)" : "rgba(232,160,32,0.2)"}`,
                    fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {actionData.reflexion.passedCritic ? "✓" : "↻"} {actionData.reflexion.criticPersona}
                  </span>
                )}
                {actionData.reflexion?.lastReflectionUsed && (
                  <span style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 20,
                    background: "rgba(139,92,246,0.08)", color: "var(--bm-purple)",
                    border: "1px solid rgba(139,92,246,0.2)", fontWeight: 600,
                  }}>
                    ↺ shaped by yesterday
                  </span>
                )}
              </div>
            ) : actionLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--bm-accent)", opacity: 0.6, animation: "bm-pulse 1.2s ease-in-out infinite" }} />
                  Personalising your task…
                </span>
                <span style={{ fontSize: 10, color: "var(--bm-text4)", paddingLeft: 14 }}>
                  Reading your reflection, milestones, and stage.
                </span>
              </div>
            ) : (
              <span style={{ fontSize: 10, color: "var(--bm-text4)", fontStyle: "italic" }}>
                Fallback task — personalisation unavailable
              </span>
            )}
            <span style={{ fontSize: 11, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
              <Clock size={11} /> {actionData.time}
            </span>
          </div>

          {/* Primary action */}
          <div style={{
            background: "var(--bm-accent-dim)",
            border: "1px solid var(--bm-accent-bd)",
            borderRadius: 12,
            padding: isMobile ? "14px 16px" : "12px 16px",
            marginBottom: 14,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--bm-accent)", color: "var(--bm-text-inv)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, flexShrink: 0,
            }}>1</div>
            <div>
              <p style={{ fontSize: isMobile ? 17 : 15, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.45, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
                {actionData.action}
              </p>
              <p style={{ fontSize: 12, color: "var(--bm-accent)", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                {isOutreachAction
                  ? "This is today's move. Do this before email, Slack, or building anything."
                  : "This is the one task that moves your startup forward today. Everything else waits."}
              </p>
            </div>
          </div>

          {/* Script instruction */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            padding: "8px 12px", borderRadius: 9,
            background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
          }}>
            <span style={{ fontSize: 15 }}>{isOutreachAction ? "✏️" : "📋"}</span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 1px" }}>
                {isOutreachAction ? "👇 Edit this script — personalise the [brackets], then send" : "👇 Copy this script — then send it to at least 3 people today"}
              </p>
              <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: 0 }}>
                {isOutreachAction
                  ? "We've pre-filled your product name and problem. Adjust the name and hit send."
                  : "Don't overthink it. Imperfect and sent beats perfect and unsent."}
              </p>
            </div>
          </div>

          {/* Why — with reflexion rationale */}
          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: isMobile ? "16px" : "14px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <Brain size={10} color="var(--bm-accent)" /> Why this, why today
            </div>
            <p style={{ fontSize: isMobile ? 14 : 13, color: "var(--bm-text2)", margin: "0 0 10px", lineHeight: 1.6 }}>
              {actionData.reflexion?.rationale ?? actionData.why}
            </p>
            {actionData.reflexion?.loopRan && (
              <div style={{
                borderTop: "1px solid var(--bm-border)",
                paddingTop: 10, marginTop: 4,
                display: "flex", flexDirection: "column", gap: 5,
              }}>
                <div style={{ fontSize: 10, color: "var(--bm-text4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                  How this was built
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { label: "A — Generator", desc: "Wrote the task from your founder data", color: "var(--bm-accent)" },
                    { label: `B — ${actionData.reflexion.criticPersona}`, desc: actionData.reflexion.passedCritic ? "Approved ✓" : "Rejected → rebuilt", color: actionData.reflexion.passedCritic ? "var(--bm-teal)" : "var(--bm-amber)" },
                    { label: "C — Refiner", desc: "Sharpened for your stage", color: "var(--bm-purple)" },
                  ].map(agent => (
                    <div key={agent.label} style={{
                      flex: "1 1 120px", padding: "8px 10px", borderRadius: 8,
                      background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
                      minWidth: 100,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: agent.color, marginBottom: 2 }}>{agent.label}</div>
                      <div style={{ fontSize: 10, color: "var(--bm-text4)", lineHeight: 1.4 }}>{agent.desc}</div>
                    </div>
                  ))}
                </div>
                {actionData.reflexion.lastReflectionUsed && (
                  <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: "var(--bm-purple)" }}>↺</span>
                    Your yesterday's reflection shaped what Agent A wrote first.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Message template — pre-filled with real project values ── */}
          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 12, padding: isMobile ? "16px" : "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {isOutreachAction ? "✏️ Your outreach draft — ready to send" : "📋 Your outreach script — copy & send this"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => void handleShareMessage()}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {shared ? <><Check size={11} color="var(--bm-accent)" /> Shared</> : <>↗ Share</>}
                </button>
                <button onClick={handleCopy}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
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

        {/* Progress tracker */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20 }}>
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
                  background: step.done ? "var(--bm-accent)" : step.active ? "var(--bm-bg4)" : "var(--bm-bg3)",
                  color: step.done ? "var(--bm-text-inv)" : step.active ? "var(--bm-text)" : "var(--bm-text4)",
                  border: step.active ? "1px solid var(--bm-border3)" : "none",
                  transition: "all 0.2s",
                }}>
                  {step.done ? "✓" : step.n}
                </div>
                <span style={{ fontSize: 9, color: step.done ? "var(--bm-accent)" : step.active ? "var(--bm-text3)" : "var(--bm-text4)", fontWeight: step.active ? 600 : 400, whiteSpace: "nowrap" }}>
                  {step.label}
                </span>
              </div>
              {i < 3 && (
                <div style={{ flex: 1, height: 1, background: step.done ? "var(--bm-accent-bd)" : "var(--bm-border)", margin: "0 4px", marginBottom: 14, transition: "background 0.3s" }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>How did it go?</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9, marginBottom: 18 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setOutcome(chip.id)}
              style={{ padding: isMobile ? "14px" : "12px 14px", borderRadius: 12, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`, background: outcome === chip.id ? chip.bg : "var(--bm-bg3)", color: outcome === chip.id ? chip.color : "var(--bm-text3)", fontSize: isMobile ? 14 : 13, fontWeight: outcome === chip.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
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
                    border: `1px solid ${note === reason.label ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                    background: note === reason.label ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
                    color: note === reason.label ? "var(--bm-accent)" : "var(--bm-text3)",
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10 }}>
                <span style={{ fontSize: 12, color: "var(--bm-text3)", whiteSpace: "nowrap" }}>Revenue added:</span>
                <span style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 600 }}>GHS</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={revenueDelta}
                  onChange={e => setRevenueDelta(e.target.value)}
                  placeholder="0"
                  style={{ width: 80, background: "transparent", border: "none", borderBottom: "1px solid rgba(74,222,128,0.3)", color: "var(--bm-text)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", padding: "2px 0" }}
                />
                <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>/mo</span>
                <button onClick={() => { setShowRevenueField(false); setRevenueDelta(""); }} style={{ background: "none", border: "none", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", padding: 0, fontFamily: "inherit", marginLeft: "auto" }}>✕</button>
              </div>
            )}
          </div>
        )}

        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleCheckIn} disabled={!outcome || submitting}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: !outcome ? "var(--bm-bg4)" : "var(--grad-primary)", color: !outcome ? "var(--bm-text3)" : "white", fontWeight: 700, fontSize: 14, cursor: !outcome ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {submitting ? "Recording…" : <>Record check-in <ArrowRight size={16} /></>}
        </motion.button>
      </motion.div>
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

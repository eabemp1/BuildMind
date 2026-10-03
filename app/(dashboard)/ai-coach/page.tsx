"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { fetchAndSyncStoredPlanFromBillingStatus, getLimits, incrementDailyStreak } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { trackEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import AIUsageBadge from "@/components/AIUsageBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Send, Brain, Sparkles, Zap, ChevronRight, ArrowUpRight, PanelRight, X } from "lucide-react";
import { withAIErrorBoundary } from "@/components/AIErrorBoundary";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { CoachActionResultCard } from "@/components/coach/CoachActionResultCard";
import { matchCoachAction } from "@/lib/coachActions/matcher";
import { COACH_ACTION_CHIPS, type CoachActionChip } from "@/lib/coachActions/chips";
import { matchNavigation, parseReplyLinks } from "@/lib/coachNavigation";
import type { CoachActionResult } from "@/lib/coachActions/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string[];
  phase?: "thinking" | "writing" | "done";
  error?: boolean;
  /** Reflexion confidence_score (0–1). Badge renders when < 0.75 */
  confidence_score?: number | null;
  /** Optional structured action the coach converged on — only present when
   *  the model named one concrete, time-boxed next step (see coach route's
   *  recommended_action contract). Absent on most replies by design. */
  recommendedAction?: { what_to_do: string; why_now: string; expected_evidence?: string };
  /** Present when the reply was a Coach Action (lib/coachActions) rather
   *  than model-written coaching — rendered as a data card, not prose. */
  actionResult?: CoachActionResult;
};

function buildPlaceholderReasoning(message: string, projectTitle?: string, score?: number): string[] {
  const msg = message.toLowerCase();
  const steps: string[] = [];
  if (projectTitle) steps.push(`Pulling live data for "${projectTitle}"...`);
  else steps.push("Reading your project state...");
  if (msg.includes("stuck") || msg.includes("block")) {
    steps.push("Identifying the specific blocker vs. avoidance pattern...");
    steps.push("Checking execution history for context...");
  } else if (msg.includes("user") || msg.includes("customer")) {
    steps.push("Evaluating user acquisition approach vs. stage...");
    steps.push("Cross-referencing validation data...");
  } else if (msg.includes("today") || msg.includes("priority")) {
    steps.push("Scanning open tasks for highest-leverage action...");
    steps.push(score !== undefined ? `Score is ${score}/100 — weighing effort vs. impact...` : "Weighing effort vs. impact...");
  } else {
    steps.push("Reading between the lines of your question...");
    steps.push(score !== undefined ? `Execution score ${score}/100 — calibrating directness level...` : "Calibrating response to your situation...");
  }
  steps.push("Drafting the most useful response...");
  return steps;
}

const QUICK_PROMPTS = [
  "Am I avoiding the hardest work right now?",
  "What is the single highest-leverage move this week?",
  "Is my recent progress real or just busyness?",
  "If you were the founder, what would you do today?",
  "What behavioral patterns should I be worried about?",
];

// FIX: renamed from *_PER_WEEK — the server (app/api/ai/coach/route.ts,
// FREE_COACH_MESSAGES_PER_DAY) enforces this as a DAILY cap. The client
// counter was previously week-scoped, blocking free users ~7x more
// aggressively than the real server policy. Now both are day-scoped.
const FREE_COACH_MESSAGES_PER_DAY = 3;

function getCoachMessagesToday() {
  return storage.getCoachMessagesToday();
}

function recordCoachMessage() {
  storage.recordCoachMessage();
}

function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <motion.span key={i}
          style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--bm-accent)", display: "inline-block" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1, delay: i * 0.18, repeat: Infinity }} />
      ))}
    </span>
  );
}

function hasHistoryGlobal(o?: { completedTasks?: number; daysSinceLastReflection?: number | null } | null) {
  return (o?.completedTasks ?? 0) > 0 || o?.daysSinceLastReflection != null;
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

function MessageBubble({ msg, onStartAction, onOpen, onRunChip }: { msg: ChatMessage; onStartAction: () => void; onOpen: (href: string) => void; onRunChip: (chip: CoachActionChip) => void }) {
  const isUser = msg.role === "user";
  // Buttons the Coach attached ([[open:...]] / [[run:...]]) are validated against closed allow-lists.
  const parsed = !isUser && msg.phase === "done" ? parseReplyLinks(msg.content) : { text: msg.content, links: [] as ReturnType<typeof parseReplyLinks>["links"] };
  const [expanded, setExpanded] = useState(false);
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-[22px] rounded-br-md border border-[var(--bm-border2)] bg-[var(--bm-bg3)] px-4 py-3 text-[15px] leading-[1.65] text-[var(--bm-text)] sm:max-w-[75%]">
          <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{sanitizeOutput(msg.content)}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex items-start gap-3.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--bm-intel-bd)] bg-[var(--bm-intel-dim)]">
        <Sparkles size={14} color="var(--bm-intel2)" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {msg.reasoning && msg.reasoning.length > 0 && (
          <div>
            <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--bm-border)] bg-transparent px-3 py-1 text-[12px] text-[var(--bm-text3)] hover:text-[var(--bm-text2)]">
              <Brain size={12} />
              {msg.phase === "thinking" ? "Thinking" : "How I got here"}
              <ChevronRight size={12} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                  <div className="mt-2 border-l-2 border-[var(--bm-border2)] pl-3.5">
                    {msg.reasoning.map((step, i) => (
                      <div key={i} className="mb-1.5 text-[13px] leading-relaxed text-[var(--bm-text3)]">{sanitizeOutput(step)}</div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {msg.phase === "thinking" ? (
          <div className="py-1"><ThinkingDots /></div>
        ) : (
          <div className="text-[15.5px] leading-[1.75]" style={{ color: msg.error ? "var(--bm-red)" : "var(--bm-text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {sanitizeOutput(parsed.text)}
          </div>
        )}

        {msg.phase === "done" && msg.actionResult && <CoachActionResultCard result={msg.actionResult} />}

        {parsed.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {parsed.links.map((l, i) => (
              <button key={i} type="button"
                onClick={() => (l.kind === "open" ? onOpen(l.href) : onRunChip(l.chip))}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{ background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontFamily: "inherit" }}>
                {l.label}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        )}

        {msg.phase === "done" && msg.recommendedAction && (
          <div className="rounded-[18px] border border-[var(--bm-accent-bd)] bg-[var(--bm-bg2)] p-5">
            <div className="mb-3 text-[14px] font-semibold text-[var(--bm-accent)]">Recommended next step</div>
            <p className="text-[15px] leading-[1.65] text-[var(--bm-text)]">{sanitizeOutput(msg.recommendedAction.what_to_do)}</p>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--bm-text3)]">
              <span className="font-semibold text-[var(--bm-text2)]">Why now: </span>{sanitizeOutput(msg.recommendedAction.why_now)}
            </p>
            {msg.recommendedAction.expected_evidence && (
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--bm-text3)]">
                <span className="font-semibold text-[var(--bm-text2)]">You will know it worked when: </span>{sanitizeOutput(msg.recommendedAction.expected_evidence)}
              </p>
            )}
            <button onClick={onStartAction}
              className="mt-4 w-full cursor-pointer rounded-[12px] border-0 py-3 text-[14px] font-bold sm:w-auto sm:px-6"
              style={{ background: "var(--bm-accent)", color: "#15130a" }}>
              Start this now
            </button>
          </div>
        )}

        {msg.phase === "done" && (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--bm-text4)]">
            <span>{time}</span>
            {typeof msg.confidence_score === "number" && <ConfidenceBadge score={msg.confidence_score} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AICoachPageInner() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { plan, isLoading: planLoading } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [], isLoading: summariesLoading } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const activeProject = selectActiveProject(summaries, activeProjectId);
  const { data: overview } = useDashboardOverviewQuery(activeProject?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [personality, setPersonality] = useState<"direct" | "supportive" | "challenger">("direct");
  const [memory, setMemory] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [coachMessagesToday, setCoachMessagesToday] = useState(0);
  const [showContext, setShowContext] = useState(false);
  const [activityEvents, setActivityEvents] = useState<Array<{ label: string; occurredAt: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // FIX (checklist item): this used to call computeStartupScore(activeProject)
  // directly, without xp/streak — the same score displayed on Today/Overview
  // for the identical project, at the identical moment, would be up to ~30
  // points higher (xp boost 0-20, streak boost 0-10; see lib/scoring/index.ts).
  // Rather than fix the inputs, the score widget itself is removed below —
  // a chat surface doesn't need a status widget, and deleting it is safer
  // than patching it: no more mismatch, no surface for a duplicate verdict
  // to grow back. buildPlaceholderReasoning falls back to its non-numeric
  // flavor text when score is undefined.
  const limits = getLimits(plan);
  const coachLimit = plan === "free" ? FREE_COACH_MESSAGES_PER_DAY : limits.aiMessagesPerDay;
  const remaining = plan === "free" ? Math.max(0, coachLimit - coachMessagesToday) : Infinity;

  useEffect(() => {
    void fetchAndSyncStoredPlanFromBillingStatus();
  }, []);

  useEffect(() => {
    try { setMemory(storage.getJSON<string[]>("bm_coach_memory", [])); } catch {}
    setCoachMessagesToday(getCoachMessagesToday());
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    fetchBehaviorState<{
      coach_memory: string[];
      coach_streak_date: string;
      ai_personality: "direct" | "supportive" | "challenger";
    }>(["coach_memory", "coach_streak_date", "ai_personality"]).then(values => {
      if (Array.isArray(values.coach_memory)) {
        storage.setJSON("bm_coach_memory", values.coach_memory);
        setMemory(values.coach_memory);
      }
      const today = new Date().toISOString().split("T")[0];
      if (values.coach_streak_date === today) {
        storage.set("bm_coach_streak_date", today);
      }
      if (values.ai_personality === "direct" || values.ai_personality === "supportive" || values.ai_personality === "challenger") {
        setPersonality(values.ai_personality);
      }
    }).catch(() => {});
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Real recent activity for the active project — same activity_log-backed
  // route added for the Projects detail page's "Last activity" card, reused
  // here for Figma's "Recent outcomes" concept. No separate metric-tracking
  // (e.g. "waitlist +40%") exists anywhere, so this shows what's actually
  // logged rather than inventing business-outcome numbers.
  useEffect(() => {
    if (!activeProject?.id) { setActivityEvents([]); return; }
    fetch(`/api/projects/${activeProject.id}/activity`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; events?: Array<{ label: string; occurredAt: string }> }) => {
        if (d.ok && Array.isArray(d.events)) setActivityEvents(d.events);
      })
      .catch(() => {});
  }, [activeProject?.id]);

  async function sendMessage(text?: string, opts?: { action?: { id: string; params: Record<string, unknown> } }) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    // Coach Actions cost no AI tokens, so they don't spend the free plan's
    // daily coaching allowance — the server skips the cap for them too
    // (app/api/ai/coach/route.ts). matchCoachAction is the same pure function
    // the server runs, so the two can't disagree about what counts as one.
    // "Take me to Progress" — the Coach just does it: no model call, no allowance spent.
    const navTarget = !opts?.action ? matchNavigation(msg) : null;
    if (navTarget) {
      setInput("");
      setMessages(prev => [...prev,
        { id: Date.now().toString(), role: "user", content: msg },
        { id: (Date.now() + 1).toString(), role: "assistant", content: `Opening ${navTarget.label}…`, phase: "done" },
      ]);
      setTimeout(() => router.push(navTarget.href), 350);
      return;
    }
    const isAction = Boolean(opts?.action) || matchCoachAction(msg) !== null;
    if (remaining <= 0 && !planLoading && plan === "free" && !isAction) { showLimitModal("aiCoach"); return; }
    if (!userId) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Please sign in again before using AI Coach.", phase: "done", error: true }]);
      return;
    }
    if (!activeProject?.id) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Create or select a project first so I can coach against real context.", phase: "done", error: true }]);
      return;
    }
    setInput("");
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: msg };
    const placeholderReasoning = buildPlaceholderReasoning(msg, activeProject?.title);
    const thinkingMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: "", phase: "thinking", reasoning: placeholderReasoning };
    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          projectId: activeProject.id,
          message: msg,
          project: activeProject,
          overview,
          memory,
          personality,
          messages,
          action: opts?.action,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) throw new Error(payload?.error ?? "Coach unavailable");

      // A Coach Action reply: render the data card and stop. Deliberately
      // skips the coaching-message counter, achievements, streak, and coach
      // memory below — none of those should move because someone exported a file.
      if (payload?.data?.kind === "action" && payload.data.actionResult) {
        const actionResult = payload.data.actionResult as CoachActionResult;
        setMessages(prev => prev.map(m => m.id === thinkingMsg.id
          ? { ...m, content: String(payload.data.reply ?? actionResult.summary), reasoning: undefined, phase: "done", actionResult }
          : m));
        return;
      }
      const reply = payload?.data?.reply ?? payload?.data?.answer ?? "I'm having trouble responding right now. Please try again.";
      const confidence_score = typeof payload?.data?.confidence_score === "number" ? payload.data.confidence_score : null;
      const ra = payload?.data?.recommended_action;
      const recommendedAction = ra && typeof ra.what_to_do === "string" && typeof ra.why_now === "string"
        ? { what_to_do: ra.what_to_do, why_now: ra.why_now, expected_evidence: typeof ra.expected_evidence === "string" ? ra.expected_evidence : undefined }
        : undefined;
      const newMemory = [...memory, msg].slice(-10);
      setMemory(newMemory);
      storage.setJSON("bm_coach_memory", newMemory);
      persistBehaviorState({ coach_memory: newMemory });
      setMessages(prev => prev.map(m => m.id === thinkingMsg.id ? { ...m, content: reply, reasoning: payload?.data?.reasoning ?? m.reasoning, phase: "done", confidence_score, recommendedAction } : m));
      recordCoachMessage();
      setCoachMessagesToday(getCoachMessagesToday());
      const stats = getAchievementStats();
      updateAchievementStats({ ...stats, aiMessages: (stats.aiMessages ?? 0) + 1 });
      checkAndUnlockAchievements();
      // AI Coach counts as a streak-qualifying activity — increment once per day
      const todayKey = new Date().toISOString().split("T")[0];
      if (storage.get("bm_coach_streak_date") !== todayKey) {
        incrementDailyStreak();
        storage.set("bm_coach_streak_date", todayKey);
        persistBehaviorState({ coach_streak_date: todayKey });
      }
      trackEvent("ai_coach_message", { plan });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
      if (message.toLowerCase().includes("limit")) showLimitModal("aiCoach");
      setMessages(prev => prev.map(m => m.id === thinkingMsg.id ? { ...m, content: message, phase: "done", error: true } : m));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  const personalityOptions = [
    { id: "direct" as const, label: "Direct" },
    { id: "supportive" as const, label: "Supportive" },
    { id: "challenger" as const, label: "Challenger" },
  ];

  // No active project = genuinely nothing real to coach against. Rather than
  // let the founder type into a chat that will just bounce their first
  // message back as an error, say so up front — matching the reference
  // design's dedicated unavailable state, and true to what's actually wrong.
  if (!summariesLoading && !activeProject) {
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center justify-center gap-3 px-5 py-24 text-center" style={{ minHeight: "60vh" }}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "rgba(224,85,85,0.12)" }}>
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "var(--bm-red)" }} />
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--bm-text)]">Intelligence temporarily unavailable</h2>
        <p className="max-w-[360px] text-[12.5px] leading-relaxed text-[var(--bm-text3)]">
          BuildMind coaching requires access to your project state and behavior data. Create or select a project to pick this back up.
        </p>
        <a href="/projects" className="mt-1 rounded-[var(--r-sm)] px-3.5 py-2 text-[12px] font-semibold" style={{ background: "var(--bm-accent)", color: "#15130a" }}>
          Go to Projects
        </a>
      </div>
    );
  }

  const lowOnMessages = plan === "free" && remaining > 0 && remaining <= 1;
  const greetingName = hasHistoryGlobal(overview);
  const contextPanel = (
    <div className="flex flex-col gap-3">
      {activeProject && (
        <div className="rounded-[16px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-4">
          <div className="mb-1 text-[12px] text-[var(--bm-text3)]">Coaching on</div>
          <div className="text-[16px] font-semibold text-[var(--bm-text)]">{activeProject.title}</div>
          <div className="mt-0.5 text-[13px] text-[var(--bm-text3)]">{activeProject.startup_stage ?? "Stage not set"}</div>
        </div>
      )}
      {activeProject && activityEvents.length > 0 && (
        <div className="rounded-[16px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-4">
          <div className="mb-3 text-[13px] font-semibold text-[var(--bm-text2)]">Recent activity</div>
          <div className="flex flex-col gap-3">
            {activityEvents.slice(0, 4).map((ev, i) => (
              <div key={`${ev.occurredAt}-${i}`} className="flex items-start gap-2.5">
                <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bm-intel)]" />
                <div>
                  <div className="text-[13px] leading-snug text-[var(--bm-text2)]">{ev.label}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--bm-text4)]">{new Date(ev.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-[16px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-4">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--bm-text2)]"><Brain size={14} /> What the coach remembers</div>
        {memory.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-[var(--bm-text3)]">Memory builds as you talk to the coach.</p>
        ) : memory.slice(-5).map((m, i) => (
          <div key={i} className="mb-2 flex items-start gap-2.5">
            <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bm-intel)]" />
            <span className="text-[13px] leading-snug text-[var(--bm-text3)]">{sanitizeOutput(m).slice(0, 80)}{sanitizeOutput(m).length > 80 ? "…" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto flex w-full max-w-[860px] flex-col" style={{ minHeight: isMobile ? "calc(100dvh - 120px)" : "calc(100vh - 80px)", height: isMobile ? "auto" : "calc(100vh - 80px)" }}>

      {/* Slim header: the conversation is the page */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-2">
        <div className="min-w-0">
          <h1 className="m-0 text-[20px] font-bold tracking-[-0.02em] text-[var(--bm-text)]" style={{ fontFamily: "'Syne', sans-serif" }}>AI Coach</h1>
          {activeProject && <div className="truncate text-[13px] text-[var(--bm-text3)]">{activeProject.title}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div role="group" aria-label="Coach tone" className="flex rounded-full border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-0.5">
            {personalityOptions.map(opt => (
              <button key={opt.id} onClick={() => setPersonality(opt.id)} aria-pressed={personality === opt.id}
                className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[12.5px] ${personality === opt.id ? "bg-[var(--bm-intel-dim)] font-semibold text-[var(--bm-intel2)]" : "bg-transparent text-[var(--bm-text3)] hover:text-[var(--bm-text2)]"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowContext(true)} aria-label="Show project context and coach memory"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-bg2)] text-[var(--bm-text3)] hover:text-[var(--bm-text)]">
            <PanelRight size={16} />
          </button>
        </div>
      </header>

      {/* Context drawer */}
      <AnimatePresence>
        {showContext && (
          <>
            <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowContext(false)}
              className="fixed inset-0 z-40 bg-black/50" />
            <motion.aside key="drawer" role="dialog" aria-label="Project context" initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ type: "tween", duration: 0.2 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-[92vw] max-w-[380px] overflow-y-auto border-l border-[var(--bm-border)] bg-[var(--bm-bg)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[16px] font-semibold text-[var(--bm-text)]">Context</span>
                <button onClick={() => setShowContext(false)} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--bm-border)] bg-transparent text-[var(--bm-text3)]"><X size={16} /></button>
              </div>
              {contextPanel}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {plan === "free" && remaining <= 0 && (
        <div className="mx-4 mb-3 shrink-0 rounded-[16px] border border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] p-4 sm:mx-2">
          <p className="text-[15px] font-semibold text-[var(--bm-text)]">You have used all {coachLimit} coaching questions today</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--bm-text3)]">Quick actions below still work. Upgrade to Builder to keep talking to the coach right now.</p>
          <button onClick={() => showLimitModal("aiCoach")} className="mt-3 cursor-pointer rounded-[10px] border-0 px-4 py-2.5 text-[13.5px] font-bold" style={{ background: "var(--bm-accent)", color: "#15130a" }}>Upgrade plan</button>
        </div>
      )}

      {/* Conversation */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-2" style={{ scrollbarWidth: "thin" }}>
        {messages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto flex h-full max-w-[680px] flex-col justify-center py-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--bm-intel-bd)] bg-[var(--bm-intel-dim)]">
              <Sparkles size={22} color="var(--bm-intel2)" />
            </div>
            <h2 className="m-0 text-[30px] font-bold leading-[1.2] tracking-[-0.025em] text-[var(--bm-text)] sm:text-[36px]" style={{ fontFamily: "'Syne', sans-serif" }}>
              {greetingName ? "Where do things stand?" : "Day one. Let’s get oriented."}
            </h2>
            <p className="mt-3 max-w-[560px] text-[16px] leading-[1.7] text-[var(--bm-text2)]">
              {greetingName
                ? "I know your blockers, your streak and the tasks you keep skipping. Tell me what you are stuck on, or ask what to do next. I will answer directly."
                : "You do not have a track record with me yet, so I will not pretend to know your patterns. Tell me what you are stuck on or what you are building, and I will give you a direct read."}
            </p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {QUICK_PROMPTS.slice(0, 4).map(p => (
                <button key={p} onClick={() => sendMessage(p)}
                  className="group flex min-h-[72px] cursor-pointer items-start justify-between gap-3 rounded-[16px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-4 text-left text-[14.5px] leading-snug text-[var(--bm-text2)] transition-colors hover:border-[var(--bm-intel-bd)] hover:text-[var(--bm-text)]">
                  <span>{p}</span>
                  <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-[var(--bm-text4)] group-hover:text-[var(--bm-intel2)]" />
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-8 py-4 pb-6">
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} onStartAction={() => router.push("/today")} onOpen={(href) => router.push(href)} onRunChip={(chip) => sendMessage(chip.label, { action: { id: chip.id, params: chip.params } })} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 shrink-0 bg-gradient-to-t from-[var(--bm-bg)] from-70% to-transparent px-3 pb-3 pt-4 sm:px-2 sm:pb-4">
        <div className="mx-auto max-w-[760px]">
          {plan === "free" && <div className="mb-2"><AIUsageBadge /></div>}
          {lowOnMessages && <div className="mb-2 text-[13px] text-[var(--bm-amber)]">Last coaching message for today.</div>}
          <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {COACH_ACTION_CHIPS.map(chip => (
              <button key={chip.label} type="button" disabled={loading}
                onClick={() => sendMessage(chip.label, { action: { id: chip.id, params: chip.params } })}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--bm-border2)] bg-[var(--bm-bg2)] px-3.5 py-2 text-[13px] text-[var(--bm-text2)] transition-colors hover:border-[var(--bm-intel-bd)] hover:text-[var(--bm-text)] disabled:cursor-not-allowed disabled:opacity-50">
                <Zap size={13} color="var(--bm-intel2)" />
                {chip.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3 rounded-[24px] border border-[var(--bm-border2)] bg-[var(--bm-bg2)] py-3 pl-5 pr-3 shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-colors focus-within:border-[var(--bm-accent-bd)]">
            <textarea ref={inputRef} value={input}
              onChange={e => { setInput(e.target.value); const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 180) + "px"; }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask anything about your startup" aria-label="Message the coach" rows={1} disabled={loading}
              className="max-h-[180px] min-h-[28px] flex-1 resize-none border-0 bg-transparent py-1 text-[16px] leading-[1.6] text-[var(--bm-text)] outline-none placeholder:text-[var(--bm-text4)]" />
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => sendMessage()} aria-label="Send message"
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0"
              style={{ background: !input.trim() || loading ? "var(--bm-bg4)" : "var(--bm-accent)", color: !input.trim() || loading ? "var(--bm-text3)" : "#15130a", cursor: !input.trim() || loading ? "not-allowed" : "pointer" }}>
              <Send size={17} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrapped with AIErrorBoundary so AI pipeline crashes show a recoverable fallback
export default withAIErrorBoundary(AICoachPageInner, "AI Coach");

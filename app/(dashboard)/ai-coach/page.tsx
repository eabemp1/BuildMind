"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
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
import { Send, Bot, Brain, Sparkles, Zap, User, Clock, ChevronRight } from "lucide-react";
import { withAIErrorBoundary } from "@/components/AIErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string[];
  phase?: "thinking" | "writing" | "done";
  error?: boolean;
  /** Reflexion confidence_score (0–1). Badge renders when < 0.75 */
  confidence_score?: number | null;
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
  "What should I do today?",
  "Why am I stuck?",
  "What's my biggest risk?",
  "How do I get my first 10 users?",
  "Am I ready to launch?",
];

const FREE_COACH_MESSAGES_PER_WEEK = 3;

function getCoachMessagesThisWeek() {
  return storage.getCoachMessagesThisWeek();
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

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div style={{
        background: isUser ? "var(--bm-bg4)" : "var(--bm-bg3)",
        border: "1px solid var(--bm-border)",
      }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
        {isUser ? <User size={12} color="var(--bm-text3)" /> : <Bot size={12} color="var(--bm-text3)" />}
      </div>
      <div className={`flex min-w-0 flex-col gap-1.5 ${isUser ? "items-end max-w-[88%] sm:max-w-[75%]" : "items-start max-w-[92%] sm:max-w-[85%]"}`}>
        {!isUser && msg.reasoning && msg.reasoning.length > 0 && (
          <div className="w-full rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] px-3 py-2.5">
            <button onClick={() => setExpanded(v => !v)}
              className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--bm-text3)]">
              <Brain size={10} color="var(--bm-text3)" />
              <span style={{ color: "var(--bm-text3)" }}>Thinking</span>
              <ChevronRight size={10} color="var(--bm-text3)" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", marginTop: 8 }}>
                  {msg.reasoning.map((step, i) => (
                    <div key={i} className="mb-1 flex items-start gap-2 text-[11px] text-[var(--bm-text3)]">
                      <span style={{ color: "var(--bm-text4)", flexShrink: 0 }}>›</span>
                      {sanitizeOutput(step)}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div
          className={`px-3.5 py-2.5 text-[13px] leading-relaxed ${isUser ? "rounded-[var(--r-xl)] rounded-tr-sm border border-[var(--bm-border3)] bg-[var(--bm-bg4)]" : "rounded-[var(--r-xl)] rounded-tl-sm border border-[var(--bm-border2)] bg-[var(--bm-bg3)]"}`}
          style={{ color: msg.error ? "var(--bm-red)" : "var(--bm-text2)" }}
        >
          {msg.phase === "thinking" ? <ThinkingDots /> : <span style={{ whiteSpace: "pre-wrap" }}>{sanitizeOutput(msg.content)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--bm-text3)]">
          <Clock size={9} />
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {!isUser && typeof msg.confidence_score === "number" && (
            <ConfidenceBadge score={msg.confidence_score} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AICoachPageInner() {
  const isMobile = useIsMobile();
  const { plan, isLoading: planLoading } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [] } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const activeProject = selectActiveProject(summaries, activeProjectId);
  const { data: overview } = useDashboardOverviewQuery(activeProject?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [personality, setPersonality] = useState<"direct" | "supportive" | "challenger">("direct");
  const [memory, setMemory] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [coachMessagesThisWeek, setCoachMessagesThisWeek] = useState(0);
  const [scorecardScore, setScorecardScore] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Single source of truth for score — see lib/scorecard.ts ──────────────
  // Previously: computeStartupScore(activeProject) with NO xp/streak passed,
  // meaning this page's score never reflected real XP or streak at all —
  // identical bug class to weekly-share's hardcoded xp:0.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/founder-context/scorecard", { cache: "no-store" })
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (!cancelled && json?.ok) setScorecardScore(Math.round(json.data.projectScore));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const score = scorecardScore ?? (activeProject ? computeStartupScore(activeProject) : 0);
  const limits = getLimits(plan);
  const coachLimit = plan === "free" ? FREE_COACH_MESSAGES_PER_WEEK : limits.aiMessagesPerDay;
  const remaining = plan === "free" ? Math.max(0, coachLimit - coachMessagesThisWeek) : Infinity;

  useEffect(() => {
    void fetchAndSyncStoredPlanFromBillingStatus();
  }, []);

  useEffect(() => {
    try { setMemory(storage.getJSON<string[]>("bm_coach_memory", [])); } catch {}
    setCoachMessagesThisWeek(getCoachMessagesThisWeek());
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

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    if (remaining <= 0 && !planLoading && plan === "free") { showLimitModal("aiCoach"); return; }
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
    const placeholderReasoning = buildPlaceholderReasoning(msg, activeProject?.title, score);
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
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) throw new Error(payload?.error ?? "Coach unavailable");
      const reply = payload?.data?.reply ?? payload?.data?.answer ?? "I'm having trouble responding right now. Please try again.";
      const confidence_score = typeof payload?.data?.confidence_score === "number" ? payload.data.confidence_score : null;
      const newMemory = [...memory, msg].slice(-10);
      setMemory(newMemory);
      storage.setJSON("bm_coach_memory", newMemory);
      persistBehaviorState({ coach_memory: newMemory });
      setMessages(prev => prev.map(m => m.id === thinkingMsg.id ? { ...m, content: reply, reasoning: payload?.data?.reasoning ?? m.reasoning, phase: "done", confidence_score } : m));
      recordCoachMessage();
      setCoachMessagesThisWeek(getCoachMessagesThisWeek());
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
  const suggestedActions = ["Define your ideal user persona", "Build in public on X consistently", "Create a lead magnet", "Launch on Product Hunt"];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-0 py-1 sm:px-6 sm:py-7" style={{ minHeight: isMobile ? "auto" : "calc(100vh - 80px)", height: isMobile ? "auto" : "calc(100vh - 80px)" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="shrink-0">
        <PageHeader
          title="AI Coach"
          subtitle="Your personal startup coach. Ask anything."
          action={
            <div className="flex w-full items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto">
            <span className="mr-1 shrink-0 text-[10px] text-[var(--bm-text3)]">Mode</span>
            {personalityOptions.map(opt => (
              <button key={opt.id} onClick={() => setPersonality(opt.id)}
                className={`shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-[11px] ${personality === opt.id ? "border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] font-semibold text-[var(--bm-accent)]" : "border-[var(--bm-border)] bg-transparent font-normal text-[var(--bm-text3)]"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          }
        />
      </motion.div>

      {/* Split layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">

        {/* Chat panel */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="flex min-h-[72vh] flex-1 flex-col overflow-hidden rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] shadow-md lg:min-h-0">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--bm-border)] px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--bm-accent)]" />
              <span className="text-[13px] font-semibold text-[var(--bm-text2)]">Conversation</span>
            </div>
            {plan === "free" && (
              <span className="text-[11px]" style={{ color: remaining > 1 ? "var(--bm-text3)" : "var(--bm-amber)" }}>
                {remaining}/{coachLimit} messages left this week
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5" style={{ scrollbarWidth: "none" }}>
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div style={{width:48,height:48,borderRadius:"var(--r-md)",background:"var(--bm-accent-dim)",border:"1px solid var(--bm-accent-bd)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <Bot size={22} color="var(--bm-accent)" />
                </div>
                <div style={{maxWidth:400,textAlign:"center"}}>
                  <div style={{fontFamily:"'Syne', sans-serif",fontSize:18,fontWeight:700,letterSpacing:"-0.02em",color:"var(--bm-text)",marginBottom:10,lineHeight:1.3}}>Your session is now set up.</div>
                  <p style={{fontFamily:"'Inter', sans-serif",fontSize:12.5,color:"var(--bm-text2)",lineHeight:1.65,margin:0}}>I&apos;m not a generic AI assistant — I know your startup, your stage, your fears, and your Break My Startup result. I&apos;m closest to the expensive executive coach, the VC operating partner, and the founder therapist — available at 2am when the anxiety hits. What do you want to work through today?</p>
                </div>
                <div className="flex max-w-full gap-2 overflow-x-auto px-1 sm:flex-wrap sm:justify-center">
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => sendMessage(p)}
                      className="shrink-0 rounded-full border border-[var(--bm-border)] bg-[var(--bm-bg3)] px-4 py-2 text-[12px] text-[var(--bm-text3)] transition-colors hover:border-[var(--bm-accent-bd)] hover:text-[var(--bm-accent)]">
                      {p}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          <div className="sticky bottom-0 shrink-0 border-t border-[var(--bm-border)] bg-[var(--bm-bg)]/90 p-3 backdrop-blur-sm sm:p-4">
            {plan === "free" && <div className="mb-2.5"><AIUsageBadge /></div>}
            <div className="flex items-end gap-2.5 rounded-[var(--r-xl)] border border-[var(--bm-border2)] bg-[var(--bm-bg3)] px-3.5 py-3 transition-colors"
              onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bm-accent-bd)"; }}
              onBlurCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bm-border2)"; }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask anything about your startup..." rows={1} disabled={loading}
                className="min-h-7 max-h-[120px] flex-1 resize-none border-0 bg-transparent text-[16px] leading-relaxed text-[var(--bm-text)] outline-none sm:text-[13px]" />
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-0 sm:h-8 sm:w-8"
                style={{ background: !input.trim() || loading ? "var(--bm-bg4)" : "var(--bm-text)", color: !input.trim() || loading ? "var(--bm-text3)" : "var(--bm-bg)", cursor: !input.trim() || loading ? "not-allowed" : "pointer" }}>
                <Send size={13} />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Right sidebar */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}
          className="flex w-full flex-col gap-3 overflow-y-auto lg:w-64" style={{ scrollbarWidth: "none" }}>

          <Card className="p-4">
            <div className="mb-3.5 flex items-center gap-1.5">
              <Brain size={13} color="var(--bm-text3)" />
              <span className="text-[13px] font-semibold text-[var(--bm-text)]">Coach Memory</span>
            </div>
            {memory.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-[var(--bm-text3)]">Memory builds as you talk to the coach.</p>
            ) : memory.slice(-4).map((m, i) => (
              <div key={i} className="mb-2 flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bm-accent)] opacity-60" />
                <span className="text-[11px] leading-relaxed text-[var(--bm-text3)]">{sanitizeOutput(m).slice(0, 55)}{sanitizeOutput(m).length > 55 ? "…" : ""}</span>
              </div>
            ))}
          </Card>

          <Card className="p-4">
            <div className="mb-3.5 flex items-center gap-1.5">
              <Sparkles size={13} color="var(--bm-text3)" />
              <span className="text-[13px] font-semibold text-[var(--bm-text)]">Suggested Actions</span>
            </div>
            {suggestedActions.map((a, i) => (
              <button key={i} onClick={() => sendMessage(`How do I: ${a}`)}
                className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[var(--bm-border)] bg-transparent px-3 py-2 text-left text-[12px] text-[var(--bm-text3)] transition-colors hover:border-[var(--bm-accent-bd)] hover:bg-[var(--bm-accent-dim)] hover:text-[var(--bm-text2)]">
                <Zap size={10} color="var(--bm-accent)" style={{ flexShrink: 0 }} />
                {a}
              </button>
            ))}
          </Card>

          <Card className="border-[var(--bm-accent-bd)] p-4">
            <div className="mb-2.5 text-[13px] font-semibold text-[var(--bm-text)]">Today's Focus</div>
            <div className="mb-2 text-[13px] font-semibold text-[var(--bm-text)]">
              {activeProject?.startup_stage === "Idea" ? "Talk to 5 potential users" :
               activeProject?.startup_stage === "MVP" ? "Ship your first version" :
               "Talk to 3 potential users"}
            </div>
            <span className="rounded-full border border-[rgba(224,85,85,0.22)] bg-[rgba(224,85,85,0.10)] px-2 py-0.5 text-[10px] font-bold text-[var(--bm-red)]">High Impact</span>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-[13px] font-semibold text-[var(--bm-text)]">Quick Questions</div>
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => sendMessage(p)}
                className="mb-1.5 block w-full cursor-pointer rounded-lg border border-[var(--bm-border)] bg-transparent px-3 py-2 text-left text-[12px] text-[var(--bm-text3)] transition-colors hover:bg-[var(--bm-bg3)] hover:text-[var(--bm-text2)]">
                {p}
              </button>
            ))}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// Wrapped with AIErrorBoundary so AI pipeline crashes show a recoverable fallback
export default withAIErrorBoundary(AICoachPageInner, "AI Coach");

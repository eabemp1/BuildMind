"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
import { fetchAndSyncStoredPlanFromBillingStatus, getLimits, incrementDailyStreak } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { trackEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";
import { Send, Bot, Brain, Sparkles, Zap, User, Clock, ChevronRight } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string[];
  phase?: "thinking" | "writing" | "done";
  error?: boolean;
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

function coachWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getCoachMessagesThisWeek() {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(`bm_coach_${coachWeekKey()}`) ?? "0");
}

function recordCoachMessage() {
  if (typeof window === "undefined") return;
  localStorage.setItem(`bm_coach_${coachWeekKey()}`, String(getCoachMessagesThisWeek() + 1));
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
      style={{ display: "flex", gap: isMobile ? 8 : 10, alignItems: "flex-start", flexDirection: isUser ? "row-reverse" : "row" }}>
      <div style={{
        width: isMobile ? 32 : 28, height: isMobile ? 32 : 28, borderRadius: "50%", flexShrink: 0,
        background: isUser ? "rgba(124,58,237,0.12)" : "var(--bm-accent-dim)",
        border: `1px solid ${isUser ? "rgba(124,58,237,0.22)" : "var(--bm-accent-bd)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isUser ? <User size={12} color="#A78BFA" /> : <Bot size={12} color="var(--bm-accent)" />}
      </div>
      <div style={{ maxWidth: isMobile ? "86%" : "78%", display: "flex", flexDirection: "column", gap: 6, alignItems: isUser ? "flex-end" : "flex-start" }}>
        {!isUser && msg.reasoning && msg.reasoning.length > 0 && (
          <div style={{ background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.12)", borderRadius: 12, padding: "10px 12px", width: "100%" }}>
            <button onClick={() => setExpanded(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "var(--bm-text3)", fontSize: 10, cursor: "pointer", fontFamily: "inherit", padding: 0, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
              <Brain size={10} color="#A78BFA" />
              <span style={{ color: "#A78BFA" }}>Thinking</span>
              <ChevronRight size={10} color="var(--bm-text3)" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", marginTop: 8 }}>
                  {msg.reasoning.map((step, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 4, display: "flex", gap: 7, alignItems: "flex-start" }}>
                      <span style={{ color: "rgba(124,58,237,0.5)", flexShrink: 0 }}>›</span>
                      {step}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div style={{
          padding: "11px 14px", borderRadius: 16,
          background: isUser ? "rgba(124,58,237,0.10)" : "var(--bm-bg3)",
          border: `1px solid ${isUser ? "rgba(124,58,237,0.18)" : "var(--bm-border)"}`,
          fontSize: isMobile ? 14 : 13, lineHeight: 1.6,
          color: msg.error ? "var(--bm-red)" : "var(--bm-text2)",
        }}>
          {msg.phase === "thinking" ? <ThinkingDots /> : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
        </div>
        <div style={{ fontSize: 10, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={9} />
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </motion.div>
  );
}

export default function AICoachPage() {
  const isMobile = useIsMobile();
  const { plan } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [] } = useProjectSummariesQuery();
  const { data: overview } = useDashboardOverviewQuery();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [personality, setPersonality] = useState<"direct" | "supportive" | "challenger">("direct");
  const [memory, setMemory] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [coachMessagesThisWeek, setCoachMessagesThisWeek] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeProject = summaries[0] ?? null;
  const score = activeProject ? computeStartupScore(activeProject) : 0;
  const limits = getLimits(plan);
  const coachLimit = plan === "free" ? FREE_COACH_MESSAGES_PER_WEEK : limits.aiMessagesPerDay;
  const remaining = plan === "free" ? Math.max(0, coachLimit - coachMessagesThisWeek) : Infinity;

  useEffect(() => {
    void fetchAndSyncStoredPlanFromBillingStatus();
  }, []);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("bm_coach_memory") ?? "[]"); setMemory(saved); } catch {}
    setCoachMessagesThisWeek(getCoachMessagesThisWeek());
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    if (remaining <= 0 && plan === "free") { showLimitModal("aiCoach"); return; }
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
      const newMemory = [...memory, msg].slice(-10);
      setMemory(newMemory);
      localStorage.setItem("bm_coach_memory", JSON.stringify(newMemory));
      setMessages(prev => prev.map(m => m.id === thinkingMsg.id ? { ...m, content: reply, reasoning: payload?.data?.reasoning ?? m.reasoning, phase: "done" } : m));
      recordCoachMessage();
      setCoachMessagesThisWeek(getCoachMessagesThisWeek());
      const stats = getAchievementStats();
      updateAchievementStats({ ...stats, aiMessages: (stats.aiMessages ?? 0) + 1 });
      checkAndUnlockAchievements();
      // AI Coach counts as a streak-qualifying activity — increment once per day
      const todayKey = new Date().toISOString().split("T")[0];
      if (localStorage.getItem("bm_coach_streak_date") !== todayKey) {
        incrementDailyStreak();
        localStorage.setItem("bm_coach_streak_date", todayKey);
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
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: isMobile ? "4px 0 20px" : "28px 24px", minHeight: isMobile ? "auto" : "calc(100vh - 80px)", height: isMobile ? "auto" : "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: isMobile ? 18 : 20, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: isMobile ? 28 : 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>AI Coach</h1>
              <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700, letterSpacing: "0.06em" }}>PRO</span>
            </div>
            <p style={{ fontSize: isMobile ? 14 : 12, color: "var(--bm-text3)", margin: 0 }}>Your personal startup coach. Ask anything.</p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", width: isMobile ? "100%" : "auto", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 2 : 0 }}>
            <span style={{ fontSize: 10, color: "var(--bm-text3)", marginRight: 4, flexShrink: 0 }}>Mode</span>
            {personalityOptions.map(opt => (
              <button key={opt.id} onClick={() => setPersonality(opt.id)}
                style={{
                  padding: isMobile ? "9px 13px" : "6px 12px", borderRadius: 8, fontFamily: "inherit", cursor: "pointer", flexShrink: 0,
                  border: `1px solid ${personality === opt.id ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                  background: personality === opt.id ? "var(--bm-accent-dim)" : "transparent",
                  color: personality === opt.id ? "var(--bm-accent)" : "var(--bm-text3)",
                  fontSize: 11, fontWeight: personality === opt.id ? 600 : 400,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Split layout */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 18 : 14, flex: 1, minHeight: 0 }}>

        {/* Chat panel */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: isMobile ? 16 : 20, overflow: "hidden", minHeight: isMobile ? "72vh" : 0 }}>
          <div style={{ padding: isMobile ? "16px 16px" : "14px 20px", borderBottom: "1px solid var(--bm-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--bm-accent)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>Conversation</span>
            </div>
            {plan === "free" && (
              <span style={{ fontSize: 11, color: remaining > 1 ? "var(--bm-text3)" : "var(--bm-amber)" }}>
                {remaining}/{coachLimit} messages left this week
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 16 : 20, display: "flex", flexDirection: "column", gap: isMobile ? 18 : 16, scrollbarWidth: "none" }}>
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, textAlign: "center" }}>
                <div style={{ width: isMobile ? 64 : 56, height: isMobile ? 64 : 56, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bot size={24} color="var(--bm-accent)" />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 18 : 16, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>What's on your mind today?</div>
                  <div style={{ fontSize: isMobile ? 14 : 12, color: "var(--bm-text3)" }}>Ask anything about your startup</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => sendMessage(p)}
                      style={{ padding: isMobile ? "10px 14px" : "8px 14px", borderRadius: 20, border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text3)", fontSize: isMobile ? 13 : 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bm-accent-bd)"; e.currentTarget.style.color = "var(--bm-accent)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; e.currentTarget.style.color = "var(--bm-text3)"; }}>
                      {p}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: isMobile ? "12px" : "14px 16px", borderTop: "1px solid var(--bm-border)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 14, padding: isMobile ? "12px 12px" : "10px 14px", transition: "border-color 0.15s" }}
              onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bm-accent-bd)"; }}
              onBlurCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bm-border2)"; }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask anything about your startup..." rows={1} disabled={loading}
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--bm-text)", fontSize: isMobile ? 16 : 13, resize: "none", lineHeight: 1.5, fontFamily: "inherit", minHeight: isMobile ? 28 : 20, maxHeight: 120 }} />
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{
                  width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 9, border: "none", flexShrink: 0,
                  background: !input.trim() || loading ? "rgba(255,255,255,0.05)" : "var(--grad-primary)",
                  color: !input.trim() || loading ? "rgba(255,255,255,0.2)" : "#fff",
                  cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <Send size={13} />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Right sidebar */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}
          style={{ width: isMobile ? "100%" : 256, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 12, overflowY: "auto", scrollbarWidth: "none" }}>

          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: isMobile ? 18 : 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <Brain size={13} color="#A78BFA" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text2)" }}>Coach Memory</span>
            </div>
            {memory.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.5 }}>Memory builds as you talk to the coach.</p>
            ) : memory.slice(-4).map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--bm-accent)", marginTop: 5, flexShrink: 0, opacity: 0.6 }} />
                <span style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.45 }}>{m.slice(0, 55)}{m.length > 55 ? "…" : ""}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <Sparkles size={13} color="var(--bm-amber)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text2)" }}>Suggested Actions</span>
            </div>
            {suggestedActions.map((a, i) => (
              <button key={i} onClick={() => sendMessage(`How do I: ${a}`)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "11px 12px" : "8px 10px", borderRadius: 9, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: isMobile ? 13 : 11, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%", marginBottom: 7, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bm-accent-bd)"; e.currentTarget.style.background = "var(--bm-accent-dim)"; e.currentTarget.style.color = "var(--bm-text2)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bm-text3)"; }}>
                <Zap size={10} color="var(--bm-accent)" style={{ flexShrink: 0 }} />
                {a}
              </button>
            ))}
          </div>

          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)", borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text2)", marginBottom: 10 }}>Today's Focus</div>
            <div style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 600, marginBottom: 8 }}>
              {activeProject?.startup_stage === "Idea" ? "Talk to 5 potential users" :
               activeProject?.startup_stage === "MVP" ? "Ship your first version" :
               "Talk to 3 potential users"}
            </div>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(224,85,85,0.10)", color: "var(--bm-red)", border: "1px solid rgba(224,85,85,0.22)", fontWeight: 700 }}>High Impact</span>
          </div>

          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text2)", marginBottom: 12 }}>Quick Questions</div>
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => sendMessage(p)}
                style={{ display: "block", width: "100%", padding: isMobile ? "11px 12px" : "8px 10px", borderRadius: 8, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: isMobile ? 13 : 11, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 6, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--bm-bg3)"; e.currentTarget.style.color = "var(--bm-text2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bm-text3)"; }}>
                {p}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

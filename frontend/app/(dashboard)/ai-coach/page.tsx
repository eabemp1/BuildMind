"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectsQuery, useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { FEATURES } from "@/lib/features";
import { useRouter } from "next/navigation";
import { recordAIUse, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

const QUICK_PROMPTS = [
  "What should I do today?",
  "Why am I stuck?",
  "What's my biggest risk right now?",
  "How do I get my first 10 users?",
  "Am I ready to launch?",
];

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "12px 16px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <motion.div key={i}
          animate={{ y: [0, -4, 0], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
          style={{ width: 5, height: 5, borderRadius: "50%", background: "#444" }} />
      ))}
    </div>
  );
}

export default function AICoachPage() {
  const router = useRouter();
  useEffect(() => { if (!FEATURES.aiCoach) router.replace("/dashboard"); }, [router]);
  if (!FEATURES.aiCoach) return null;

  const { data: projects = [], isLoading: loadingProjects } = useProjectsQuery();
  const { data: summaries = [] } = useProjectSummariesQuery();
  const { data: overview } = useDashboardOverviewQuery();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const activeProjectId = selectedProjectId ?? projects[0]?.id;

  // Real stage from summaries
  const activeSummary = summaries.find((s) => s.id === activeProjectId) ?? summaries[0];
  const stage = activeSummary?.startup_stage ?? "MVP";
  const score = activeSummary ? Math.min(100, Math.round(Math.max(activeSummary.execution_score ?? 0, activeSummary.progress + (activeSummary.validation_strengths?.length ?? 0) * 8))) : 0;
  const streak = overview?.founderStreakDays ?? 0;
  const tasksDone = overview?.completedTasks ?? 0;

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Opening message uses REAL data
  const openingMessage = activeSummary
    ? `I've read your project data. Here's what I see:\n\nProject: "${activeSummary.title}" · Stage: ${stage} · Score: ${score}/100 · Streak: ${streak} days · Tasks completed: ${tasksDone}\n\nProgress: ${activeSummary.tasksCompleted}/${activeSummary.tasksTotal} tasks done (${activeSummary.progress}%)\n\n${score < 40 ? "Your execution score is low. Before we do anything else — what specific task have you been avoiding?" : score < 70 ? "You're making progress but there's a gap to close. What's the one thing you committed to last week that you didn't do?" : "Strong execution. The question now is whether you're working on the right things. What's your north star metric this week?"}`
    : "I'm BuildMind. I read your actual project data before every response — so I'm not guessing.\n\nCreate a project first so I have context to work with.";

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: openingMessage },
  ]);

  // Update opening message when data loads
  useEffect(() => {
    if (activeSummary && messages.length === 1 && messages[0].id === "welcome") {
      const updated = activeSummary
        ? `I've read your project data. Here's what I see:\n\nProject: "${activeSummary.title}" · Stage: ${stage} · Score: ${score}/100 · Streak: ${streak} days · Tasks completed: ${tasksDone}\n\nProgress: ${activeSummary.tasksCompleted}/${activeSummary.tasksTotal} tasks done (${activeSummary.progress}%)\n\n${score < 40 ? "Your execution score is low. Before we do anything else — what specific task have you been avoiding?" : score < 70 ? "You're making progress but there's a gap to close. What's the one thing you committed to last week that didn't happen?" : "Strong execution. The question now is whether you're working on the right things. What's your north star metric?"}`
        : messages[0].content;
      setMessages([{ id: "welcome", role: "assistant", content: updated }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSummary?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  const send = async (overrideMessage?: string) => {
    const message = (overrideMessage ?? input).trim();
    if (!message || !activeProjectId || isSending) return;
    setInput("");
    setError(null);
    const userId_tmp = `${Date.now()}-user`;
    const aiId_tmp = `${Date.now()}-ai`;
    setMessages((prev) => [...prev, { id: userId_tmp, role: "user", content: message }]);
    setIsSending(true);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");

      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          projectId: activeProjectId,
          message,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const body = await res.json().catch(() => ({}));
      const reply = body?.data?.reply ?? "BuildMind couldn't respond right now. Check the error logs.";
      const isError = !res.ok || body?.success === false;

      setMessages((prev) => [...prev, {
        id: aiId_tmp,
        role: "assistant",
        content: reply,
        error: isError,
      }]);

      if (!isError) {
        trackEvent("ai_coach_used");
        recordAIUse();
        const localStreak = Number(localStorage.getItem("bm_streak") ?? "1");
        const { shouldUpgrade } = checkUpgradeTrigger(localStreak);
        if (shouldUpgrade) router.push(`/upgrade?tasks=${getTasksDone()}&streak=${localStreak}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to send";
      setMessages((prev) => [...prev, { id: aiId_tmp, role: "assistant", content: `Error: ${errMsg}`, error: true }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 820, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>AI Coach</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Reads your real project data before every response — not guessing</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Score strip */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {[
              { label: "Score", value: `${score}`, color: score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#f87171" },
              { label: "Stage", value: stage, color: "#a78bfa" },
              { label: "Streak", value: `${streak}d`, color: streak >= 3 ? "#fbbf24" : "#555" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center", background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 6, padding: "4px 10px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color }}>{value}</div>
                <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
          {projects.length > 1 && (
            <select value={activeProjectId ?? ""} onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#888", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12 }}>
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", padding: "3px 0" }}>
              <div style={{
                maxWidth: "78%", padding: "11px 15px",
                borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                background: m.role === "user" ? "#fff" : m.error ? "rgba(248,113,113,0.05)" : "#0d0d0d",
                border: m.role === "user" ? "none" : m.error ? "1px solid rgba(248,113,113,0.2)" : "1px solid #1c1c1c",
                fontSize: 13, color: m.role === "user" ? "#000" : m.error ? "#f87171" : "#d4d4d4", lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}>
                {m.role === "assistant" && (
                  <div style={{ fontSize: 9, color: m.error ? "#f87171" : "#333", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    {m.error ? "⚠ Error" : "BuildMind AI"}
                  </div>
                )}
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isSending && (
          <div style={{ display: "flex", padding: "3px 0" }}>
            <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "10px 10px 10px 2px" }}>
              <TypingDots />
            </div>
          </div>
        )}

        {!loadingProjects && projects.length === 0 && (
          <div style={{ fontSize: 12, color: "#444", padding: "20px 0" }}>
            Create a project first so BuildMind has context to work with.
            <button onClick={() => router.push("/projects")}
              style={{ display: "block", marginTop: 10, background: "#fff", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Create project →
            </button>
          </div>
        )}
      </div>

      {/* Quick prompts */}
      {messages.length <= 2 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 10, flexShrink: 0 }}>
          {QUICK_PROMPTS.map((p) => (
            <button key={p} onClick={() => void send(p)}
              style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit" }}>
              {p}
            </button>
          ))}
        </motion.div>
      )}

      {/* Input */}
      <div style={{ borderTop: "1px solid #1c1c1c", paddingTop: 12, display: "flex", gap: 8, flexShrink: 0 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Ask BuildMind about your roadmap, next steps, or what's blocking you..."
          style={{ flex: 1, background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#d4d4d4", outline: "none", fontFamily: "inherit" }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }}
        />
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => void send()}
          disabled={!activeProjectId || isSending || !input.trim()}
          style={{
            background: !activeProjectId || isSending || !input.trim() ? "#0d0d0d" : "#fff",
            color: !activeProjectId || isSending || !input.trim() ? "#333" : "#000",
            fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 8, border: "1px solid #1c1c1c",
            cursor: !activeProjectId || isSending || !input.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>
          {isSending ? "..." : "Send"}
        </motion.button>
      </div>
    </motion.div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { FEATURES } from "@/lib/features";
import { useRouter } from "next/navigation";
import { recordAIUse, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "What should I do today?",
  "Am I validated enough to build?",
  "What's my biggest risk right now?",
  "How do I get my first 10 users?",
  "Is my execution score good?",
];

function parseCoachSections(input: string): Array<{ title: string; body: string }> | null {
  if (!input) return null;
  const cleaned = input.replace(/^\s*#+\s*/gm, "").trim();
  const matches = cleaned.split(/\n(?=Insight:|Advice:|Next Steps:)/i).filter(Boolean);
  const sections: Array<{ title: string; body: string }> = [];
  for (const block of matches) {
    const [rawTitle, ...rest] = block.split("\n");
    const title = rawTitle.replace(":", "").trim();
    if (!title) continue;
    sections.push({ title, body: rest.join("\n").trim() });
  }
  return sections.length >= 2 ? sections : null;
}

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const activeProjectId = selectedProjectId ?? projects[0]?.id;
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "Hi — I'm BuildMini. I read your actual project data before every response, so I'm not guessing. Ask me anything about your execution, next steps, or what's blocking you." },
  ]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  const send = async (overrideMessage?: string) => {
    const message = (overrideMessage ?? input).trim();
    if (!message || !activeProjectId || isSending) return;
    setInput("");
    setError(null);
    const userId = `${Date.now()}-user`;
    const aiId = `${Date.now()}-ai`;
    setMessages((prev) => [...prev, { id: userId, role: "user", content: message }]);
    setIsSending(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");
      const project = projects.find((p) => p.id === activeProjectId);
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id, projectId: activeProjectId, message,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          project: { title: project?.title ?? "", description: project?.description ?? "", target_users: project?.target_users ?? "", problem: project?.problem ?? "" },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error || "Failed to send message."));
      setMessages((prev) => [...prev, { id: aiId, role: "assistant", content: body?.data?.reply || "I can help with your next steps." }]);
      trackEvent("ai_coach_used");
      recordAIUse();
      const streak = Number(localStorage.getItem("bm_streak") ?? "1");
      const { shouldUpgrade } = checkUpgradeTrigger(streak);
      if (shouldUpgrade) router.push(`/upgrade?tasks=${getTasksDone()}&streak=${streak}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally { setIsSending(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 820, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>BuildMini</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>AI coach — reads your real project data before every response</div>
        </div>
        {projects.length > 0 && (
          <select value={activeProjectId ?? ""} onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#888", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
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
                maxWidth: "74%", padding: "10px 14px",
                borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                background: m.role === "user" ? "#fff" : "#0d0d0d",
                border: m.role === "user" ? "none" : "1px solid #1c1c1c",
                fontSize: 13, color: m.role === "user" ? "#000" : "#c4c4c4", lineHeight: 1.65,
              }}>
                {m.role === "assistant" ? (() => {
                  const sections = parseCoachSections(m.content);
                  if (!sections) return <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {sections.map((s) => (
                        <div key={s.title}>
                          <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 4 }}>{s.title}</div>
                          <div style={{ fontSize: 13, color: "#c4c4c4", lineHeight: 1.65 }}>{s.body}</div>
                        </div>
                      ))}
                    </div>
                  );
                })() : m.content}
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
          <div style={{ fontSize: 12, color: "#444", padding: "20px 0" }}>Create a project first to chat with BuildMini.</div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ fontSize: 12, color: "#f87171", padding: "4px 0" }}>{error}</motion.div>
        )}
      </div>

      {/* Quick prompts — only show if early in convo */}
      {messages.length <= 2 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 10, flexShrink: 0 }}>
          {QUICK_PROMPTS.map((p) => (
            <button key={p} onClick={() => void send(p)}
              style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.08)"; }}>
              {p}
            </button>
          ))}
        </motion.div>
      )}

      {/* Input */}
      <div style={{ borderTop: "1px solid #1c1c1c", paddingTop: 12, display: "flex", gap: 8, flexShrink: 0 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Ask BuildMini about your roadmap, next steps, or what's blocking you..."
          style={{ flex: 1, background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#d4d4d4", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }}
        />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => void send()}
          disabled={!activeProjectId || isSending || !input.trim()}
          style={{ background: !activeProjectId || isSending || !input.trim() ? "#0d0d0d" : "#fff", color: !activeProjectId || isSending || !input.trim() ? "#333" : "#000", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 8, border: "1px solid #1c1c1c", cursor: !activeProjectId || isSending || !input.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
          Send
        </motion.button>
      </div>
    </motion.div>
  );
}

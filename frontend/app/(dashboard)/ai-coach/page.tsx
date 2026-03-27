"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { FEATURES } from "@/lib/features";
import { useRouter } from "next/navigation";
import { recordAIUse, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "Hi — I'm BuildMini. Ask me anything about your project execution, next steps, or what's blocking you." },
  ]);

  const send = async () => {
    if (!input.trim() || !activeProjectId || isSending) return;
    const message = input.trim();
    setInput(""); setError(null);
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, projectId: activeProjectId, message, messages: messages.map((m) => ({ role: m.role, content: m.content })), project: { title: project?.title ?? "", description: project?.description ?? "", target_users: project?.target_users ?? "", problem: project?.problem ?? "" } }),
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
      style={{ maxWidth: 820, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>BuildMini</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>AI coach — reads your real project data</div>
        </div>
        {projects.length > 0 && (
          <select value={activeProjectId ?? ""} onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#999", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, paddingBottom: 14 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", padding: "3px 0" }}>
            <div style={{
              maxWidth: "74%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
              background: m.role === "user" ? "#fff" : "#111",
              border: m.role === "user" ? "none" : "1px solid #1c1c1c",
              fontSize: 13, color: m.role === "user" ? "#000" : "#c4c4c4", lineHeight: 1.6,
            }}>
              {m.role === "assistant" ? (() => {
                const sections = parseCoachSections(m.content);
                if (!sections) return <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sections.map((s) => (
                      <div key={s.title}>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 4 }}>{s.title}</div>
                        <div style={{ fontSize: 13, color: "#c4c4c4", lineHeight: 1.6 }}>{s.body}</div>
                      </div>
                    ))}
                  </div>
                );
              })() : m.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div style={{ display: "flex", padding: "3px 0" }}>
            <div style={{ padding: "10px 14px", background: "#111", border: "1px solid #1c1c1c", borderRadius: "10px 10px 10px 2px", fontSize: 13, color: "#555" }}>···</div>
          </div>
        )}
        {!loadingProjects && projects.length === 0 && (
          <div style={{ fontSize: 12, color: "#555", padding: "20px 0" }}>Create a project first to chat with BuildMini.</div>
        )}
        {error && <div style={{ fontSize: 12, color: "#f87171", padding: "4px 0" }}>{error}</div>}
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid #1c1c1c", paddingTop: 12, display: "flex", gap: 8, flexShrink: 0 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Ask BuildMini about your roadmap..."
          style={{ flex: 1, background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, padding: "9px 14px", fontSize: 13, color: "#d4d4d4", outline: "none", fontFamily: "inherit" }} />
        <button onClick={() => void send()} disabled={!activeProjectId || isSending}
          style={{ background: !activeProjectId || isSending ? "#111" : "#fff", color: !activeProjectId || isSending ? "#444" : "#000", fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: 6, border: "none", cursor: !activeProjectId || isSending ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          Send
        </button>
      </div>
    </motion.div>
  );
}

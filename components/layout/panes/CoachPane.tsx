"use client";

import React from "react";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Send, Sparkles } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { sanitizeMarkdown } from "@/lib/sanitizeOutput";
import { selectActiveProject, useActiveProjectId, useDashboardOverviewQuery, useProjectSummariesQuery } from "@/lib/queries";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { matchNavigation, parseReplyLinks } from "@/lib/coachNavigation";
import { useSidePane, type OpenPane } from "@/components/layout/side-pane-context";

type CoachReq = Extract<OpenPane, { kind: "coach" }>;
const FREE_COACH_MESSAGES_PER_DAY = 3;

/**
 * The AI coach, beside the current page. It talks to the same /api/ai/coach
 * route and spends the same daily allowance as the full Coach page. The
 * conversation lives in the pane provider so closing and reopening keeps it.
 */
export default function CoachPane({ req }: { req: CoachReq }) {
  const router = useRouter();
  const { coachMessages: messages, setCoachMessages: setMessages } = useSidePane();
  const { plan, isLoading: planLoading } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [] } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const project = selectActiveProject(summaries, activeProjectId);
  const { data: overview } = useDashboardOverviewQuery(project?.id);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentPrompt = useRef<number | null>(null);

  useEffect(() => { createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    const nav = matchNavigation(msg);
    if (nav) {
      setInput("");
      setMessages((p) => [...p, { id: `u${Date.now()}`, role: "user", content: msg }, { id: `a${Date.now()}`, role: "assistant", content: `Opening ${nav.label}…` }]);
      setTimeout(() => router.push(nav.href), 300);
      return;
    }
    const remaining = FREE_COACH_MESSAGES_PER_DAY - storage.getCoachMessagesToday();
    if (plan === "free" && !planLoading && remaining <= 0) { showLimitModal("aiCoach"); return; }
    const fail = (content: string) => setMessages((p) => [...p, { id: `e${Date.now()}`, role: "assistant", content, error: true }]);
    if (!userId) { fail("Please sign in again before using the coach."); return; }
    if (!project?.id) { fail("Create or select a project first so I can coach against real context."); return; }

    setInput("");
    const history = messages.filter((m) => !m.pending && !m.error).slice(-10).map((m) => ({ id: m.id, role: m.role, content: m.content, phase: "done" }));
    const pendingId = `p${Date.now()}`;
    setMessages((p) => [...p, { id: `u${Date.now()}`, role: "user", content: msg }, { id: pendingId, role: "assistant", content: "", pending: true }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, projectId: project.id, message: msg, project, overview, memory: [], personality: "direct", messages: history }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) throw new Error(payload?.error ?? "Coach unavailable");
      const data = payload.data ?? {};
      const reply = data.kind === "action" && data.actionResult
        ? String(data.reply ?? data.actionResult.summary ?? "Done. Open the full Coach page to see the result.")
        : String(data.reply ?? data.answer ?? "I'm having trouble responding right now. Please try again.");
      if (data.kind !== "action") storage.recordCoachMessage();
      setMessages((p) => p.map((m) => (m.id === pendingId ? { ...m, content: reply, pending: false } : m)));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Try again.";
      if (message.toLowerCase().includes("limit")) showLimitModal("aiCoach");
      setMessages((p) => p.map((m) => (m.id === pendingId ? { ...m, content: message, pending: false, error: true } : m)));
    } finally {
      setBusy(false);
    }
  }

  // A prompt handed over by the opener (e.g. "Ask the coach about this task") is sent once.
  useEffect(() => {
    if (!req.prompt || sentPrompt.current === req.key || !userId || !project?.id) return;
    sentPrompt.current = req.key;
    void send(req.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.key, req.prompt, userId, project?.id]);

  const suggestions = ["What should I do next?", "What am I avoiding?", "Challenge my plan"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--bm-text2)" }}>
              Ask about {project ? <strong style={{ color: "var(--bm-text)" }}>{(project as { title?: string }).title ?? "your project"}</strong> : "your project"} while you keep working on the page beside this.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)}
                  style={{ border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)", color: "var(--bm-text2)", borderRadius: 99, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "user") {
            return <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "88%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: "16px 16px 4px 16px", padding: "8px 12px", fontSize: 13.5, lineHeight: 1.5, color: "var(--bm-text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.content}</div>;
          }
          const parsed = m.pending || m.error ? { text: m.content, links: [] as ReturnType<typeof parseReplyLinks>["links"] } : parseReplyLinks(m.content);
          return (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ width: 24, height: 24, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--bm-intel-dim)", border: "1px solid var(--bm-intel-bd)" }}><Sparkles size={12} color="var(--bm-intel2)" /></span>
              <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {m.pending ? <span style={{ fontSize: 13, color: "var(--bm-text3)" }}>Thinking…</span>
                  : m.error ? <span style={{ fontSize: 13, color: "var(--bm-red)" }}>{m.content}</span>
                  : <Markdown textSize={13.5}>{sanitizeMarkdown(parsed.text)}</Markdown>}
                {parsed.links.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {parsed.links.map((l, i) => l.kind === "open" && (
                      <button key={i} type="button" onClick={() => router.push(l.href)}
                        style={{ display: "inline-flex", gap: 5, alignItems: "center", background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", borderRadius: 99, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{l.label}<ArrowUpRight size={12} /></button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "10px 12px 12px", borderTop: "1px solid var(--bm-border)" }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Ask your coach…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          style={{ flex: 1, resize: "none", maxHeight: 120, background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 12, padding: "9px 12px", fontSize: 14, color: "var(--bm-text)", fontFamily: "inherit", outline: "none" }} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
          style={{ width: 38, height: 38, borderRadius: 12, border: 0, display: "grid", placeItems: "center", cursor: busy || !input.trim() ? "default" : "pointer", background: "var(--bm-accent)", color: "var(--bm-text-inv)", opacity: busy || !input.trim() ? 0.5 : 1 }}>
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

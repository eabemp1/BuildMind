"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProjectSummariesQuery } from "@/lib/queries";
import { useLimitModal } from "@/components/LimitModal";

const card = {
  background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
  borderRadius: 10, overflow: "hidden" as const,
};
const sectionHead = {
  padding: "10px 16px", borderBottom: "1px solid #111", background: "var(--bm-bg3)",
  fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.09em",
};

// ─── Typewriter (same pattern as AI Coach) ─────────────────────────────────

function TypewriterText({ text, isNew }: { text: string; isNew?: boolean }) {
  const [displayed, setDisplayed] = useState(isNew ? "" : text);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!isNew) { setDisplayed(text); return; }
    setDisplayed(""); doneRef.current = false; let i = 0;
    const tick = () => {
      if (i >= text.length) return;
      const chunk = Math.floor(Math.random() * 3) + 2;
      i = Math.min(i + chunk, text.length);
      setDisplayed(text.slice(0, i));
      setTimeout(tick, text[i - 1] === "." ? 60 : 14);
    };
    setTimeout(tick, 100);
  }, [text, isNew]);
  return <span>{displayed}{isNew && displayed.length < text.length && (
    <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}
      style={{ display: "inline-block", width: 2, height: "1em", background: "#a78bfa", marginLeft: 1, verticalAlign: "text-bottom" }} />
  )}</span>;
}

// ─── Reasoning steps ───────────────────────────────────────────────────────

function ReasoningSteps({ steps, active }: { steps: string[]; active: boolean }) {
  const [visible, setVisible] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!active) { setVisible(steps.length); setTimeout(() => setCollapsed(true), 800); return; }
    setVisible(0); setCollapsed(false); let i = 0;
    const iv = setInterval(() => { i++; setVisible(i); if (i >= steps.length) clearInterval(iv); }, 650);
    return () => clearInterval(iv);
  }, [active, steps]);
  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setCollapsed(c => !c)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", marginBottom: collapsed ? 0 : 6 }}>
        {active ? (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid #a78bfa", borderTopColor: "transparent" }} />
        ) : (
          <span style={{ fontSize: 10, color: "#444" }}>▾</span>
        )}
        <span style={{ fontSize: 10, color: active ? "#a78bfa" : "#444", fontFamily: "monospace" }}>
          {active ? "Generating your report..." : collapsed ? `${steps.length} analysis steps` : "Analysis reasoning"}
        </span>
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ borderLeft: "1.5px solid rgba(167,139,250,0.25)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {steps.slice(0, visible).map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
                  style={{ fontSize: 11, color: "#555", fontFamily: "monospace", display: "flex", gap: 6 }}>
                  <span style={{ color: "#a78bfa", flexShrink: 0 }}>→</span>{s}
                  {i === visible - 1 && active && (
                    <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} style={{ color: "#a78bfa" }}>▊</motion.span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Mirror gauge ──────────────────────────────────────────────────────────

function MirrorGauge({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = pct >= 70 ? "#4ade80" : pct >= 40 ? "#fbbf24" : "#f87171";
  const circ = 2 * Math.PI * 36;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
        <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
          <motion.circle cx="45" cy="45" r="36" fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round" strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 500, color, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 8, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>done</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, color: "var(--bm-text)", marginBottom: 6 }}>
          {completed} of {total} tasks completed
        </div>
        {pct < 100 ? (
          <div style={{ fontSize: 12, color: "#f87171", lineHeight: 1.55 }}>
            {total - completed} task{total - completed !== 1 ? "s" : ""} still open.
            <br /><span style={{ color: "var(--bm-text4)" }}>Every unclosed task is a decision you deferred.</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#4ade80" }}>All tasks done. That's rare. Keep going.</div>
        )}
      </div>
    </div>
  );
}

// ─── Momentum ring ─────────────────────────────────────────────────────────

function MomentumRing({ score }: { score: number }) {
  const color = score >= 70 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
  const circ = 2 * Math.PI * 28;
  return (
    <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
      <svg width="70" height="70" viewBox="0 0 70 70" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <motion.circle cx="35" cy="35" r="28" fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function ReportPage() {
  const router = useRouter();
  const { showLimit } = useLimitModal();
  const { data: summaries = [] } = useProjectSummariesQuery();
  const [plan, setPlan] = useState<"free" | "builder" | "venture">("free");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [generating, setGenerating] = useState(false);
  const [reasoning, setReasoning] = useState<string[]>([
    "Reading your project and milestone data...",
    "Computing task completion and momentum...",
    "Identifying your biggest gap this week...",
    "Drafting your honest assessment...",
  ]);
  const [reasoningActive, setReasoningActive] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");

  const [report, setReport] = useState<{
    summary: string; intention_vs_action: string; biggest_gap: string;
    next_week_focus: string; honest_assessment: string; momentum_score: number;
    reportData?: { projects_count: number; milestones_completed: number; tasks_completed: number };
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const local = localStorage.getItem("bm_plan") as "free" | "builder" | "venture" | null;
      setPlan(local && ["free", "builder", "venture"].includes(local) ? local : "free");
    }
  }, []);

  const hasWeeklyReport = plan === "builder" || plan === "venture";
  const activeProjectId = selectedProjectId || summaries[0]?.id || "";

  // Derived stats from summaries (available to all plans for the mirror gauge)
  const totalTasks = summaries.reduce((a, s) => a + (s.tasksTotal ?? 0), 0);
  const completedTasks = summaries.reduce((a, s) => a + (s.tasksCompleted ?? 0), 0);

  const generate = async () => {
    if (!hasWeeklyReport) { showLimit("weekly_report"); return; }
    setGenerating(true);
    setReasoningActive(true);
    setShowAnswer(false);
    setError("");
    setReport(null);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");

      const res = await fetch("/api/ai/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, projectId: activeProjectId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body?.error ?? "Report failed");

      // Animate reasoning then reveal answer
      const thinkDuration = reasoning.length * 650 + 500;
      setTimeout(() => {
        setReasoningActive(false);
        setReport(body.data);
        setIsNew(true);
        setShowAnswer(true);
        setGenerating(false);
      }, thinkDuration);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
      setReasoningActive(false);
      setGenerating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 860, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "var(--bm-text)", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Report</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 2 }}>Weekly honest mirror — intention vs action</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {summaries.length > 1 && (
            <select value={activeProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "var(--bm-text2)", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
              {summaries.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={generate}
            disabled={generating}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer",
              fontFamily: "inherit", border: "none", opacity: generating ? 0.7 : 1,
              background: hasWeeklyReport ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(99,102,241,0.08)",
              color: hasWeeklyReport ? "#fff" : "#818cf8",
            }}>
            {generating ? "Generating..." : hasWeeklyReport ? "⚡ Generate report" : "🔒 Builder plan"}
          </motion.button>
        </div>
      </div>

      {/* Always-visible stats — work for free users too */}
      {summaries.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", ...card, marginBottom: 12 }}>
          {[
            { label: "Projects", value: String(summaries.length), color: "var(--bm-text)" },
            { label: "Tasks completed", value: String(completedTasks), color: "#4ade80" },
            { label: "Total tasks", value: String(totalTasks), color: "var(--bm-text)" },
          ].map((m, i) => (
            <div key={m.label} style={{ padding: "18px 20px", background: "var(--bm-bg3)", borderRight: i < 2 ? "1px solid #1c1c1c" : "none" }}>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 9 }}>{m.label}</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: m.color, letterSpacing: "-0.03em", lineHeight: 1 }}>{m.value}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Mirror gauge — always visible */}
      {summaries.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ ...card, marginBottom: 12 }}>
          <div style={{ ...sectionHead, color: "#a78bfa" }}>🪞 The honest mirror</div>
          <div style={{ padding: "20px" }}>
            <MirrorGauge completed={completedTasks} total={totalTasks} />
            <div style={{ fontSize: 12, color: "var(--bm-text4)", marginTop: 16, lineHeight: 1.65, borderTop: "1px solid #111", paddingTop: 14 }}>
              This is your real execution rate — tasks you committed to vs tasks you actually closed. The gap is where your growth lives.
            </div>
          </div>
        </motion.div>
      )}

      {summaries.length === 0 && (
        <div style={{ ...card, padding: "52px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>🪞</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6, marginBottom: 18 }}>Create a project and complete tasks to see your weekly report.</div>
          <button onClick={() => router.push("/projects")}
            style={{ background: "#fff", color: "#000", fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Create project →
          </button>
        </div>
      )}

      {/* Reasoning animation */}
      {(generating || showAnswer) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: 12 }}>
            ⚡ AI Strategy Report
          </div>
          <ReasoningSteps steps={reasoning} active={reasoningActive} />
        </div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ fontSize: 13, color: "#f87171", padding: "12px 16px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, marginTop: 12 }}>
          {error}
        </motion.div>
      )}

      {/* AI Report results */}
      <AnimatePresence>
        {report && showAnswer && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Momentum score + summary */}
            <div style={{ ...card, padding: "20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <MomentumRing score={report.momentum_score} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Momentum score</div>
                <div style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.6 }}>
                  <TypewriterText text={report.summary} isNew={isNew} />
                </div>
              </div>
            </div>

            {[
              { label: "Intention vs action", value: report.intention_vs_action, color: "#fbbf24" },
              { label: "Biggest gap", value: report.biggest_gap, color: "#f87171" },
              { label: "Next week focus", value: report.next_week_focus, color: "#4ade80" },
              { label: "Honest assessment", value: report.honest_assessment, color: "#a78bfa" },
            ].map((section, i) => (
              <motion.div key={section.label}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                style={{ ...card }}>
                <div style={{ ...sectionHead, color: section.color }}>{section.label}</div>
                <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.7, fontFamily: "monospace" }}>
                  <TypewriterText text={section.value} isNew={isNew && i < 2} />
                </div>
              </motion.div>
            ))}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push("/ai-coach")}
                style={{ background: "transparent", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 12, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                Discuss with AI Coach →
              </button>
              <button onClick={generate}
                style={{ background: "transparent", border: "1px solid var(--bm-border)", color: "var(--bm-text3)", fontSize: 12, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                Regenerate
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Builder upgrade card — free users */}
      {!hasWeeklyReport && !generating && !showAnswer && summaries.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          style={{ ...card, marginTop: 16, padding: "28px 24px", textAlign: "center", border: "1px solid rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.04)" }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⚡</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Weekly AI Strategy Report</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.7, marginBottom: 20, fontFamily: "monospace", maxWidth: 440, margin: "0 auto 20px" }}>
            Every week: your intention vs action gap, momentum score, biggest blocker, next week focus, and a brutally honest assessment of your trajectory. Builder plan only.
          </div>
          <button onClick={() => showLimit("weekly_report")}
            style={{ padding: "11px 28px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 13, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Unlock weekly report — $19/mo →
          </button>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>Cancel anytime.</div>
        </motion.div>
      )}
    </motion.div>
  );
}

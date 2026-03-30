"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";

type Analysis = {
  verdict: string;
  kill_reasons: string[];
  survive_reasons: string[];
  brutal_advice: string;
  survival_probability: number;
};

function ProbabilityRing({ value }: { value: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const color = value >= 60 ? "#4ade80" : value >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <motion.circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (value / 100) * circ }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          style={{ fontSize: 26, fontWeight: 500, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value}%
        </motion.div>
        <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>survival</div>
      </div>
    </div>
  );
}

export default function BreakMyStartupPage() {
  const router = useRouter();
  const { data: projects = [], isLoading } = useProjectsQuery();
  const [selectedId, setSelectedId] = useState<string>("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const activeId = selectedId || projects[0]?.id || "";

  const runAnalysis = async () => {
    if (!activeId) return;
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");
      const res = await fetch("/api/ai/break-my-startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, projectId: activeId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error || "Analysis failed"));
      setAnalysis(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return (
    <div style={{ fontSize: 12, color: "#444", padding: "60px 0", textAlign: "center", fontFamily: "system-ui,sans-serif" }}>
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>Loading...</motion.div>
    </div>
  );

  if (!projects.length) return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 400, margin: "80px auto", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "32px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No projects yet</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 22, lineHeight: 1.6 }}>Create a project before running the analysis.</div>
        <button onClick={() => router.push("/projects")}
          style={{ background: "#fff", color: "#000", fontWeight: 500, fontSize: 13, padding: "9px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          New project
        </button>
      </div>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 860, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#f87171", letterSpacing: "-0.02em" }}>Break My Startup</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Honest failure analysis — before it&apos;s too late</div>
        </div>
        {projects.length > 1 && (
          <select value={activeId} onChange={(e) => setSelectedId(e.target.value)}
            style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#888", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
      </div>

      {/* Confirmation gate */}
      {!confirmed && !analysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "#0d0d0d", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "28px 26px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#fff", marginBottom: 10 }}>Are you ready for the truth?</div>
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7, marginBottom: 22 }}>
            This analysis will find every reason your startup could fail — weak validation, wrong target users, unrealistic assumptions, competition you&apos;re ignoring.
            It won&apos;t be comfortable. That&apos;s the point.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setConfirmed(true); void runAnalysis(); }}
              style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
              Break my startup →
            </motion.button>
            <button onClick={() => router.push("/dashboard")}
              style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#555", fontSize: 13, padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
              Not yet
            </button>
          </div>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 12, padding: "52px 32px", textAlign: "center" }}>
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontSize: 13, color: "#555" }}>
            Analyzing your startup...
          </motion.div>
          <div style={{ fontSize: 11, color: "#2a2a2a", marginTop: 8 }}>Reading your project data and running failure analysis</div>
        </motion.div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ fontSize: 13, color: "#f87171", padding: "12px 16px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8 }}>
          {error}
        </motion.div>
      )}

      {/* Analysis results */}
      <AnimatePresence>
        {analysis && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Verdict + ring */}
            <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "22px 24px", display: "flex", alignItems: "flex-start", gap: 22 }}>
              <ProbabilityRing value={analysis.survival_probability} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Verdict</div>
                <div style={{ fontSize: 15, color: "#f1f5f9", lineHeight: 1.6, fontWeight: 400 }}>{analysis.verdict}</div>
              </div>
            </div>

            {/* Kill reasons + survive reasons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#0d0d0d", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #111", background: "#080808", fontSize: 10, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                  Kill reasons
                </div>
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {(analysis.kill_reasons ?? []).map((r, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                      style={{ display: "flex", gap: 8, fontSize: 13, color: "#999", lineHeight: 1.55 }}>
                      <span style={{ color: "#f87171", flexShrink: 0, marginTop: 1 }}>×</span>{r}
                    </motion.div>
                  ))}
                </div>
              </div>
              <div style={{ background: "#0d0d0d", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #111", background: "#080808", fontSize: 10, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                  Why it could survive
                </div>
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {(analysis.survive_reasons ?? []).map((r, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                      style={{ display: "flex", gap: 8, fontSize: 13, color: "#999", lineHeight: 1.55 }}>
                      <span style={{ color: "#4ade80", flexShrink: 0, marginTop: 1 }}>✓</span>{r}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Brutal advice */}
            {analysis.brutal_advice && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #111", background: "#080808", fontSize: 10, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                  Brutal advice
                </div>
                <div style={{ padding: "18px 20px", fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>
                  {analysis.brutal_advice}
                </div>
              </motion.div>
            )}

            {/* Run again */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setAnalysis(null); setConfirmed(false); }}
                style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#555", fontSize: 12, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                Run again
              </button>
              <button onClick={() => router.push("/ai-coach")}
                style={{ background: "transparent", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 12, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                Discuss with BuildMini →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

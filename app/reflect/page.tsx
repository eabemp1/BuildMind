"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { incrementDailyStreak, getStoredStreak } from "@/lib/plan";
import { notifyStreakMilestone } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import { CheckCircle2, ChevronRight, Flame, Brain, ArrowRight } from "lucide-react";

type Outcome = "completed" | "blocked" | "partial" | "learned";

const OUTCOME_CHIPS: { id: Outcome; label: string; sublabel: string; color: string; bg: string; border: string; icon: string }[] = [
  { id: "completed", label: "Nailed it",        sublabel: "Made real progress",  color: "var(--bm-green)", bg: "var(--bm-accent-dim)",   border: "var(--bm-accent-bd)",         icon: "✓" },
  { id: "partial",   label: "Partly done",      sublabel: "Made some progress",  color: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)",  border: "rgba(232,160,32,0.22)",       icon: "◐" },
  { id: "blocked",   label: "Got blocked",      sublabel: "Hit a roadblock",     color: "var(--bm-red)",   bg: "rgba(224,85,85,0.08)",   border: "rgba(224,85,85,0.22)",        icon: "✕" },
  { id: "learned",   label: "Learned something",sublabel: "New insight",         color: "#A78BFA",         bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.22)",      icon: "↯" },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "var(--bm-red)", "var(--bm-amber)", "var(--bm-text2)", "var(--bm-teal)", "var(--bm-accent)"];

function buildFallbackCausality(o: Outcome, n: string, c: number): string {
  if (o === "completed" && c >= 4) return "You executed with high confidence → tomorrow builds on that momentum and goes one level deeper.";
  if (o === "completed") return "You got it done → that's the baseline. Tomorrow we sharpen the approach.";
  if (o === "partial") return "Partial progress is still progress → tomorrow the focus is removing the last blocker.";
  if (o === "blocked") return n ? `Blocked by: "${n}" → tomorrow the first task is removing this specific obstacle before anything else.` : "You hit a wall → tomorrow starts by naming and removing the obstacle specifically.";
  return "You gained an insight → tomorrow we apply it. Knowledge without action is just trivia.";
}

export default function ReflectPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [causality, setCausality] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [todayAction, setTodayAction] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bm_reflect_history") ?? "[]");
      setHistory(saved);
      const action = JSON.parse(localStorage.getItem("bm_today_action") ?? "{}");
      setTodayAction(action?.action ?? "");
      setStreak(getStoredStreak());
    } catch {}
  }, []);

  async function handleSubmit() {
    if (!outcome) return;
    setSubmitting(true);
    try {
      const fallback = buildFallbackCausality(outcome, note, confidence);
      let caus = fallback;
      let next = "";
      try {
        const res = await fetch("/api/ai/reflect-action", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome, note, confidence, todayAction, stage: "Idea", streak }),
        });
        if (res.ok) { const d = await res.json(); const payload = d.data ?? d; caus = payload.causality || fallback; next = payload.nextAction || ""; }
      } catch {}
      setCausality(caus);
      setNextAction(next);
      const entry = { date: Date.now(), outcome, note, confidence, causality: caus };
      const newHistory = [...history, entry].slice(-30);
      setHistory(newHistory);
      localStorage.setItem("bm_reflect_history", JSON.stringify(newHistory));
      const stats = getAchievementStats();
      updateAchievementStats({ ...stats, reflectionsLogged: (stats.reflectionsLogged ?? 0) + 1 });
      checkAndUnlockAchievements();

      // Increment streak only when the founder both completed today's action AND reflected.
      // bm_checkin_done_date is set by today/page.tsx after a successful check-in.
      const today = new Date().toISOString().split("T")[0];
      const checkinDoneToday = localStorage.getItem("bm_checkin_done_date") === today;
      if (checkinDoneToday) {
        const newStreak = incrementDailyStreak();
        updateAchievementStats({ ...getAchievementStats(), streak: newStreak });
        notifyStreakMilestone(newStreak);
      }

      trackFunnelStep("first_reflect");
      setDone(true);
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "60px 24px" }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle2 size={26} color="var(--bm-accent)" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 8 }}>Reflection saved</h2>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>This compounds. Every reflection makes tomorrow sharper.</p>
          </div>
          {causality && (
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)", borderRadius: 16, padding: "20px 22px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                <Brain size={10} /> AI Causality
              </div>
              <p style={{ fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>&ldquo;{causality}&rdquo;</p>
            </div>
          )}
          {nextAction && (
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Tomorrow's Focus</div>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{nextAction}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => router.push("/overview")} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Back to dashboard</button>
            <button onClick={() => router.push("/today")} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>See tomorrow's action →</button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "28px 24px" }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Daily Reflection</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>How did today go?</h1>
        {todayAction && <p style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 6, lineHeight: 1.5 }}>Today's action: <span style={{ color: "var(--bm-text2)" }}>{todayAction}</span></p>}
      </motion.div>

      {/* Outcome */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: "20px 22px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>What happened?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setOutcome(chip.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`, background: outcome === chip.id ? chip.bg : "var(--bm-bg3)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
              <span style={{ fontSize: 15, color: outcome === chip.id ? chip.color : "var(--bm-text3)", fontWeight: 700, width: 20 }}>{chip.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: outcome === chip.id ? 700 : 500, color: outcome === chip.id ? chip.color : "var(--bm-text2)" }}>{chip.label}</div>
                <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>{chip.sublabel}</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Note */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: "20px 22px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 10 }}>What actually happened? <span style={{ color: "var(--bm-text3)", fontWeight: 400 }}>(optional)</span></div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Be specific. What did you do? What did you learn? What got in the way?"
          style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.6, transition: "border-color 0.15s" }}
          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />
      </motion.div>

      {/* Confidence */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 }}>How confident do you feel?</div>
        <div style={{ fontSize: 12, color: CONFIDENCE_COLORS[confidence], fontWeight: 600, marginBottom: 12 }}>{CONFIDENCE_LABELS[confidence]}</div>
        <div style={{ display: "flex", gap: 9 }}>
          {[1,2,3,4,5].map(v => (
            <button key={v} onClick={() => setConfidence(v)}
              style={{ flex: 1, height: 36, borderRadius: 10, border: `1px solid ${confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-border)"}`, background: confidence === v ? `${CONFIDENCE_COLORS[v]}15` : "var(--bm-bg3)", color: confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-text3)", fontSize: 14, fontWeight: confidence === v ? 800 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {v}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={!outcome || submitting}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: !outcome ? "var(--bm-bg4)" : "var(--grad-primary)", color: !outcome ? "var(--bm-text3)" : "white", fontWeight: 700, fontSize: 14, cursor: !outcome ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {submitting ? "Saving…" : <>Save reflection <ArrowRight size={16} /></>}
      </motion.button>
    </div>
  );
}

"use client";

/**
 * app/reflect/page.tsx — Reflect (first-class page)
 *
 * The causality engine. Every input here changes the framing of tomorrow's action.
 * Outcome → freetext → confidence → AI writes the next causality strip.
 *
 * Local state writes immediately.
 * If Supabase env is present, also writes to DB for backend personalisation.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { trackFunnelStep } from "@/lib/onboarding-analytics";

// ─── Types ────────────────────────────────────────────────────────────────────
type Outcome = "completed" | "blocked" | "partial" | "learned";

interface ReflectEntry {
  outcome: Outcome;
  note: string;
  confidence: number; // 1-5
  timestamp: number;
  nextAction?: string;
  causality?: string; // "because you said X → today is Y"
}

// ─── Constants ────────────────────────────────────────────────────────────────
const OUTCOME_CHIPS: { id: Outcome; emoji: string; label: string; color: string; bg: string }[] = [
  { id: "completed", emoji: "✓", label: "Completed it",       color: "#4ade80", bg: "rgba(74,222,128,0.08)"  },
  { id: "partial",   emoji: "◐", label: "Partly done",        color: "#fbbf24", bg: "rgba(251,191,36,0.08)"  },
  { id: "blocked",   emoji: "✕", label: "Got blocked",        color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  { id: "learned",   emoji: "↯", label: "Learned something",  color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "#f87171", "#fbbf24", "#94a3b8", "#6ee7b7", "#4ade80"];

const BLOCKED_PROMPTS: Record<string, string> = {
  tech:     "What specific technical wall did you hit?",
  money:    "What resource constraint stopped you?",
  time:     "What stole your time today?",
  people:   "Who or what did you need that wasn't there?",
  default:  "What stopped you? Be specific — vague blockers don't get solved.",
};

// ─── Loading state ─────────────────────────────────────────────────────────────
function PulsingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          style={{ width: 4, height: 4, borderRadius: "50%", background: "#6366f1", display: "inline-block" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1, delay: i * 0.18, repeat: Infinity }}
        />
      ))}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReflectPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [generatedCausality, setGeneratedCausality] = useState("");
  const [generatedNextAction, setGeneratedNextAction] = useState("");
  const [blockerType, setBlockerType] = useState("");

  // Check if there's a pending action to reflect on
  const [todayAction, setTodayAction] = useState("");
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bm_today_action");
      if (saved) setTodayAction(JSON.parse(saved)?.action ?? "");
      const s = parseInt(localStorage.getItem("bm_streak") ?? "0", 10);
      setStreak(s);
      // Clear the "has pending reflect" dot once they open this page
      localStorage.setItem("bm_reflect_pending", "false");
    } catch {}
  }, []);

  const notePlaceholder =
    outcome === "blocked" ? (blockerType ? BLOCKED_PROMPTS[blockerType] : BLOCKED_PROMPTS.default)
    : outcome === "learned" ? "What did you learn? One concrete insight."
    : outcome === "partial"  ? "What got done, and what didn't?"
    : "What happened? What will you do differently?";

  async function handleSubmit() {
    if (!outcome) return;
    setSubmitting(true);

    // Write to localStorage immediately
    const entry: ReflectEntry = {
      outcome, note, confidence, timestamp: Date.now(),
    };

    try {
      // Call the AI reflect-action API to get a personalised next action + causality strip
      const stage = localStorage.getItem("bm_stage") ?? "Idea";
      const response = await fetch("/api/ai/reflect-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          note,
          confidence,
          stage,
          todayAction,
          streak,
        }),
      });

      if (response.ok) {
        const { data } = await response.json();
        entry.causality = data.causality;
        entry.nextAction = data.nextAction;
        setGeneratedCausality(data.causality);
        setGeneratedNextAction(data.nextAction);
      } else {
        // Fallback causality generation (local)
        const causality = buildFallbackCausality(outcome, note, confidence);
        entry.causality = causality;
        setGeneratedCausality(causality);
        setGeneratedNextAction(buildFallbackNextAction(outcome, stage));
      }
    } catch {
      const stage = localStorage.getItem("bm_stage") ?? "Idea";
      const causality = buildFallbackCausality(outcome, note, confidence);
      entry.causality = causality;
      setGeneratedCausality(causality);
      setGeneratedNextAction(buildFallbackNextAction(outcome, stage));
    }

    // Persist to localStorage
    try {
      const history: ReflectEntry[] = JSON.parse(localStorage.getItem("bm_reflect_history") ?? "[]");
      history.unshift(entry);
      localStorage.setItem("bm_reflect_history", JSON.stringify(history.slice(0, 30)));
      localStorage.setItem("bm_last_reflect", JSON.stringify(entry));
      localStorage.setItem("bm_reflect_pending", "false");

      // ── Achievement tracking ──────────────────────────────────────────────
      const curStats = getAchievementStats();
      updateAchievementStats({ reflectionsLogged: curStats.reflectionsLogged + 1 });
      setTimeout(() => checkAndUnlockAchievements(), 800);
      trackFunnelStep("first_reflect");
      // ─────────────────────────────────────────────────────────────────────
    } catch {}

    setSubmitting(false);
    setSubmitted(true);
  }

  function buildFallbackCausality(o: Outcome, n: string, c: number): string {
    if (o === "completed" && c >= 4) return "Because you completed it and feel confident → tomorrow goes deeper.";
    if (o === "completed") return "Because you completed it → tomorrow builds on that momentum.";
    if (o === "blocked") return `Because you got blocked${n ? ` (${n.slice(0, 40)})` : ""} → tomorrow removes that blocker first.`;
    if (o === "partial") return "Because you partially completed it → tomorrow finishes what you started.";
    if (o === "learned") return `Because you learned something new → tomorrow applies that insight directly.`;
    return "Based on your reflection → tomorrow's action is calibrated.";
  }

  function buildFallbackNextAction(o: Outcome, stage: string): string {
    if (o === "blocked") return "Identify and remove the specific blocker before starting anything else.";
    if (o === "learned") return "Apply what you learned — test the insight with one real user today.";
    if (o === "partial")  return "Finish what you started yesterday before adding anything new.";
    return `Continue in ${stage} stage — the next step is already waiting for you.`;
  }

  // ─── Submitted state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bm-bg)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: 28 }}
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
              style={{ fontSize: 40, textAlign: "center", marginBottom: 16 }}>
              {outcome === "completed" ? "🔥" : outcome === "blocked" ? "🔓" : outcome === "learned" ? "⚡" : "◑"}
            </motion.div>

            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--bm-text)", marginBottom: 6 }}>
                Reflection saved.
              </div>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.5 }}>
                BuildMind has recalibrated your next action.
              </div>
            </div>

            {/* Causality strip */}
            {generatedCausality && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  background: "rgba(99,102,241,0.07)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 10, color: "#6366f1", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                  Why tomorrow changed
                </div>
                <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, fontStyle: "italic" }}>
                  {generatedCausality}
                </div>
              </motion.div>
            )}

            {/* Next action preview */}
            {generatedNextAction && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                style={{
                  background: "var(--bm-bg3)",
                  border: "1px solid var(--bm-border2)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 10, color: "var(--bm-text4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                  Tomorrow's focus
                </div>
                <div style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.6, fontWeight: 500 }}>
                  {generatedNextAction}
                </div>
              </motion.div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <motion.button
                onClick={() => router.push("/today")}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                style={{
                  width: "100%", padding: "12px 0",
                  background: "white", color: "black",
                  border: "none", borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Back to Today →
              </motion.button>
              <button
                onClick={() => { setSubmitted(false); setOutcome(null); setNote(""); setConfidence(3); }}
                style={{ background: "transparent", border: "1px solid var(--bm-border)", color: "var(--bm-text3)", borderRadius: 10, padding: "10px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                Reflect again
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: 11, color: "var(--bm-text4)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            Daily Reflect
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--bm-text)", margin: 0, marginBottom: 6, letterSpacing: "-0.02em" }}>
            What happened today?
          </h1>
          <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, marginBottom: 28, lineHeight: 1.5 }}>
            Your answer changes tomorrow's action. Be honest — the app can handle the truth.
          </p>
        </motion.div>

        {/* Today's action reminder */}
        {todayAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{
              background: "var(--bm-bg2)",
              border: "1px solid var(--bm-border)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--bm-text4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              Today's action was
            </div>
            <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.5 }}>
              {todayAction}
            </div>
          </motion.div>
        )}

        {/* Outcome chips */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "var(--bm-text4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
            Outcome
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {OUTCOME_CHIPS.map((chip) => (
              <motion.button
                key={chip.id}
                onClick={() => setOutcome(chip.id)}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 14px",
                  background: outcome === chip.id ? chip.bg : "var(--bm-bg2)",
                  border: `1px solid ${outcome === chip.id ? chip.color : "var(--bm-border)"}`,
                  borderRadius: 10,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 16, color: chip.color, fontWeight: 700, minWidth: 20, textAlign: "center" }}>
                  {chip.emoji}
                </span>
                <span style={{ fontSize: 12, fontWeight: outcome === chip.id ? 600 : 400, color: outcome === chip.id ? chip.color : "var(--bm-text3)" }}>
                  {chip.label}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Blocked type selector */}
        <AnimatePresence>
          {outcome === "blocked" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
              style={{ overflow: "hidden", marginBottom: 16 }}
            >
              <div style={{ fontSize: 11, color: "var(--bm-text4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                What kind of blocker?
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["tech", "money", "time", "people"].map((b) => (
                  <button key={b} onClick={() => setBlockerType(b)}
                    style={{
                      padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                      background: blockerType === b ? "rgba(248,113,113,0.12)" : "var(--bm-bg2)",
                      border: `1px solid ${blockerType === b ? "#f87171" : "var(--bm-border)"}`,
                      color: blockerType === b ? "#f87171" : "var(--bm-text3)",
                      transition: "all 0.15s",
                    }}>
                    {b}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Freetext note */}
        <AnimatePresence>
          {outcome && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{ marginBottom: 20 }}
            >
              <div style={{ fontSize: 11, color: "var(--bm-text4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Tell me more
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={notePlaceholder}
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--bm-bg2)",
                  border: "1px solid var(--bm-border2)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: "var(--bm-text)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                  lineHeight: 1.6,
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confidence slider */}
        <AnimatePresence>
          {outcome && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              style={{ marginBottom: 28 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "var(--bm-text4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Confidence right now
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: CONFIDENCE_COLORS[confidence] }}>
                  {CONFIDENCE_LABELS[confidence]}
                </div>
              </div>
              <input
                type="range" min={1} max={5} value={confidence}
                onChange={(e) => setConfidence(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: CONFIDENCE_COLORS[confidence], cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "var(--bm-text4)" }}>Lost</span>
                <span style={{ fontSize: 10, color: "var(--bm-text4)" }}>Unstoppable</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <AnimatePresence>
          {outcome && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <motion.button
                onClick={handleSubmit}
                disabled={submitting}
                whileHover={submitting ? {} : { scale: 1.02 }}
                whileTap={submitting ? {} : { scale: 0.97 }}
                style={{
                  width: "100%", padding: "14px 0",
                  background: submitting ? "rgba(255,255,255,0.08)" : "white",
                  color: submitting ? "var(--bm-text4)" : "black",
                  border: "none", borderRadius: 12,
                  fontSize: 14, fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}
              >
                {submitting ? (
                  <><PulsingDots /><span style={{ color: "var(--bm-text3)", fontSize: 12 }}>BuildMind is recalibrating…</span></>
                ) : (
                  "Save reflection →"
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streak reinforcement */}
        {streak > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--bm-text4)" }}>
            {streak >= 7 ? "Most founders quit before day 7. You're still here." :
             streak >= 3 ? `${streak} day streak. You're someone who executes.` :
             `Day ${streak + 1}. Every reflection sharpens the next move.`}
          </motion.div>
        )}
      </div>
    </div>
  );
}

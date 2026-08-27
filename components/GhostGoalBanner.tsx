"use client";

/**
 * components/GhostGoalBanner.tsx
 *
 * The "ghost" weekly goal tracker. Renders as a small chip —
 * "Vigil 3/5" — that sits inline in the project badge row on Today, not as
 * its own permanently-open card. Tapping the chip opens the full detail
 * (progress rings, status message, change/recalibrate) in a modal.
 *
 * Per the Today-page standing rule: the daily task (DecisionBrief) is the
 * only thing allowed a permanently-open full block. Everything else here —
 * goal text, score/task progress, status messaging — is one tap away, not
 * pushed into the default view. Renders nothing at all while loading, so
 * there's no flash of an empty chip before the first goal check resolves.
 *
 * All data fetching/save/calibrate logic is unchanged from the previous
 * banner version — only the presentation layer changed.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Sparkles, X, Check, TrendingUp, AlertTriangle } from "lucide-react";

export interface WeeklyGoal {
  id: string;
  goal_text: string;
  goal_type: "custom" | "ai_calibrated";
  target_score: number;
  target_tasks: number;
  tasks_done: number;
  current_score: number;
  status: "active" | "surpassed" | "on_track" | "missed";
  week_start: string;
}

interface GhostGoalBannerProps {
  projectId: string;
  currentScore: number;
  tasksCompletedToday?: number;
  stage?: string;
  executionScore?: number;
  streak?: number;
  startupSummary?: string;
  projectName?: string;
}

function ProgressRing({
  value, max, color, size = 36,
}: { value: number; max: number; color: string; size?: number }) {
  const pct = Math.min(1, Math.max(0, value / Math.max(1, max)));
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

export default function GhostGoalBanner({
  projectId,
  currentScore,
  stage = "Idea",
  executionScore = 50,
  streak = 0,
  startupSummary = "",
  projectName = "",
}: GhostGoalBannerProps) {
  const [goal, setGoal]               = useState<WeeklyGoal | null>(null);
  const [loading, setLoading]         = useState(true);
  // Repurposed: "expanded" now means "modal open", not "inline detail open".
  const [expanded, setExpanded]       = useState(false);
  const [settingGoal, setSettingGoal] = useState(false);
  const [customText, setCustomText]   = useState("");
  const [calibrating, setCalibrating] = useState(false);
  const [dismissed, setDismissed]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Load the current week's goal — unchanged ────────────────────────────
  const fetchGoal = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/weekly-goal?project_id=${projectId}`);
      const json = await res.json() as { ok: boolean; data?: WeeklyGoal };
      if (json.ok && json.data) {
        setGoal({ ...json.data, current_score: currentScore });
      } else {
        setGoal(null);
      }
    } catch {
      setGoal(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentScore]);

  useEffect(() => { void fetchGoal(); }, [fetchGoal]);

  // Sync score update when currentScore changes — unchanged
  useEffect(() => {
    if (!goal || !projectId) return;
    fetch("/api/weekly-goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, current_score: currentScore }),
    }).catch(() => {});
    setGoal(g => g ? { ...g, current_score: currentScore } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScore]);

  async function handleSaveCustomGoal() {
    if (!customText.trim() || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      let targetScore = Math.min(95, Math.max(55, currentScore + 10));
      let targetTasks = streak >= 14 ? 7 : streak >= 7 ? 6 : 5;
      try {
        const calRes = await fetch("/api/ai/calibrate-goal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            custom_text: customText.trim(),
            stage, execution_score: currentScore, streak,
            startup_summary: startupSummary, project_name: projectName,
          }),
        });
        const calJson = await calRes.json() as { ok: boolean; target_score?: number; target_tasks?: number };
        if (calJson.ok) {
          targetScore = calJson.target_score ?? targetScore;
          targetTasks = calJson.target_tasks ?? targetTasks;
        }
      } catch {
        // Non-fatal — falls back to the formula above rather than blocking save.
      }

      const res = await fetch("/api/weekly-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:   projectId,
          goal_text:    customText.trim(),
          goal_type:    "custom",
          target_score: targetScore,
          target_tasks: targetTasks,
        }),
      });
      const json = await res.json() as { ok: boolean; data?: WeeklyGoal; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      setGoal(json.data ?? null);
      setSettingGoal(false);
      setCustomText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleCalibrateGoal() {
    if (!projectId) return;
    setCalibrating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/calibrate-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage, execution_score: executionScore, streak,
          startup_summary: startupSummary, project_name: projectName,
        }),
      });
      const json = await res.json() as {
        ok: boolean; goal_text?: string; target_score?: number; target_tasks?: number; error?: string;
      };
      if (!json.ok || !json.goal_text) throw new Error(json.error ?? "Calibration failed");

      const saveRes = await fetch("/api/weekly-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:   projectId,
          goal_text:    json.goal_text,
          goal_type:    "ai_calibrated",
          target_score: json.target_score ?? 70,
          target_tasks: json.target_tasks ?? 5,
        }),
      });
      const saveJson = await saveRes.json() as { ok: boolean; data?: WeeklyGoal };
      if (saveJson.ok && saveJson.data) {
        setGoal(saveJson.data);
        setSettingGoal(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calibration failed");
    } finally {
      setCalibrating(false);
    }
  }

  if (dismissed) return null;
  // Nothing while loading — avoids a flash of an empty chip before the
  // first goal check resolves.
  if (loading) return null;

  const getGhostColor = () => {
    if (!goal) return "var(--bm-text4)";
    if (goal.status === "surpassed") return "var(--bm-teal, #4AB8B0)";
    if (goal.status === "on_track")  return "var(--bm-accent)";
    const behind = currentScore < (goal.target_score ?? 70) * 0.6;
    return behind ? "var(--bm-red, #E05555)" : "var(--bm-text3)";
  };
  const ghostColor = getGhostColor();

  const scorePct  = goal ? Math.min(100, Math.round((goal.current_score / Math.max(1, goal.target_score)) * 100)) : 0;
  const taskPct   = goal ? Math.min(100, Math.round((goal.tasks_done / Math.max(1, goal.target_tasks)) * 100)) : 0;
  const surpassed = goal?.status === "surpassed";
  const behind    = goal ? goal.current_score < goal.target_score * 0.5 && goal.tasks_done < Math.floor(goal.target_tasks * 0.5) : false;

  const chipGlyph = !goal ? "◎" : surpassed ? "✦" : behind ? "⚠" : "◎";
  const chipLabel = !goal ? "Vigil" : `Vigil ${goal.tasks_done}/${goal.target_tasks}`;

  return (
    <>
      {/* ── Compact chip — the only thing visible by default ── */}
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 9px",
          borderRadius: 99,
          border: `1px solid ${goal ? (surpassed ? "rgba(74,184,176,0.3)" : behind ? "rgba(224,85,85,0.25)" : "var(--bm-border2)") : "var(--bm-border)"}`,
          background: "var(--bm-bg3)",
          color: ghostColor,
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          cursor: "pointer",
          flexShrink: 0,
        }}
        title={goal ? goal.goal_text : "Set a weekly goal"}
      >
        <span style={{ fontSize: 10 }}>{chipGlyph}</span>
        {chipLabel}
      </button>

      {/* ── Full detail — modal, opened on tap only ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 999,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20, background: "rgba(12,13,15,0.82)", backdropFilter: "blur(10px)",
              fontFamily: "inherit",
            }}
            onClick={e => { if (e.target === e.currentTarget) setExpanded(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: "100%", maxWidth: 380,
                borderRadius: 14, border: "1px solid var(--bm-border2)",
                background: "var(--bm-bg2)", overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Weekly Vigil
                </span>
                <button
                  onClick={() => setExpanded(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--bm-text4)" }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* ── No goal set yet ── */}
              {!goal ? (
                <div style={{ padding: "12px 16px 16px" }}>
                  <AnimatePresence mode="wait">
                    {!settingGoal ? (
                      <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                          <Target size={14} color="var(--bm-text4)" style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.5 }}>
                            Set a goal for this week — it&apos;ll follow you like a ghost through every check-in.
                          </span>
                        </div>
                        <button
                          onClick={() => setSettingGoal(true)}
                          style={{
                            width: "100%", padding: "9px 14px", borderRadius: 8,
                            border: "1px solid var(--bm-accent-bd)", background: "var(--bm-accent)",
                            color: "var(--bm-bg)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          Set goal →
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div key="form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <textarea
                          value={customText}
                          onChange={e => setCustomText(e.target.value)}
                          placeholder="e.g. Talk to 5 potential users and validate the core problem with real signal..."
                          rows={2}
                          style={{
                            width: "100%", padding: "10px 12px",
                            borderRadius: 8, border: "1px solid var(--bm-border2)",
                            background: "var(--bm-bg3)", color: "var(--bm-text)",
                            fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none",
                          }}
                        />
                        {error && <p style={{ fontSize: 11, color: "var(--bm-red, #E05555)", margin: 0 }}>{error}</p>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            onClick={handleSaveCustomGoal}
                            disabled={saving || !customText.trim()}
                            style={{
                              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)",
                              background: "var(--bm-accent)", color: "var(--bm-bg)", fontSize: 12, fontWeight: 700,
                              cursor: saving || !customText.trim() ? "not-allowed" : "pointer",
                              opacity: saving || !customText.trim() ? 0.5 : 1, fontFamily: "inherit",
                            }}
                          >
                            {saving ? "Saving..." : "Set this goal"}
                          </button>
                          <button
                            onClick={handleCalibrateGoal}
                            disabled={calibrating}
                            style={{
                              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--bm-border2)",
                              background: "var(--bm-bg3)", color: "var(--bm-text2)", fontSize: 12, fontWeight: 600,
                              cursor: calibrating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5,
                              fontFamily: "inherit",
                            }}
                          >
                            <Sparkles size={11} color="var(--bm-accent)" />
                            {calibrating ? "Calibrating..." : "Let AI choose"}
                          </button>
                          <button
                            onClick={() => { setSettingGoal(false); setCustomText(""); setError(null); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--bm-text4)", fontFamily: "inherit" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button
                    onClick={() => { setDismissed(true); setExpanded(false); }}
                    style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--bm-text4)", fontFamily: "inherit" }}
                  >
                    Don&apos;t ask again this week
                  </button>
                </div>
              ) : (
                /* ── Goal exists — full detail ── */
                <div style={{ padding: "12px 16px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: ghostColor, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 3 }}>
                        {surpassed ? "Ghost surpassed" : behind ? "Falling behind ghost" : "Ghost goal"}
                        {goal.goal_type === "ai_calibrated" && (
                          <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 400 }}>· AI calibrated</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.4 }}>{goal.goal_text}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <ProgressRing value={goal.current_score} max={goal.target_score} color={ghostColor} size={32} />
                        <span style={{ fontSize: 8, color: "var(--bm-text4)", marginTop: 2 }}>score</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <ProgressRing value={goal.tasks_done} max={goal.target_tasks} color={ghostColor} size={32} />
                        <span style={{ fontSize: 8, color: "var(--bm-text4)", marginTop: 2 }}>tasks</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Score progress</span>
                      <span style={{ fontSize: 10, color: ghostColor, fontWeight: 700 }}>{goal.current_score} / {goal.target_score}{surpassed && " ✓"}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${scorePct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        style={{ height: "100%", background: ghostColor, borderRadius: 99 }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Tasks this week</span>
                      <span style={{ fontSize: 10, color: ghostColor, fontWeight: 700 }}>{goal.tasks_done} / {goal.target_tasks}{taskPct >= 100 && " ✓"}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${taskPct}%` }} transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        style={{ height: "100%", background: ghostColor, borderRadius: 99 }} />
                    </div>
                  </div>

                  {surpassed && (
                    <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderRadius: 8, background: "rgba(74,184,176,0.08)", border: "1px solid rgba(74,184,176,0.2)" }}>
                      <Check size={12} color="var(--bm-teal, #4AB8B0)" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 11, color: "var(--bm-teal, #4AB8B0)", margin: 0, lineHeight: 1.5 }}>
                        You&apos;ve surpassed this week&apos;s ghost goal. The system will set a harder target next week.
                      </p>
                    </div>
                  )}
                  {behind && !surpassed && (
                    <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderRadius: 8, background: "rgba(224,85,85,0.06)", border: "1px solid rgba(224,85,85,0.15)" }}>
                      <AlertTriangle size={12} color="var(--bm-red, #E05555)" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 11, color: "var(--bm-red, #E05555)", margin: 0, lineHeight: 1.5 }}>
                        You&apos;re tracking below this week&apos;s ghost. Today&apos;s task is your best recovery move.
                      </p>
                    </div>
                  )}
                  {!surpassed && !behind && (
                    <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderRadius: 8, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                      <TrendingUp size={12} color="var(--bm-text3)" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: 0, lineHeight: 1.5 }}>
                        On track. Complete today&apos;s action to keep the ghost in sight.
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <button
                      onClick={() => { setGoal(null); setSettingGoal(true); }}
                      style={{ fontSize: 10, color: "var(--bm-text4)", background: "none", border: "none", cursor: "pointer", padding: "3px 0", fontFamily: "inherit" }}
                    >
                      Change goal
                    </button>
                    <span style={{ color: "var(--bm-border)", fontSize: 10 }}>·</span>
                    <button
                      onClick={handleCalibrateGoal}
                      disabled={calibrating}
                      style={{
                        fontSize: 10, color: "var(--bm-accent)", background: "none", border: "none",
                        cursor: calibrating ? "not-allowed" : "pointer", padding: "3px 0",
                        display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
                      }}
                    >
                      <Sparkles size={9} />
                      {calibrating ? "Recalibrating..." : "AI recalibrate"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

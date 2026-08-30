"use client";

/**
 * CofounderPulse.tsx — AI Co-founder Pulse
 *
 * A persistent "co-founder presence" that appears in the dashboard sidebar.
 * Not a chatbot. Not a coach. A co-founder that:
 *   - Monitors the project and surfaces the ONE thing that matters today
 *   - Has an evolving personality that adapts based on the founder's behavior
 *   - Sends unprompted "co-founder moments" (concern, encouragement, challenge)
 *   - Learns what kind of partner the founder needs and becomes that
 *
 * This is what separates BuildMind from a task manager with AI sprinkled on it.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getFounderMemory,
  generateFounderInsight,
  evolveCofounderStyle,
  type FounderMemory,
  type CofounderStyle,
} from "@/lib/founderMemory";
import { getDashboardOverview } from "@/lib/buildmind";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { trackEvent } from "@/lib/analytics";
import { CofounderAvatar } from "./CofounderAvatar";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PulseMode =
  | "observing"    // quiet, watching
  | "alert"        // something needs attention now
  | "insight"      // non-obvious pattern surfaced
  | "challenge"    // pushes the founder
  | "celebrate";   // earned moment

type PulseMessage = {
  mode: PulseMode;
  text: string;
  action?: { label: string; prompt: string };
  timestamp: string;
};

// ─── Style metadata ───────────────────────────────────────────────────────────

const STYLE_META: Record<CofounderStyle, {
  name: string;
  tagline: string;
  color: string;
  observingText: string;
}> = {
  "direct-challenger": {
    name: "Challenger",
    tagline: "No filter. No comfort zone.",
    color: "#ef4444",
    observingText: "Watching. Waiting for you to slip.",
  },
  "strategic-partner": {
    name: "Strategist",
    tagline: "Thinking three moves ahead.",
    color: "var(--bm-text2)",
    observingText: "Running the long game in the background.",
  },
  "execution-coach": {
    name: "Coach",
    tagline: "Ship it. Learn. Repeat.",
    color: "#22c55e",
    observingText: "Tracking your momentum.",
  },
  "devil-advocate": {
    name: "Skeptic",
    tagline: "Assume you're wrong. Prove otherwise.",
    color: "#f59e0b",
    observingText: "Looking for the holes in your plan.",
  },
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
// Extracted to components/CofounderAvatar.tsx — documented there as the
// single swap point for a future real mascot (Rive/Lottie), so nothing here
// needs to change when that asset exists.

// ─── Feedback row ─────────────────────────────────────────────────────────────

function StyleFeedback({ onFeedback }: { onFeedback: (f: "too-soft" | "too-harsh" | "on-point" | "more-strategic") => void }) {
  return (
    <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 10, marginTop: 10 }}>
      <div style={{ fontSize: 10, color: "var(--bm-text3)", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8 }}>
        HOW'S THIS CO-FOUNDER HITTING?
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["too-soft", "on-point", "too-harsh", "more-strategic"] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFeedback(f)}
            style={{
              fontSize: 10, padding: "4px 9px", borderRadius: 5,
              background: "transparent", border: "1px solid var(--bm-border)",
              color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.03em",
            }}
          >
            {f.replace("-", " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CofounderPulse() {
  const [memory, setMemory] = useState<FounderMemory | null>(null);
  const [currentMessage, setCurrentMessage] = useState<PulseMessage | null>(null);
  const [mode, setMode] = useState<PulseMode>("observing");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [styleJustChanged, setStyleJustChanged] = useState<CofounderStyle | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeStyle = memory?.cofounder_style ?? "execution-coach";
  const meta = STYLE_META[activeStyle];

  // Load memory on mount
  useEffect(() => {
    loadMemoryAndSurface();
  }, []);

  async function loadMemoryAndSurface() {
    setLoading(true);
    const mem = await getFounderMemory();
    setMemory(mem);

    if (mem) {
      const msg = await deriveCofounderMessage(mem);
      setCurrentMessage(msg);
      setMode(msg.mode);
    }
    setLoading(false);
  }

  // Periodic re-surface (every 4 hours if page stays open)
  useEffect(() => {
    pulseTimer.current = setInterval(() => {
      if (memory) {
        deriveCofounderMessage(memory).then((msg) => {
          setCurrentMessage(msg);
          setMode(msg.mode);
        });
      }
    }, 4 * 60 * 60 * 1000);
    return () => { if (pulseTimer.current) clearInterval(pulseTimer.current); };
  }, [memory]);

  const handleFeedback = useCallback(async (
    feedback: "too-soft" | "too-harsh" | "on-point" | "more-strategic"
  ) => {
    trackEvent("cofounder_style_feedback", { feedback });
    const next = await evolveCofounderStyle(feedback);
    setMemory((prev) => prev ? { ...prev, cofounder_style: next } : prev);
    setStyleJustChanged(next);
    setShowFeedback(false);
    setTimeout(() => setStyleJustChanged(null), 3000);
  }, []);

  const handleActionClick = useCallback((prompt: string) => {
    // Navigates to AI coach with the prompt pre-filled
    const url = `/ai-coach?prompt=${encodeURIComponent(prompt)}`;
    window.location.href = url;
    trackEvent("cofounder_pulse_action");
  }, []);

  if (loading) {
    return (
      <div style={{
        background: "var(--bm-bg2)",
        borderRadius: 12,
        border: "1px solid var(--bm-border)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ width: 40, height: 40, borderRadius: 12, background: "var(--bm-bg)", border: "1px solid var(--bm-border)" }}
        />
        <div style={{ fontSize: 12, color: "var(--bm-text3)", fontFamily: "monospace" }}>
          co-founder loading...
        </div>
      </div>
    );
  }

  const modeColors: Record<PulseMode, string> = {
    observing: "var(--bm-border)",
    alert: "rgba(239,68,68,0.4)",
    insight: "rgba(129,140,248,0.4)",
    challenge: "rgba(245,158,11,0.4)",
    celebrate: "rgba(34,197,94,0.4)",
  };

  return (
    <div style={{
      background: "var(--bm-bg2)",
      borderRadius: 12,
      border: `1px solid ${modeColors[mode]}`,
      overflow: "hidden",
      transition: "border-color 0.4s",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 10,
          textAlign: "left",
        }}
      >
        <CofounderAvatar style={activeStyle} color={STYLE_META[activeStyle].color} pulsing={mode !== "observing"} mode={mode} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>
              {meta.name}
            </span>
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4,
              background: `${meta.color}18`, color: meta.color,
              fontFamily: "monospace", letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              co-founder
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", fontFamily: "monospace", marginTop: 1 }}>
            {meta.tagline}
          </div>
        </div>
        <span style={{ fontSize: 10, color: "var(--bm-text3)", flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Message */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 14px 14px" }}>
              {/* Mode badge */}
              <div style={{ marginBottom: 10 }}>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 4,
                  fontFamily: "monospace", letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: `${modeColors[mode]}`,
                  color: mode === "observing" ? "var(--bm-text3)" : "var(--bm-text)",
                }}>
                  {mode}
                </span>
              </div>

              {/* Current message */}
              {currentMessage ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.65, margin: "0 0 12px" }}>
                    {sanitizeOutput(currentMessage.text)}
                  </p>
                  {currentMessage.action && (
                    <button
                      onClick={() => handleActionClick(currentMessage.action!.prompt)}
                      style={{
                        fontSize: 12, padding: "7px 12px", borderRadius: 7,
                        background: meta.color + "18",
                        border: `1px solid ${meta.color}44`,
                        color: meta.color, cursor: "pointer", fontFamily: "inherit",
                        fontWeight: 500,
                      }}
                    >
                      {sanitizeOutput(currentMessage.action.label)} →
                    </button>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, margin: 0 }}>
                  {sanitizeOutput(meta.observingText)}
                </p>
              )}

              {/* Style just changed confirmation */}
              <AnimatePresence>
                {styleJustChanged && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      marginTop: 10, padding: "8px 10px",
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.2)",
                      borderRadius: 7, fontSize: 12, color: "#22c55e",
                    }}
                  >
                    Switched to {STYLE_META[styleJustChanged].name} mode.
                    Your co-founder is adapting.
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Feedback toggle */}
              <button
                onClick={() => setShowFeedback((s) => !s)}
                style={{
                  marginTop: 12, fontSize: 11, padding: 0,
                  background: "none", border: "none",
                  color: "var(--bm-text3)", cursor: "pointer",
                  fontFamily: "monospace", letterSpacing: "0.05em",
                }}
              >
                {showFeedback ? "hide feedback" : "calibrate co-founder →"}
              </button>

              {showFeedback && (
                <StyleFeedback onFeedback={handleFeedback} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed preview (mode indicator) */}
      {!expanded && mode !== "observing" && (
        <div style={{
          padding: "0 14px 10px",
          fontSize: 11,
          color: mode === "alert" ? "#ef4444" : mode === "insight" ? "var(--bm-text2)" : mode === "challenge" ? "#f59e0b" : "#22c55e",
          fontFamily: "monospace",
        }}>
          {sanitizeOutput(currentMessage?.text).slice(0, 80)}{currentMessage && sanitizeOutput(currentMessage.text).length > 80 ? "..." : ""}
        </div>
      )}
    </div>
  );
}

// ─── Message derivation ───────────────────────────────────────────────────────

async function deriveCofounderMessage(memory: FounderMemory): Promise<PulseMessage> {
  const now = new Date().toISOString();

  // Fetch live signals from getDashboardOverview to power dynamic mode selection
  let liveSignals: { momentumScore?: number; streak?: number; daysInactive?: number } = {};
  try {
    const overview = await getDashboardOverview();
    // DashboardOverview doesn't expose momentumScore directly — read streak and inactivity
    liveSignals = {
      momentumScore: undefined,  // fetched separately below
      streak:        overview?.founderStreakDays ?? undefined,
      daysInactive:  overview?.daysSinceLastReflection ?? undefined,
    };
    // FIX (High #8): was a raw `founder_context.momentum_score` query, run
    // independently of the rest of the app's Pulse engine (lib/pulse.ts,
    // /api/pulse/metrics) — a second, divergent momentum concept living
    // right next to the real one. Confirmed live (2026-08) that pulse_events,
    // pulse_scores, pulse_event_weights tables and get_pulse_streak /
    // upsert_pulse_score functions all exist, so this now reads the same
    // canonical pulseScore every other Pulse-aware surface uses.
    const res = await fetch("/api/pulse/metrics");
    if (res.ok) {
      const body = await res.json() as { ok?: boolean; data?: { pulseScore?: number } };
      if (body.ok && typeof body.data?.pulseScore === "number") {
        liveSignals.momentumScore = body.data.pulseScore;
      }
    }
  } catch { /* non-fatal */ }

  const mode = pickModeFromMemory(memory, liveSignals);

  // Dynamic alert messages for live signals — don't use stale insight for these
  if (mode === "alert") {
    const { daysInactive = 0, momentumScore = 50 } = liveSignals;
    const alertText = daysInactive >= 3
      ? `${daysInactive} days without a check-in. That's not a break — that's drift. What's actually blocking you?`
      : momentumScore < 35
      ? `Momentum is at ${momentumScore}. That's not a plateau — it's a slide. Today's task is the only thing that reverses it.`
      : `Something's off. Come back and log it before it compounds.`;
    return { mode: "alert", text: alertText, action: pickAction(memory), timestamp: now };
  }

  // Use existing last_insight if fresh (< 24h) and mode is non-alert
  if (memory.last_insight) {
    const lastUpdate = new Date(memory.updated_at);
    const ageHours = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) {
      return { mode, text: memory.last_insight, action: pickAction(memory), timestamp: now };
    }
  }

  // Generate fresh insight
  const freshInsight = await generateFounderInsight();
  if (freshInsight) {
    return { mode, text: freshInsight, action: pickAction(memory), timestamp: now };
  }

  // Fallback
  const { momentumScore = 50 } = liveSignals;
  return {
    mode: "observing",
    text: memory.avoidance_zones.length > 0
      ? `Still watching. You've been avoiding ${memory.avoidance_zones[0]} — momentum is at ${momentumScore}. We should address that.`
      : `Watching. Momentum at ${momentumScore}. Keep building.`,
    timestamp: now,
  };
}

function pickModeFromMemory(memory: FounderMemory, overview?: { momentumScore?: number; streak?: number; daysInactive?: number }): PulseMode {
  const momentum    = overview?.momentumScore ?? 50;
  const streak      = overview?.streak ?? 0;
  const daysInactive = overview?.daysInactive ?? 0;

  // Live signals take priority over memory patterns
  if (daysInactive >= 3) return "alert";
  if (momentum < 35) return "alert";
  if (momentum < 50 && streak === 0) return "challenge";
  if (memory.avoidance_zones.length >= 3) return "challenge";
  if (streak >= 7 && momentum >= 65) return "celebrate";
  if (memory.strengths.length >= 3 && momentum >= 60) return "celebrate";
  if (memory.decision_patterns.some((p) => p.count >= 5 && p.pattern.includes("overdue"))) return "alert";
  if (memory.last_insight) return "insight";
  return "observing";
}

function pickAction(memory: FounderMemory): PulseMessage["action"] | undefined {
  const style = memory.cofounder_style ?? "execution-coach";

  if (memory.avoidance_zones.length > 0) {
    const zone = memory.avoidance_zones[0];
    return {
      label: `Tackle ${zone}`,
      prompt: `I've been avoiding ${zone}. Help me understand why, and give me the smallest possible step to break through it today.`,
    };
  }

  if (style === "strategic-partner") {
    return {
      label: "Run a strategy check",
      prompt: "Based on where I am right now, what's the most important strategic decision I need to make in the next 2 weeks?",
    };
  }

  if (style === "direct-challenger") {
    return {
      label: "Challenge me",
      prompt: "Ask me the hardest question I'm not asking myself right now.",
    };
  }

  return {
    label: "What's my one thing today?",
    prompt: "Given everything you know about my startup and my patterns, what is the single most important thing I should do today?",
  };
                }

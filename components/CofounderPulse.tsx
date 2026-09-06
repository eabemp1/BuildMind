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
 *
 * Status: mode selection previously came from a local pickModeFromMemory()
 * thresholding momentum/streak/daysInactive on its own — a fourth
 * independent verdict, disagreeing-by-construction with Overview,
 * Projects-list, and the real stage-readiness tier, since it never read any
 * of them, and its "daysInactive" was actually daysSinceLastReflection (a
 * narrower thing than activity). Now reads FounderStanding from
 * /api/founder-context/standing — same signal every other surface reads —
 * via deriveCofounderMode() in lib/server/founderStanding.ts. Re-derivation
 * is now event-driven (tab refocus, a pulse-refresh event real actions
 * dispatch) instead of a passive 4-hour timer — see the effect below.
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
import { deriveCofounderMode, type FounderStanding } from "@/lib/server/founderStanding";
// Type-only import of PulseMode flows the other way (founderStanding.ts →
// this file) — using `import type` there keeps it erased at compile time,
// so this isn't a real runtime circular dependency, just a shared type.
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { trackEvent } from "@/lib/analytics";
import { CofounderAvatar, CofounderMascot } from "./CofounderAvatar";

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

  // ── Presence, not polling ──────────────────────────────────────────────
  // The old version only re-derived on mount and then again 4 hours later
  // if the tab happened to stay open — so a founder could complete a task,
  // log evidence, or go quiet for a week, and the mascot in the sidebar
  // would keep showing whatever it thought 4 hours ago. That's a status
  // widget, not a co-founder who's actually paying attention.
  //
  // Two real triggers replace the dumb timer:
  //   1. Tab regains focus — catches "came back after being away," which
  //      is exactly the moment a stale mood is most noticeable and most
  //      wrong.
  //   2. A "bm:pulse-refresh" event, dispatched by the actual places state
  //      changes — task completion, reflection submission, stage
  //      transition, evidence logged. This file only listens; the
  //      dispatch calls themselves need adding at each mutation site (see
  //      pulse-refresh-dispatch.patch.md for the worked example and the
  //      remaining call sites).
  // The 4-hour interval stays, but only as a dead-man's-switch fallback in
  // case a founder leaves a tab open for hours without touching anything —
  // it should rarely be the thing that actually fires. This is meant to
  // make the co-founder feel present when something real happened, not to
  // manufacture reasons to check in — no new interval was added, no new
  // notification channel, nothing that nags on a timer.
  useEffect(() => {
    function handleRefresh() {
      if (memory) {
        deriveCofounderMessage(memory).then((msg) => {
          setCurrentMessage(msg);
          setMode(msg.mode);
        });
      }
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") handleRefresh();
    }
    window.addEventListener("bm:pulse-refresh", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);
    pulseTimer.current = setInterval(handleRefresh, 4 * 60 * 60 * 1000);
    return () => {
      window.removeEventListener("bm:pulse-refresh", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (pulseTimer.current) clearInterval(pulseTimer.current);
    };
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
              {/* Full mascot — the same real mode/style state as the compact
                  header avatar, just given room to actually read as a
                  character once the panel is open. */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <CofounderMascot style={activeStyle} color={meta.color} pulsing={mode !== "observing"} mode={mode} size={72} />
              </div>

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

  // Fetch live signals: standing (real readiness + engagement, shared with
  // Execution and Projects-list) and the canonical Pulse momentum score.
  // Both are fetched in parallel — neither is allowed to block the other,
  // since a slow readiness query shouldn't delay a momentum-based alert
  // and vice versa.
  let standing: FounderStanding | null = null;
  let momentumScore: number | undefined;
  let streak: number | undefined;

  try {
    const [standingRes, pulseRes, overview] = await Promise.all([
      fetch("/api/founder-context/standing").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/pulse/metrics").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      getDashboardOverview().catch(() => null),
    ]);
    if (standingRes?.ok && standingRes.data) standing = standingRes.data as FounderStanding;
    if (pulseRes?.ok && typeof pulseRes.data?.pulseScore === "number") momentumScore = pulseRes.data.pulseScore;
    streak = overview?.founderStreakDays ?? undefined;
  } catch { /* non-fatal — deriveCofounderMode handles a null standing below */ }

  // FIX (this pass): mode used to come from pickModeFromMemory() thresholding
  // raw momentum/streak/daysInactive independently of Overview, Projects-list,
  // and the real readiness tier — a fourth, disagreeing verdict. Now it reads
  // the same FounderStanding those surfaces read. If the standing fetch
  // failed (offline, cold start), fall back to "observing" rather than
  // guessing at a mood from partial data — the fallback path below already
  // has honest observing/challenge copy for exactly that case.
  const mode: PulseMode = standing
    ? deriveCofounderMode(standing, memory, momentumScore)
    : "observing";

  // Dynamic alert messages for live signals — don't use stale insight for these
  if (mode === "alert") {
    const daysInactive = standing?.daysInactive ?? 0;
    const alertText = standing?.engagement === "stalled"
      ? `${daysInactive} days without activity on this project. That's not a break — that's drift. What's actually blocking you?`
      : typeof momentumScore === "number" && momentumScore < 35
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
  const readinessNote = standing?.readiness.tier === "checklist_only"
    ? " Milestones are done — evidence is what's thin."
    : "";
  return {
    mode: "observing",
    text: memory.avoidance_zones.length > 0
      ? `Still watching. You've been avoiding ${memory.avoidance_zones[0]}.${readinessNote}`
      : `Watching.${streak ? ` ${streak}-day streak.` : ""}${readinessNote || " Keep building."}`,
    timestamp: now,
  };
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

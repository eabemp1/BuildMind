"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PaywallMoment } from "@/components/PaywallMoment";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { MilestoneBreakResult, WEEK_ONE_MILESTONES } from "../todayHelpers";

/** Mandatory checkpoint shown after a milestone or stage change. */
export function MilestoneBreakScreen({
  milestoneBreak, isMobile, onAcknowledge,
}: { milestoneBreak: MilestoneBreakResult; isMobile: boolean; onAcknowledge: () => void }) {
  const isStalling = milestoneBreak.trigger === "stalling";
  return (
  <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "40px 16px" : "80px 24px" }}>
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: isStalling ? "var(--bm-amber)" : "var(--bm-red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={16} color={isStalling ? "#000" : "#fff"} />
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
            {isStalling ? "Still open" : "Mandatory checkpoint"}
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", margin: 0, lineHeight: 1.3 }}>
            {isStalling
              ? `Still working on: ${sanitizeOutput(milestoneBreak.triggerLabel)}`
              : `You just completed: ${sanitizeOutput(milestoneBreak.triggerLabel)}`}
          </p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 24 }}>
        {isStalling
          ? "This has been open longer than expected. No judgment — some milestones just run long. Here's what's likely actually going on."
          : "Before you move to the next milestone, here's what could still kill this."}
      </p>

      {/* 3 brutal points */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {milestoneBreak.brutal_points.map((point, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bm-red)", marginTop: 6, flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>{sanitizeOutput(point)}</p>
          </motion.div>
        ))}
      </div>

      {/* Recommended action */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Recommended action before continuing</p>
        <p style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500, margin: 0, lineHeight: 1.6 }}>→ {sanitizeOutput(milestoneBreak.recommended_action)}</p>
      </div>

      {/* Acknowledge button */}
      <button
        onClick={onAcknowledge}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
          background: "var(--bm-text)", color: "var(--bm-bg)",
          fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        I've acknowledged this — continue to today's task →
      </button>
    </motion.div>
  </div>
  );
}

/** Shown after a check-in is logged. */
export function DoneScreen({
  isMobile, isFirstSession, displayName, startupStage, activePattern, plan, onDismissPattern,
}: {
  isMobile: boolean; isFirstSession: boolean; displayName: string | null | undefined;
  startupStage: string | null | undefined;
  activePattern: { signal: string; message: string; severity: string } | null;
  plan: string; onDismissPattern: () => void;
}) {
  const router = useRouter();
  return (
  <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "36px 0" : "60px 24px", textAlign: "center" }}>
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bm-green-dim)", border: "1px solid var(--bm-green-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <CheckCircle2 size={28} color="var(--bm-green)" />
      </div>
      <h2 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 10 }}>
        Insight logged. BuildMind adapts.
      </h2>
      <p style={{ fontSize: 14, color: "var(--bm-text3)", marginBottom: isFirstSession ? 16 : 20, lineHeight: 1.6 }}>
        {displayName ? `Come back tomorrow, ${displayName.split(" ")[0]}. Consistency compounds.` : "Come back tomorrow. Consistency compounds."}
      </p>

      {/* ── First-session: 7-day projection ── */}
      {isFirstSession && (() => {
        const sk = (startupStage ?? "Idea").toLowerCase();
        const milestones = WEEK_ONE_MILESTONES[sk] ?? WEEK_ONE_MILESTONES.idea;
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, textAlign: "left" }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              If you do this every day — week 1 for a {startupStage ?? "Idea"} stage founder
            </div>
            {milestones.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < milestones.length - 1 ? 10 : 0, marginBottom: i < milestones.length - 1 ? 10 : 0, borderBottom: i < milestones.length - 1 ? "1px solid var(--bm-border)" : "none" }}>
                <span style={{ fontSize: 11, color: "var(--bm-text4)", fontFamily: "monospace", paddingTop: 1, flexShrink: 0, minWidth: 36 }}>Day {m.day}</span>
                <span style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>{m.milestone}</span>
              </div>
            ))}
          </motion.div>
        );
      })()}

      {activePattern && (
        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <PaywallMoment
            trigger={plan === "free" ? "pattern" : "pattern"}
            patternMessage={activePattern.message}
            onDismiss={() => onDismissPattern()}
          />
        </div>
      )}



      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "center" }}>
        <button onClick={() => router.push("/reflect")} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reflect on today →</button>
        <button onClick={() => router.push("/overview")} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>View full dashboard</button>
      </div>
    </motion.div>

    <div style={{ marginTop: 24, padding: "14px 18px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, textAlign: "center" }}>
      <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "0 0 10px" }}>Know a founder who needs this?</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={() => router.push("/invite")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text2)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Invite a founder →
        </button>
        <button onClick={() => router.push("/progress")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Share this week's progress
        </button>
      </div>
    </div>
  </div>
  );
}

/** Evening check-in notification opt-in. */
export function PushPrompt({
  show, isMobile, onEnable, onDismiss,
}: { show: boolean; isMobile: boolean; onEnable: () => void; onDismiss: () => void }) {
  return (
  <AnimatePresence>
    {show && (
      <motion.div
        key="push-prompt"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "fixed",
          bottom: isMobile ? 80 : 32,
          left: "50%",
          transform: "translateX(-50%)",
          width: isMobile ? "calc(100% - 32px)" : 380,
          zIndex: 999,
          borderRadius: 16,
          border: "1px solid var(--bm-border)",
          background: "var(--bm-bg2)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🔔</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4 }}>
              Get your evening nudge
            </div>
            <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0, lineHeight: 1.55 }}>
              BuildMind checks in at 8pm to see if you followed through. One tap to enable — you can turn it off anytime.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onEnable()}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: "var(--bm-accent)",
              color: "#000",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Enable evening check-in
          </button>
          <button
            onClick={() => onDismiss()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--bm-border2)",
              background: "var(--bm-bg3)",
              color: "var(--bm-text4)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Not now
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
  );
}

/**
 * components/MorningBriefingModal.tsx
 *
 * Full-screen overlay that surfaces the morning briefing on the first
 * Today page open of each day. Dismissed via button, footer CTA, or
 * backdrop tap. Will NOT surface again until the next calendar day
 * (dismiss date written to founder_memory.briefing_dismissed_date — persists
 * across devices and browsers, unlike localStorage).
 *
 * Free tier:   truncated win preview + upgrade prompt.
 * Builder+:    win / risk / now / gaps in full.
 *
 * Props:
 *   briefing    — MorningBriefing | null  (null when plan is paywalled)
 *   isPaywalled — pass true when plan === "free"
 *   onDismiss   — called when the user taps any dismiss surface;
 *                 parent is responsible for writing briefing_dismissed_date
 *                 to the server so the dismiss persists cross-device.
 */
"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import type { MorningBriefing } from "@/lib/founderContext";

interface Props {
  briefing: MorningBriefing | null;
  isPaywalled: boolean;
  onDismiss: () => void;
}

export default function MorningBriefingModal({ briefing, isPaywalled, onDismiss }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="briefing-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px",
        }}
      >
        {/* Panel — stop propagation so panel taps don't trigger backdrop dismiss */}
        <motion.div
          key="briefing-panel"
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 460,
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-accent-bd)",
            borderRadius: 18,
            padding: "28px 26px 24px",
            position: "relative",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          {/* × button */}
          <button
            onClick={onDismiss}
            aria-label="Dismiss morning briefing"
            style={{
              position: "absolute",
              top: 14,
              right: 16,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--bm-text4)",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              borderRadius: 6,
            }}
          >
            ×
          </button>

          {/* Header */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--bm-accent)",
              marginBottom: 4,
            }}
          >
            ⚡ Morning briefing
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--bm-text4)",
              margin: "0 0 22px",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {dateLabel}
          </p>

          {/* Content */}
          {isPaywalled || !briefing ? (
            <PaywalledContent win={briefing?.win} />
          ) : (
            <FullContent briefing={briefing} />
          )}

          {/* Footer dismiss CTA */}
          <button
            onClick={onDismiss}
            style={{
              marginTop: 24,
              width: "100%",
              padding: "11px 0",
              borderRadius: 10,
              border: "1px solid var(--bm-border2)",
              background: "transparent",
              color: "var(--bm-text3)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "border-color 0.15s",
            }}
          >
            Got it — show me today&apos;s task
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PaywalledContent({ win }: { win?: string }) {
  return (
    <div>
      {win && (
        <div
          style={{
            fontSize: 13,
            color: "var(--bm-text2)",
            lineHeight: 1.65,
            marginBottom: 14,
          }}
        >
          <span style={{ color: "var(--bm-green)", fontWeight: 700 }}>Win: </span>
          {sanitizeOutput(win).slice(0, 60)}…
        </div>
      )}
      <div
        style={{
          fontSize: 12,
          color: "var(--bm-text3)",
          fontStyle: "italic",
          marginBottom: 16,
        }}
      >
        Your risk and today&apos;s action are in Builder.
      </div>
      <a
        href="/upgrade"
        style={{
          display: "inline-block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--bm-accent)",
          background: "var(--bm-accent-dim)",
          border: "1px solid var(--bm-accent-bd)",
          borderRadius: 9,
          padding: "8px 16px",
          textDecoration: "none",
        }}
      >
        Unlock full briefing — Builder →
      </a>
    </div>
  );
}

function FullContent({ briefing }: { briefing: MorningBriefing }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Row label="WIN"  color="var(--bm-green)"          text={briefing.win}    />
      <Row label="RISK" color="var(--bm-amber)"          text={briefing.risk}   />
      <Row label="NOW"  color="var(--bm-accent)"         text={briefing.action} bold />

      {briefing.gaps && briefing.gaps.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--bm-border)",
            paddingTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {briefing.gaps.map((gap, i) => (
            <Row
              key={i}
              label="GAP"
              color="var(--bm-red, #f87171)"
              text={gap.question}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  color,
  text,
  bold,
}: {
  label: string;
  color: string;
  text: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          color,
          minWidth: 36,
          paddingTop: 2,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontFamily: "'DM Mono', monospace",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: bold ? "var(--bm-text)" : "var(--bm-text2)",
          fontWeight: bold ? 600 : 400,
          lineHeight: 1.6,
        }}
      >
        {sanitizeOutput(text)}
      </span>
    </div>
  );
  }

"use client";

/**
 * components/BlockerInsightCard.tsx
 *
 * The "cheat code" card — surfaces when BuildMind detects a contradiction
 * between what's blocking a founder and what they keep skipping.
 *
 * Example: "Visibility loop detected — you've named visibility 3 times,
 * but you skip content 80% of the time. Tomorrow: direct outreach, not content."
 *
 * Shown on the Today page when a blocker_insight exists and is not dismissed.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface BlockerInsightCardProps {
  id: string;
  title: string;
  body: string;
  actionRedirect: string | null;
  onDismiss: (id: string, actedOn: boolean) => void;
}

const REDIRECT_LABELS: Record<string, string> = {
  outreach:       "Direct outreach",
  content:        "Content work",
  user_interview: "User interviews",
  build:          "Building",
  other:          "Next action",
};

export function BlockerInsightCard({ id, title, body, actionRedirect, onDismiss }: BlockerInsightCardProps) {
  const [expanded, setExpanded] = useState(true);

  const redirectLabel = actionRedirect ? (REDIRECT_LABELS[actionRedirect] ?? actionRedirect) : null;

  return (
    <AnimatePresence>
      {expanded && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-accent-bd)",
            borderRadius: 14,
            padding: "16px 18px",
            marginBottom: 16,
            position: "relative",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Pulse indicator */}
              <span style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--bm-accent)",
                flexShrink: 0,
                boxShadow: "0 0 0 3px var(--bm-accent-dim)",
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-accent)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                Pattern detected
              </span>
            </div>
            <button
              onClick={() => { setExpanded(false); onDismiss(id, false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--bm-text3)", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
              aria-label="Dismiss insight"
            >
              ×
            </button>
          </div>

          {/* Title */}
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)", marginBottom: 10, letterSpacing: "-0.01em" }}>
            {title}
          </div>

          {/* Body */}
          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.75, margin: "0 0 14px" }}>
            {body}
          </p>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {redirectLabel && (
              <button
                onClick={() => { setExpanded(false); onDismiss(id, true); }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--bm-bg)",
                  background: "var(--bm-text)",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Switch to {redirectLabel} →
              </button>
            )}
            <button
              onClick={() => { setExpanded(false); onDismiss(id, false); }}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--bm-text3)",
                background: "var(--bm-bg3)",
                border: "1px solid var(--bm-border)",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Got it, keep today&apos;s task
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

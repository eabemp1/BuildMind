"use client";

/**
 * components/MobileCheckin.tsx — Product Improvement #8
 *
 * Mobile-first check-in widget for the two highest-value daily touchpoints:
 *   - Morning (7–10am): one sentence — what is the single most important thing today?
 *   - Evening (6–10pm): one sentence — what actually happened?
 *
 * Designed to be the first thing a founder sees when they open BuildMind on
 * their phone. Large touch targets, minimal text input, immediate feedback.
 * Renders as a full-screen overlay on mobile, an inline card on desktop.
 *
 * Usage:
 *   <MobileCheckin type="morning" onComplete={(note) => { ... }} />
 *   <MobileCheckin type="evening" onComplete={(note) => { ... }} />
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  type: "morning" | "evening";
  /** Called when the founder submits. `note` is their raw text. */
  onComplete?: (note: string) => void;
  /** If true, renders as full-screen modal overlay */
  fullScreen?: boolean;
}

const CONFIG = {
  morning: {
    emoji:       "☀️",
    heading:     "What's the one thing today?",
    sub:         "Name the task you'll regret not doing. One sentence.",
    placeholder: "Today I'm shipping…",
    cta:         "Lock it in →",
    accent:      "#f59e0b",
    accentBg:    "rgba(245,158,11,0.1)",
    accentBorder:"rgba(245,158,11,0.25)",
  },
  evening: {
    emoji:       "🌙",
    heading:     "How did today go?",
    sub:         "One honest sentence. No judgment.",
    placeholder: "Today I…",
    cta:         "Log it →",
    accent:      "#10b981",
    accentBg:    "rgba(16,185,129,0.1)",
    accentBorder:"rgba(16,185,129,0.25)",
  },
};

export function MobileCheckin({ type, onComplete, fullScreen = false }: Props) {
  const [note, setNote]         = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);
  const cfg                     = CONFIG[type];

  // Auto-focus on mobile
  useEffect(() => {
    if (fullScreen) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [fullScreen]);

  const handleSubmit = async () => {
    if (!note.trim() || submitting) return;
    setSubmitting(true);

    try {
      const endpoint = type === "morning"
        ? "/api/morning-checkin"
        : "/api/evening-checkin";

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim(), via: "mobile_widget" }),
      });
    } catch {
      // Non-critical — still show completion
    }

    setSubmitted(true);
    setSubmitting(false);
    onComplete?.(note.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: fullScreen ? "60px 32px" : "24px",
          textAlign: "center",
          minHeight: fullScreen ? "100dvh" : "auto",
          background: fullScreen ? "#0F0F10" : "transparent",
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          style={{ fontSize: 48, marginBottom: 16 }}
        >
          {type === "morning" ? "🎯" : "✓"}
        </motion.div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#e5e7eb", marginBottom: 8 }}>
          {type === "morning" ? "Locked in." : "Logged."}
        </div>
        <div style={{
          fontSize: 14,
          color: "#6b7280",
          maxWidth: 240,
          lineHeight: 1.6,
          padding: "10px 16px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          fontStyle: "italic",
        }}>
          &ldquo;{note.slice(0, 80)}{note.length > 80 ? "…" : ""}&rdquo;
        </div>
      </motion.div>
    );
  }

  const card = (
    <div style={{
      display: "flex",
      flexDirection: "column",
      padding: fullScreen ? "40px 24px 32px" : "20px",
      minHeight: fullScreen ? "100dvh" : "auto",
      justifyContent: fullScreen ? "center" : "flex-start",
      maxWidth: fullScreen ? "none" : "480px",
      background: fullScreen ? "#0F0F10" : "transparent",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24, textAlign: fullScreen ? "center" : "left" }}>
        <div style={{ fontSize: fullScreen ? 40 : 28, marginBottom: 10 }}>{cfg.emoji}</div>
        <h2 style={{
          fontSize: fullScreen ? 22 : 18,
          fontWeight: 700,
          color: "#e5e7eb",
          margin: "0 0 8px",
          lineHeight: 1.3,
        }}>
          {cfg.heading}
        </h2>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
          {cfg.sub}
        </p>
      </div>

      {/* Text input — large, comfortable on mobile */}
      <textarea
        ref={textareaRef}
        value={note}
        onChange={e => setNote(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={cfg.placeholder}
        maxLength={300}
        rows={fullScreen ? 4 : 3}
        style={{
          width: "100%",
          padding: "16px",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${note.trim() ? cfg.accentBorder : "rgba(255,255,255,0.08)"}`,
          borderRadius: 12,
          color: "#e5e7eb",
          fontSize: 16, // 16px prevents iOS auto-zoom
          lineHeight: 1.6,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
          transition: "border-color 0.2s",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />

      {/* Character count */}
      <div style={{ textAlign: "right", fontSize: 11, color: "#374151", marginBottom: 16 }}>
        {note.length}/300
      </div>

      {/* CTA button — large touch target */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={!note.trim() || submitting}
        style={{
          width: "100%",
          padding: "17px 0",
          borderRadius: 14,
          border: "none",
          background: note.trim()
            ? `linear-gradient(135deg, ${cfg.accent}, ${cfg.accent}cc)`
            : "rgba(255,255,255,0.06)",
          color: note.trim() ? (type === "morning" ? "#000" : "#fff") : "#4b5563",
          fontWeight: 700,
          fontSize: 16,
          cursor: note.trim() ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          transition: "all 0.2s",
          boxShadow: note.trim() ? `0 4px 24px ${cfg.accent}33` : "none",
          minHeight: 56, // iOS touch target minimum
        }}
      >
        {submitting ? "Saving…" : cfg.cta}
      </motion.button>

      {/* Skip — only for evening, not morning */}
      {type === "evening" && (
        <button
          onClick={() => onComplete?.("")}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: "#374151",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "center",
            width: "100%",
            padding: "8px",
          }}
        >
          Skip tonight
        </button>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {card}
        </motion.div>
      </AnimatePresence>
    );
  }

  return card;
}

export default MobileCheckin;

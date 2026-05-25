"use client";

/**
 * components/TeamsWaitlistCard.tsx — Growth Improvement #3 UI
 *
 * Teams waitlist capture widget. Backend (/api/waitlist/teams) already exists.
 * This component renders on /invite and as a modal on the upgrade page.
 *
 * Design: obsidian card aesthetic, celadon CTA button.
 * Shows "You're #[N] on the early access list" on success.
 *
 * Usage:
 *   <TeamsWaitlistCard email="pre@filled.com" />
 *   <TeamsWaitlistCard asModal onClose={() => setOpen(false)} />
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const USE_CASES = [
  { value: "co-founders",       label: "Co-founders tracking together" },
  { value: "small_team",        label: "Small team (2–10 people)"       },
  { value: "investor_updates",  label: "Investor progress updates"      },
  { value: "other",             label: "Something else"                  },
] as const;

interface Props {
  /** Pre-fill email from auth */
  email?: string;
  /** Renders as a dismissible modal overlay */
  asModal?: boolean;
  onClose?: () => void;
  className?: string;
}

export function TeamsWaitlistCard({ email: initialEmail = "", asModal = false, onClose, className }: Props) {
  const [email,      setEmail]      = useState(initialEmail);
  const [useCase,    setUseCase]    = useState<string>("co-founders");
  const [teamSize,   setTeamSize]   = useState<string>("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<{ position?: number } | null>(null);

  async function handleSubmit() {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:     email.trim().toLowerCase(),
          use_case:  useCase,
          team_size: teamSize ? parseInt(teamSize, 10) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong");
      setSuccess({ position: data.position });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const card = (
    <div
      className={className}
      style={{
        background:   "#0e0e0e",
        border:       "1px solid var(--bm-border2)",
        borderRadius: 16,
        padding:      "24px",
        width:        "100%",
        maxWidth:     asModal ? 440 : "100%",
        position:     "relative",
        boxSizing:    "border-box",
      }}
    >
      {/* Modal close button */}
      {asModal && onClose && (
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 16,
            background: "none", border: "none", cursor: "pointer",
            color: "#4b5563", fontSize: 20, lineHeight: 1, padding: 4,
          }}
          aria-label="Close"
        >×</button>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
          Coming soon
        </div>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#f9fafb", letterSpacing: "-0.02em", marginBottom: 8 }}>
          BuildMind for Teams
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
          Shared Momentum Scores, team check-ins, and investor dashboards.
          Join early access — we're building with the first cohort.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 12,
              padding: "16px 20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981", marginBottom: 6 }}>
              {success.position ? `You're #${success.position} on the early access list` : "You're on the list!"}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
              We'll email you when teams launches — typically 30–60 days.
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Email */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@startup.com"
                style={{
                  width: "100%", background: "#141414", border: "1px solid var(--bm-border2)",
                  borderRadius: 8, padding: "11px 14px", fontSize: 14, color: "#f9fafb",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = "#10b981"; }}
                onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
              />
            </div>

            {/* Use case */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Primary use case
              </label>
              <select
                value={useCase}
                onChange={e => setUseCase(e.target.value)}
                style={{
                  width: "100%", background: "#141414", border: "1px solid var(--bm-border2)",
                  borderRadius: 8, padding: "11px 14px", fontSize: 14, color: "#f9fafb",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box", cursor: "pointer",
                }}
              >
                {USE_CASES.map(uc => (
                  <option key={uc.value} value={uc.value}>{uc.label}</option>
                ))}
              </select>
            </div>

            {/* Team size (optional) */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Team size <span style={{ color: "#374151", textTransform: "none", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={teamSize}
                onChange={e => setTeamSize(e.target.value)}
                placeholder="e.g. 3"
                style={{
                  width: "100%", background: "#141414", border: "1px solid var(--bm-border2)",
                  borderRadius: 8, padding: "11px 14px", fontSize: 14, color: "#f9fafb",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = "#10b981"; }}
                onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={!email.trim() || loading}
              style={{
                width: "100%", padding: "12px 20px",
                background: !email.trim() || loading ? "var(--bm-bg3)" : "var(--bm-accent)",
                color: !email.trim() || loading ? "#6b7280" : "#fff",
                border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: !email.trim() || loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              {loading ? "Joining…" : "Join early access →"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (!asModal) return card;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          style={{ width: "100%", maxWidth: 440 }}
        >
          {card}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default TeamsWaitlistCard;

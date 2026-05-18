"use client";

/**
 * components/TestimonialModal.tsx
 *
 * Shown at high-engagement moments:
 *   - 7-day streak reached (source: 'streak_7')
 *   - 14-day streak reached (source: 'streak_14')
 *   - Reflection with outcome='completed' AND confidence >= 4 (source: 'high_confidence')
 *
 * Design principle: ask for ONE thing at the exact moment of a win.
 * The founder just had a good moment — their answer will be specific and honest.
 *
 * Flow:
 *   1. Modal slides up with a streak/confidence-specific opening line
 *   2. Founder writes what changed (10–400 chars)
 *   3. Optional: display name + consent to public display
 *   4. Submits → POST /api/testimonials → success state → auto-dismiss
 *
 * Triggers are managed by the parent page — this component is pure UI.
 * Pass source='streak_7' | 'streak_14' | 'high_confidence' to personalise copy.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, CheckCircle2, Loader2 } from "lucide-react";

export type TestimonialSource =
  | "streak_7"
  | "streak_14"
  | "streak_30"
  | "high_confidence"
  | "manual";

interface Props {
  source: TestimonialSource;
  streak?: number;
  stage?: string;
  onClose: () => void;
}

const COPY: Record<TestimonialSource, { headline: string; prompt: string; sub: string }> = {
  streak_7: {
    headline: "7 days in. That's rare.",
    prompt: "What's actually different about how you work now?",
    sub: "Most founders quit in 3 days. You didn't. Tell us what that felt like.",
  },
  streak_14: {
    headline: "Two weeks. That's a habit.",
    prompt: "What has BuildMind changed for you?",
    sub: "Be specific — what would still be stuck without it?",
  },
  streak_30: {
    headline: "30 days. You're iron.",
    prompt: "What's the biggest shift you've made in a month?",
    sub: "Your answer helps other founders understand what's possible.",
  },
  high_confidence: {
    headline: "That looked like a strong session.",
    prompt: "What just clicked for you?",
    sub: "One honest sentence from a real founder is worth more than any feature list.",
  },
  manual: {
    headline: "One quick question.",
    prompt: "What has BuildMind changed for you?",
    sub: "Be honest — even critical feedback helps.",
  },
};

const CHAR_LIMIT = 400;
const CHAR_MIN   = 10;

export default function TestimonialModal({ source, streak = 0, stage = "Idea", onClose }: Props) {
  const [quote, setQuote]               = useState("");
  const [displayName, setDisplayName]   = useState("");
  const [isPublic, setIsPublic]         = useState(false);
  const [rating, setRating]             = useState(5);
  const [step, setStep]                 = useState<"write" | "details" | "done">("write");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState("");
  const textareaRef                     = useRef<HTMLTextAreaElement>(null);
  const copy = COPY[source];
  const remaining = CHAR_LIMIT - quote.length;

  // Dismiss on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (step === "write") setTimeout(() => textareaRef.current?.focus(), 300);
  }, [step]);

  // Auto-dismiss after done
  useEffect(() => {
    if (step === "done") {
      const t = setTimeout(onClose, 3200);
      return () => clearTimeout(t);
    }
  }, [step, onClose]);

  async function handleSubmit() {
    const trimmed = quote.trim();
    if (trimmed.length < CHAR_MIN) { setError(`Add a bit more — at least ${CHAR_MIN} characters.`); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote: trimmed,
          display_name: displayName.trim() || undefined,
          is_public: isPublic,
          streak,
          stage,
          source,
          rating,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Something went wrong.");
      }
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <motion.div
        key="modal"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          zIndex: 9001,
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border2)",
          borderRadius: "22px 22px 0 0",
          padding: "28px 24px 36px",
          maxWidth: 560,
          margin: "0 auto",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.55)",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16,
            background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
            borderRadius: 8, width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--bm-text3)",
          }}
          aria-label="Close"
        >
          <X size={15} />
        </button>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Write ── */}
          {step === "write" && (
            <motion.div key="write" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Streak badge */}
              {streak > 0 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 700, color: "var(--bm-amber)",
                  background: "rgba(232,160,32,0.10)", border: "1px solid rgba(232,160,32,0.22)",
                  borderRadius: 20, padding: "3px 10px", marginBottom: 14,
                }}>
                  🔥 {streak}-day streak
                </div>
              )}

              <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
                {copy.headline}
              </h2>
              <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: "0 0 20px", lineHeight: 1.55 }}>
                {copy.sub}
              </p>

              <div style={{
                background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)",
                borderRadius: 12, padding: "2px 4px 4px", marginBottom: 6,
              }}>
                <div style={{ fontSize: 11, color: "var(--bm-text3)", padding: "10px 12px 4px", fontWeight: 600 }}>
                  {copy.prompt}
                </div>
                <textarea
                  ref={textareaRef}
                  value={quote}
                  onChange={e => { setQuote(e.target.value.slice(0, CHAR_LIMIT)); setError(""); }}
                  rows={4}
                  placeholder="Be specific — what actually changed?"
                  style={{
                    width: "100%", background: "transparent", border: "none",
                    padding: "4px 12px 12px", fontSize: 14, color: "var(--bm-text)",
                    outline: "none", fontFamily: "inherit", resize: "none",
                    boxSizing: "border-box", lineHeight: 1.65,
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: remaining < 40 ? "var(--bm-amber)" : "var(--bm-text3)" }}>
                  {remaining} chars left
                </span>
                {/* Star rating */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setRating(s)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 1 }}
                      aria-label={`${s} star`}
                    >
                      <Star size={17}
                        fill={s <= rating ? "var(--bm-amber)" : "none"}
                        color={s <= rating ? "var(--bm-amber)" : "var(--bm-text4)"}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p style={{ fontSize: 12, color: "var(--bm-red)", marginBottom: 12 }}>{error}</p>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose}
                  style={{
                    flex: "0 0 auto", padding: "12px 18px", borderRadius: 10,
                    border: "1px solid var(--bm-border)", background: "transparent",
                    color: "var(--bm-text3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={() => {
                    if (quote.trim().length < CHAR_MIN) { setError(`Add a bit more — at least ${CHAR_MIN} characters.`); return; }
                    setStep("details");
                  }}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                    background: quote.trim().length >= CHAR_MIN ? "var(--grad-primary)" : "var(--bm-bg4)",
                    color: quote.trim().length >= CHAR_MIN ? "white" : "var(--bm-text3)",
                    fontSize: 13, fontWeight: 700, cursor: quote.trim().length >= CHAR_MIN ? "pointer" : "not-allowed",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  Continue →
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Details ── */}
          {step === "details" && (
            <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                One last thing
              </h2>
              <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: "0 0 20px" }}>
                Optional — only used if you'd like to be quoted publicly.
              </p>

              {/* Quote preview */}
              <div style={{
                background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
                borderRadius: 12, padding: "14px 16px", marginBottom: 18,
                fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, fontStyle: "italic",
              }}>
                &ldquo;{quote.trim()}&rdquo;
              </div>

              {/* Display name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", display: "block", marginBottom: 6 }}>
                  Display name <span style={{ color: "var(--bm-text3)", fontWeight: 400" }}>(leave blank for "Anonymous founder")</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value.slice(0, 80))}
                  placeholder="e.g. Kofi A., or Founder in Accra"
                  style={{
                    width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)",
                    borderRadius: 9, padding: "10px 13px", fontSize: 13, color: "var(--bm-text)",
                    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
                  onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
                />
              </div>

              {/* Public consent */}
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                padding: "12px 14px", borderRadius: 10,
                background: isPublic ? "var(--bm-accent-dim)" : "var(--bm-bg3)",
                border: `1px solid ${isPublic ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                marginBottom: 18, transition: "all 0.15s",
              }}>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={e => setIsPublic(e.target.checked)}
                  style={{ marginTop: 2, accentColor: "var(--bm-accent)", width: 15, height: 15, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>
                  I'm happy for BuildMind to share this quote publicly (landing page, social). My name and no other personal info.
                </span>
              </label>

              {error && <p style={{ fontSize: 12, color: "var(--bm-red)", marginBottom: 12 }}>{error}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep("write")}
                  style={{
                    flex: "0 0 auto", padding: "12px 18px", borderRadius: 10,
                    border: "1px solid var(--bm-border)", background: "transparent",
                    color: "var(--bm-text3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                    background: "var(--grad-primary)", color: "white",
                    fontSize: 13, fontWeight: 700, cursor: submitting ? "wait" : "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {submitting
                    ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                    : "Submit"}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: "center", padding: "20px 0 12px" }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <CheckCircle2 size={26} color="var(--bm-accent)" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                Thank you.
              </h2>
              <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
                Your feedback goes directly to the people building this.{isPublic ? " We'll let you know if it goes live." : ""}
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * shouldShowTestimonialModal
 *
 * Call this after a reflection is saved. Returns the source key if the modal
 * should be shown, null if not. Checks localStorage to ensure we never ask
 * the same founder more than once per source, and never ask more than once
 * every 14 days regardless of source.
 */
export function shouldShowTestimonialModal(
  streak: number,
  outcome: string,
  confidence: number,
): TestimonialSource | null {
  try {
    // Global cooldown — don't ask more often than every 14 days
    const lastAsked = parseInt(localStorage.getItem("bm_testimonial_last_asked") ?? "0", 10);
    const daysSince = (Date.now() - lastAsked) / (1000 * 60 * 60 * 24);
    if (lastAsked && daysSince < 14) return null;

    // Check per-source "already asked" flags
    const already = (src: string) =>
      localStorage.getItem(`bm_testimonial_asked_${src}`) === "1";

    if (streak >= 30 && !already("streak_30")) return "streak_30";
    if (streak >= 14 && !already("streak_14")) return "streak_14";
    if (streak >= 7  && !already("streak_7"))  return "streak_7";

    // High-confidence completed session — ask once ever
    if (
      outcome === "completed" &&
      confidence >= 4 &&
      !already("high_confidence")
    ) return "high_confidence";

    return null;
  } catch {
    return null;
  }
}

/**
 * markTestimonialAsked
 *
 * Call after the modal is shown (whether submitted or skipped) so we don't
 * show it again for the same trigger.
 */
export function markTestimonialAsked(source: TestimonialSource) {
  try {
    localStorage.setItem(`bm_testimonial_asked_${source}`, "1");
    localStorage.setItem("bm_testimonial_last_asked", String(Date.now()));
  } catch {}
}

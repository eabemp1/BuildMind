"use client";

/**
 * components/TrialBanner.tsx — 14-Day Free Trial UI
 *
 * Changes from original:
 *   1. Banner dismissal persisted to sessionStorage (daily reset) so it
 *      doesn't re-appear on every navigation within the same session.
 *   2. Banner now shows plan name + 3 feature bullets so new users
 *      understand what they're getting.
 *   3. TrialCounterPill — a compact "Trial: N days" badge for the sidebar
 *      footer that stays visible even after the banner is dismissed.
 *   4. TrialWelcomeCard — one-time first-login card that explains the trial
 *      timeline and what Builder unlocks (dismissible, stored in localStorage).
 *
 * Usage:
 *   <TrialBanner daysRemaining={11} />
 *   <TrialCounterPill daysRemaining={11} />
 *   <TrialWelcomeCard daysRemaining={11} show={isFirstLogin} />
 *   <TrialPaywall expired={true} />
 */

import { useState, useEffect } from "react";
import { X, Zap, Lock, Check } from "lucide-react";
import { useRouter } from "next/navigation";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DISMISS_KEY = "bm_trial_banner_dismissed_date";

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function isBannerDismissedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === getTodayString();
  } catch {
    return false;
  }
}

function dismissBannerForToday() {
  try {
    sessionStorage.setItem(DISMISS_KEY, getTodayString());
  } catch {}
}

// ── Trial Banner (active trial) ───────────────────────────────────────────────

interface TrialBannerProps {
  /** Days left in the trial. Pass 0 to hide. */
  daysRemaining: number;
}

const BUILDER_FEATURES = [
  "Daily AI action — calibrated to your stage",
  "Reflexion loop — AI that learns from your outcomes",
  "Behavioral memory — remembers your patterns",
];

export function TrialBanner({ daysRemaining }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  // Initialise from sessionStorage so dismiss survives in-app navigation
  useEffect(() => {
    setDismissed(isBannerDismissedToday());
  }, []);

  if (dismissed || daysRemaining <= 0) return null;

  const isLastDay = daysRemaining === 1;
  const isUrgent  = daysRemaining <= 3;
  const urgencyColor = isUrgent ? "var(--bm-amber)" : "var(--bm-accent)";
  const urgencyBg    = isUrgent ? "rgba(232,160,32,0.08)" : "var(--bm-accent-dim)";
  const urgencyBd    = isUrgent ? "rgba(232,160,32,0.22)" : "var(--bm-accent-bd)";

  function handleDismiss() {
    dismissBannerForToday();
    setDismissed(true);
  }

  return (
    <div
      style={{
        background: urgencyBg,
        border: `1px solid ${urgencyBd}`,
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <Zap size={14} color={urgencyColor} style={{ flexShrink: 0, marginTop: 2 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Headline */}
        <div style={{ fontSize: 12, fontWeight: 700, color: urgencyColor, lineHeight: 1.4, marginBottom: 5 }}>
          {isLastDay
            ? "Last day of your free Builder trial — upgrade today to keep full access."
            : `You're on your 14-day Builder trial · ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left.`}
          {" "}
          <button
            onClick={() => router.push("/upgrade")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, color: urgencyColor,
              textDecoration: "underline", padding: 0, fontFamily: "inherit",
            }}
          >
            Upgrade now →
          </button>
        </div>

        {/* Feature list — only show when not last day to keep it concise */}
        {!isLastDay && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            {BUILDER_FEATURES.map((f) => (
              <span
                key={f}
                style={{ fontSize: 11, color: urgencyColor, opacity: 0.8, display: "flex", alignItems: "center", gap: 4 }}
              >
                <Check size={10} /> {f}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleDismiss}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--bm-text4)", padding: 2, display: "flex", flexShrink: 0,
        }}
        aria-label="Dismiss trial banner"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Trial Counter Pill — compact badge for sidebar footer ────────────────────
// Shows "Trial: N days" persistently even after the main banner is dismissed.

interface TrialCounterPillProps {
  daysRemaining: number;
}

export function TrialCounterPill({ daysRemaining }: TrialCounterPillProps) {
  const router = useRouter();

  if (daysRemaining <= 0) return null;

  const isUrgent = daysRemaining <= 3;
  const color    = isUrgent ? "var(--bm-amber)" : "var(--bm-text3)";
  const bg       = isUrgent ? "rgba(232,160,32,0.08)" : "var(--bm-bg3)";
  const border   = isUrgent ? "rgba(232,160,32,0.22)" : "var(--bm-border)";

  return (
    <button
      onClick={() => router.push("/upgrade")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
      title="Upgrade to keep Builder access"
    >
      <Zap size={10} />
      Trial: {daysRemaining}d left
    </button>
  );
}

// ── Trial Welcome Card — shown once on first login ────────────────────────────

interface TrialWelcomeCardProps {
  daysRemaining: number;
}

const WELCOME_DISMISSED_KEY = "bm_trial_welcome_dismissed";

export function TrialWelcomeCard({ daysRemaining }: TrialWelcomeCardProps) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(WELCOME_DISMISSED_KEY);
      if (!dismissed && daysRemaining > 0) setVisible(true);
    } catch {}
  }, [daysRemaining]);

  function dismiss() {
    try { localStorage.setItem(WELCOME_DISMISSED_KEY, "1"); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        background: "var(--bm-accent-dim)",
        border: "1px solid var(--bm-accent-bd)",
        borderRadius: 16,
        padding: "20px 22px",
        marginBottom: 24,
        position: "relative",
      }}
    >
      <button
        onClick={dismiss}
        style={{
          position: "absolute", top: 12, right: 12,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--bm-text4)", padding: 2, display: "flex",
        }}
        aria-label="Dismiss welcome card"
      >
        <X size={14} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Zap size={16} color="var(--bm-accent)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-accent)" }}>
          Welcome — your {daysRemaining}-day Builder trial is active
        </span>
      </div>

      <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6, margin: "0 0 14px" }}>
        You have full access to every Builder feature for the next {daysRemaining} days.
        Here&apos;s what&apos;s unlocked:
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { label: "Daily AI action", desc: "One high-leverage task every morning" },
          { label: "Reflexion loop", desc: "AI that improves from your outcomes" },
          { label: "Behavioral memory", desc: "Remembers your patterns over time" },
          { label: "Notion & Linear sync", desc: "Real tasks fed into your AI brief" },
          { label: "AI Coach", desc: "Ask anything, get founder-specific answers" },
          { label: "Weekly reports", desc: "Full week analysis every Sunday" },
        ].map(({ label, desc }) => (
          <div
            key={label}
            style={{
              background: "var(--bm-bg2)",
              border: "1px solid var(--bm-border)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 2 }}>
              <Check size={10} color="var(--bm-accent)" style={{ marginRight: 4, display: "inline" }} />
              {label}
            </div>
            <div style={{ fontSize: 11, color: "var(--bm-text4)", lineHeight: 1.4 }}>{desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => { dismiss(); router.push("/upgrade"); }}
          style={{
            padding: "9px 18px", borderRadius: 10, border: "none",
            background: "var(--grad-primary)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Upgrade to keep access → $39/mo
        </button>
        <button
          onClick={dismiss}
          style={{
            padding: "9px 16px", borderRadius: 10,
            border: "1px solid var(--bm-border)", background: "transparent",
            color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Got it, start building
        </button>
      </div>
    </div>
  );
}

// ── Trial Paywall (hard block on day 15+) ─────────────────────────────────────

interface TrialPaywallProps {
  /** Whether the trial has expired and this wall should be shown. */
  expired: boolean;
}

export function TrialPaywall({ expired }: TrialPaywallProps) {
  const router = useRouter();

  if (!expired) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 15, 16, 0.97)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border)",
          borderTop: "2px solid var(--bm-accent)",
          borderRadius: 18,
          padding: "36px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: "var(--bm-accent-dim)",
            border: "1px solid var(--bm-accent-bd)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <Lock size={22} color="var(--bm-accent)" />
        </div>

        <h2
          style={{
            fontSize: 22, fontWeight: 800, color: "var(--bm-text)",
            letterSpacing: "-0.03em", margin: "0 0 10px", lineHeight: 1.2,
          }}
        >
          Your free trial has ended.
        </h2>

        <p style={{ fontSize: 14, color: "var(--bm-text3)", lineHeight: 1.65, margin: "0 0 8px" }}>
          You&apos;ve had 14 days of full Builder access — daily briefings, unlimited AI,
          the Reflexion loop, and the behavioral memory system that&apos;s been watching
          your patterns.
        </p>
        <p style={{ fontSize: 14, color: "var(--bm-text3)", lineHeight: 1.65, margin: "0 0 24px" }}>
          Your data is still here. Upgrade to keep the momentum going.
        </p>

        {/* Feature comparison */}
        <div
          style={{
            background: "var(--bm-bg3)",
            border: "1px solid var(--bm-border)",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          {[
            "Daily AI action — stage-specific each morning",
            "Reflexion loop — learns from every outcome",
            "Behavioral memory — knows your patterns",
            "Notion & Linear task sync",
            "Unlimited AI Coach messages",
          ].map((f) => (
            <div
              key={f}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12, color: "var(--bm-text2)" }}
            >
              <Check size={12} color="var(--bm-accent)" style={{ flexShrink: 0 }} />
              {f}
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push("/upgrade")}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "var(--grad-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 11,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "-0.01em",
            marginBottom: 12,
          }}
        >
          Continue with Builder — $39/mo
        </button>

        <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: 0 }}>
          Cancel any time. Your full history is preserved.
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * components/TrialBanner.tsx — 7-Day Free Trial UI (Audit Rec §02)
 *
 * Two components:
 *
 *   <TrialBanner />     — Shown at top of app during active trial.
 *                          Shows days remaining + upgrade CTA.
 *                          Dismissible per session; re-shows each page load.
 *
 *   <TrialPaywall />    — Hard paywall shown on day 8+.
 *                          Blocks the entire page until user upgrades.
 *                          NOT dismissible.
 *
 * Usage (in app-shell.tsx or layout):
 *   import { TrialBanner, TrialPaywall } from "@/components/TrialBanner";
 *   <TrialBanner trialDaysRemaining={3} />
 *   <TrialPaywall trialExpired={true} />
 */

import { useState } from "react";
import { X, Zap, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

// ── Trial Banner (active trial) ───────────────────────────────────────────────

interface TrialBannerProps {
  /** Days left in the trial. Pass 0 to hide. */
  daysRemaining: number;
}

export function TrialBanner({ daysRemaining }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  if (dismissed || daysRemaining <= 0) return null;

  const isLastDay = daysRemaining === 1;
  const urgencyColor = daysRemaining <= 2 ? "var(--bm-amber)" : "var(--bm-accent)";
  const urgencyBg   = daysRemaining <= 2 ? "rgba(232,160,32,0.08)" : "var(--bm-accent-dim)";
  const urgencyBd   = daysRemaining <= 2 ? "rgba(232,160,32,0.22)" : "var(--bm-accent-bd)";

  return (
    <div
      style={{
        background: urgencyBg,
        border: `1px solid ${urgencyBd}`,
        borderRadius: 10,
        padding: "9px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        position: "relative",
      }}
    >
      <Zap size={13} color={urgencyColor} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: urgencyColor, fontWeight: 600, flex: 1, lineHeight: 1.4 }}>
        {isLastDay
          ? "Last day of your free Builder trial. Upgrade today to keep full access."
          : `${daysRemaining} days left in your free Builder trial.`}
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
      </span>
      <button
        onClick={() => setDismissed(true)}
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

// ── Trial Paywall (hard block on day 8+) ──────────────────────────────────────

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
        {/* Lock icon */}
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
          You&apos;ve had 7 days of full Builder access — daily briefings, unlimited AI,
          the Reflexion loop, and the behavioral memory system that&apos;s been watching
          your patterns.
        </p>
        <p style={{ fontSize: 14, color: "var(--bm-text3)", lineHeight: 1.65, margin: "0 0 28px" }}>
          Your data is still here. Upgrade to keep the momentum going.
        </p>

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

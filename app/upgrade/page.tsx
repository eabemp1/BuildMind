"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlan } from "@/lib/usePlan";
import { Check, Loader2, ArrowRight, Zap, Shield } from "lucide-react";
import { PLAN_PRICE_MONTHLY } from "@/lib/pricing";

const VALUE_MOMENTS = [
  {
    day: "Day 1",
    color: "var(--bm-accent)",
    text: "First task calibrated to your exact stage and startup context. Not generic. Not a template.",
  },
  {
    day: "Day 3",
    color: "var(--bm-teal, #4AB8B0)",
    text: "Your first behavioral pattern surfaces. The system tells you what you keep avoiding.",
  },
  {
    day: "Day 7",
    color: "#9B7FE8",
    text: "Weekly behavioral synthesis. Momentum delta, what you shipped vs planned, next week directive.",
  },
  {
    day: "Day 30",
    color: "var(--bm-amber)",
    text: "Full founder profile built. Every task now calibrated to your avoidance zones, strengths, and working style.",
  },
];

const BUILDER_FEATURES = [
  { label: "Daily Morning Briefing", note: "3-agent reflexion loop runs overnight. Waits for you in the morning." },
  { label: "Founder Memory", note: "Tracks your avoidance patterns, strengths, and execution style across sessions." },
  { label: "Full Momentum Score + decay alerts", note: "Behavioral momentum — not just task completion. Alerts before you fully stall." },
  { label: "Recovery Mode", note: "After 3+ missed days, the system adapts. Lighter tasks. Direct re-engagement." },
  { label: "Evening check-in nudges", note: "Personalised 8pm push — references your last task and what you're avoiding." },
  { label: "Weekly behavioral synthesis email", note: "Every Sunday: real numbers, honest diagnosis, next week directive." },
  { label: "Rotating Critic Personas", note: "4 adversarial AI voices rotate weekly to pressure-test your thinking." },
  { label: "Stage auto-progression", note: "Hit the execution threshold and you level up automatically." },
  { label: "Unlimited AI tasks + coaching", note: "No daily or monthly caps." },
  { label: "Unlimited projects", note: "Track multiple ideas simultaneously." },
];

export default function UpgradePage() {
  const router = useRouter();
  const { plan, isLoading: planLoading } = usePlan();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planLoading && plan === "builder") {
      router.replace("/overview");
    }
  }, [plan, planLoading, router]);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "builder" }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error ?? "Failed to start checkout");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setLoading(false);
    }
  }

  if (planLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", background: "var(--bm-bg)" }}>
        <Loader2 size={20} color="var(--bm-text3)" className="animate-spin" />
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bm-bg)", overflowX: "hidden",
      padding: "clamp(24px, 6vw, 48px) clamp(16px, 5vw, 24px) clamp(48px, 8vw, 80px)" }}>
      <div style={{ maxWidth: 540, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "clamp(28px, 5vw, 44px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 99,
            background: "rgba(232,197,71,0.1)", border: "1px solid rgba(232,197,71,0.25)",
            marginBottom: 16 }}>
            <Zap size={11} color="var(--bm-accent)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)",
              textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
              Builder Plan
            </span>
          </div>
          <h1 style={{ fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(24px, 6vw, 36px)", fontWeight: 900,
            letterSpacing: "-0.04em", color: "var(--bm-text)", lineHeight: 1.1,
            margin: "0 0 clamp(10px, 2vw, 14px)" }}>
            The full execution system.<br />
            <span style={{ color: "var(--bm-accent)" }}>${PLAN_PRICE_MONTHLY.builder}/month.</span>
          </h1>
          <p style={{ fontSize: "clamp(13px, 2.5vw, 15px)", color: "var(--bm-text2)",
            lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
            Most AI tools answer questions. BuildMind builds a behavioral model of how you execute — and uses it to give you one task per day that actually moves the needle.
          </p>
        </div>

        {/* Value arc */}
        <div style={{ marginBottom: "clamp(24px, 4vw, 36px)", borderRadius: 14,
          border: "1px solid var(--bm-border)", background: "var(--bm-bg2)",
          overflow: "hidden" }}>
          <div style={{ padding: "clamp(12px, 2.5vw, 16px) clamp(14px, 3vw, 20px)",
            borderBottom: "1px solid var(--bm-border)" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9,
              textTransform: "uppercase" as const, letterSpacing: "0.1em",
              color: "var(--bm-text3)", margin: 0 }}>
              What you get by day
            </p>
          </div>
          {VALUE_MOMENTS.map(({ day, color, text }, i) => (
            <div key={day} style={{ display: "flex", gap: "clamp(12px, 3vw, 16px)",
              padding: "clamp(12px, 2.5vw, 16px) clamp(14px, 3vw, 20px)",
              borderBottom: i < VALUE_MOMENTS.length - 1 ? "1px solid var(--bm-border)" : "none",
              alignItems: "flex-start" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700,
                color, padding: "2px 8px", borderRadius: 6,
                border: `1px solid ${color}44`, background: `${color}11`,
                flexShrink: 0, whiteSpace: "nowrap" as const, marginTop: 1 }}>
                {day}
              </span>
              <p style={{ fontSize: "clamp(11px, 2vw, 13px)", color: "var(--bm-text2)",
                lineHeight: 1.6, margin: 0 }}>
                {text}
              </p>
            </div>
          ))}
        </div>

        {/* CTA card */}
        <div style={{ borderRadius: 16,
          border: "2px solid rgba(232,197,71,0.3)",
          background: "linear-gradient(160deg, rgba(232,197,71,0.05) 0%, var(--bm-bg2) 60%)",
          padding: "clamp(20px, 4vw, 28px)",
          marginBottom: "clamp(20px, 4vw, 28px)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Syne', sans-serif",
              fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 900,
              color: "var(--bm-text)", letterSpacing: "-0.04em" }}>
              ${PLAN_PRICE_MONTHLY.builder}
            </span>
            <span style={{ fontSize: 14, color: "var(--bm-text3)" }}>/month</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--bm-text4)", marginBottom: "clamp(16px, 3vw, 20px)" }}>
            Cancel anytime. No contracts.
          </p>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 9, marginBottom: 12,
              background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)",
              fontSize: 12, color: "var(--bm-red, #E05555)" }}>
              {error}
            </div>
          )}

          <button
            onClick={() => void handleUpgrade()}
            disabled={loading}
            style={{ width: "100%", padding: "clamp(13px, 3vw, 16px) 0",
              borderRadius: 12, border: "none",
              background: loading ? "var(--bm-bg3)" : "var(--bm-accent)",
              color: loading ? "var(--bm-text3)" : "#000",
              fontFamily: "inherit", fontSize: "clamp(14px, 2.5vw, 16px)", fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s" }}>
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Redirecting to checkout...</>
              : <><Zap size={15} /> Upgrade to Builder <ArrowRight size={14} /></>}
          </button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, marginTop: 10 }}>
            <Shield size={11} color="var(--bm-text4)" />
            <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>
              Secured by Paystack · 14-day free trial
            </span>
          </div>
        </div>

        {/* Feature list */}
        <div style={{ borderRadius: 14, border: "1px solid var(--bm-border)",
          background: "var(--bm-bg2)", padding: "clamp(16px, 3vw, 22px)",
          marginBottom: "clamp(20px, 4vw, 28px)" }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9,
            textTransform: "uppercase" as const, letterSpacing: "0.1em",
            color: "var(--bm-text3)", marginBottom: "clamp(12px, 2.5vw, 16px)" }}>
            Everything in Builder
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(10px, 2vw, 14px)" }}>
            {BUILDER_FEATURES.map(({ label, note }) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Check size={13} color="var(--bm-accent)" strokeWidth={2.5}
                  style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 600,
                    color: "var(--bm-text)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: "clamp(10px, 1.8vw, 11px)", color: "var(--bm-text4)",
                    lineHeight: 1.5 }}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Social proof */}
        <div style={{ textAlign: "center", padding: "clamp(16px, 3vw, 20px)",
          borderRadius: 12, border: "1px solid var(--bm-border)", background: "var(--bm-bg2)" }}>
          <p style={{ fontSize: "clamp(11px, 2vw, 13px)", color: "var(--bm-text3)",
            lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
            &ldquo;The morning briefing alone is worth the price. I wake up knowing exactly what to do — not what to plan.&rdquo;
          </p>
          <p style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 8 }}>
            Early Builder member · Idea stage → Validation in 3 weeks
          </p>
        </div>

      </div>
    </main>
  );
    }

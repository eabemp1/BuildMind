import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Check, Zap, ArrowRight } from "lucide-react";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing — BuildMind",
  description: "Free to start. Builder plan gives you the full AI execution system — daily briefings, behavioral memory, and weekly synthesis.",
};

const FREE_FEATURES = [
  "1 startup project",
  "3 AI-powered daily tasks per week",
  "Onboarding Reflexion Strike (live startup analysis)",
  "Break My Startup — 1 stress test",
  "Morning Briefing — Mon & Thu only",
  "3 AI Coach messages per day",
  "Momentum Score (basic)",
];

const BUILDER_FEATURES = [
  { label: "Daily Morning Briefing — every day", note: "3-agent reflexion loop. Overnight. Waiting when you wake up." },
  { label: "Founder Memory", note: "AI tracks your avoidance zones, strengths, and execution patterns across every session." },
  { label: "Unlimited AI tasks + coaching", note: "No daily or monthly caps. Build at your own pace." },
  { label: "Full Momentum Score + decay warnings", note: "Tracks your execution trajectory. Alerts you before you fully stall." },
  { label: "Recovery Mode", note: "When you miss 3+ days, the system adapts — lighter tasks, direct re-engagement." },
  { label: "Rotating Critic Personas", note: "4 adversarial AI voices (YC Partner, Growth Hacker, Frugal CFO, User Empathy) rotate weekly." },
  { label: "Weekly behavioral synthesis email", note: "Every Sunday: what you built vs planned, momentum delta, next week directive." },
  { label: "Evening check-in nudges", note: "Personalised 8pm push notification — references your last task and avoidance patterns." },
  { label: "Stage auto-progression", note: "When your score and task completion hit the threshold, you level up automatically." },
  { label: "Unlimited projects", note: "Track multiple ideas simultaneously." },
];

const PROOF_POINTS = [
  { stat: "Day 1", text: "First calibrated task, tailored to your stage and startup context" },
  { stat: "Day 3", text: "First behavioral pattern detected and surfaced to you" },
  { stat: "Day 7", text: "Weekly synthesis report with momentum trajectory and what to fix" },
  { stat: "Day 30", text: "Full founder profile built — avoidance zones, strengths, personality model" },
];

export default function PricingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bm-bg)", fontFamily: "inherit", overflowX: "hidden" }}>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 clamp(16px, 5vw, 32px)", height: 56,
        borderBottom: "1px solid var(--bm-border)", position: "sticky", top: 0,
        background: "color-mix(in srgb, var(--bm-bg) 92%, transparent)",
        backdropFilter: "blur(10px)", zIndex: 10,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden",
            background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Image src="/logo/buildmind-mark.svg" alt="BuildMind" width={20} height={20} priority />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>BuildMind</span>
        </Link>
        <Link href="/auth/login" style={{ padding: "8px clamp(12px, 3vw, 16px)", borderRadius: 9,
          background: "var(--bm-accent)", color: "#000",
          fontSize: 13, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
          Get started free
        </Link>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "clamp(40px, 8vw, 80px) clamp(16px, 5vw, 32px) clamp(48px, 8vw, 80px)" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "clamp(40px, 7vw, 64px)" }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase",
            letterSpacing: "0.12em", color: "var(--bm-text3)", marginBottom: 14 }}>
            Pricing
          </p>
          <h1 style={{ fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 900,
            letterSpacing: "-0.04em", color: "var(--bm-text)", lineHeight: 1.1,
            margin: "0 0 clamp(12px, 2vw, 16px)" }}>
            Free to start.<br />
            <span style={{ color: "var(--bm-accent)" }}>$39/month</span> when you&apos;re serious.
          </h1>
          <p style={{ fontSize: "clamp(14px, 2.5vw, 16px)", color: "var(--bm-text2)",
            lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
            Most productivity tools give you features. BuildMind builds a behavioral model of how you specifically execute — and uses it to give you one task a day that actually moves the needle.
          </p>
        </div>

        {/* What you get by day */}
        <div style={{ marginBottom: "clamp(40px, 7vw, 64px)" }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--bm-text3)", textAlign: "center", marginBottom: "clamp(20px, 3vw, 28px)" }}>
            What happens when you join
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "clamp(8px, 2vw, 12px)" }}>
            {PROOF_POINTS.map(({ stat, text }) => (
              <div key={stat} style={{ padding: "clamp(14px, 3vw, 20px)", borderRadius: 12,
                border: "1px solid var(--bm-border)", background: "var(--bm-bg2)" }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "clamp(18px, 4vw, 24px)",
                  fontWeight: 900, color: "var(--bm-accent)", letterSpacing: "-0.03em", marginBottom: 8 }}>
                  {stat}
                </div>
                <div style={{ fontSize: "clamp(11px, 2vw, 12px)", color: "var(--bm-text2)", lineHeight: 1.6 }}>
                  {text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Plans */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "clamp(12px, 3vw, 20px)", marginBottom: "clamp(40px, 7vw, 64px)", alignItems: "start" }}>

          {/* Free */}
          <div style={{ borderRadius: 16, border: "1px solid var(--bm-border)", background: "var(--bm-bg2)",
            padding: "clamp(20px, 4vw, 28px)" }}>
            <div style={{ marginBottom: "clamp(16px, 3vw, 24px)" }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--bm-text3)", marginBottom: 10 }}>Free</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: "clamp(32px, 7vw, 42px)", fontWeight: 900,
                  color: "var(--bm-text)", letterSpacing: "-0.04em" }}>$0</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.55, marginBottom: 20 }}>
                Enough to see if this changes how you build. No card.
              </p>
              <Link href="/auth/login" style={{ display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, width: "100%", padding: "clamp(10px, 2.5vw, 13px) 0",
                borderRadius: 10, border: "1px solid var(--bm-border)",
                background: "transparent", color: "var(--bm-text2)", fontWeight: 600,
                fontSize: 14, textDecoration: "none", boxSizing: "border-box" as const }}>
                Start free
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <Check size={12} color="var(--bm-text3)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: "clamp(11px, 2vw, 13px)", color: "var(--bm-text3)" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Builder */}
          <div style={{ borderRadius: 16,
            border: "2px solid rgba(232,197,71,0.35)",
            background: "linear-gradient(160deg, rgba(232,197,71,0.06) 0%, var(--bm-bg2) 60%)",
            padding: "clamp(20px, 4vw, 28px)", position: "relative", overflow: "hidden" }}>
            {/* Glow */}
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200,
              borderRadius: "50%", background: "radial-gradient(ellipse, rgba(232,197,71,0.12) 0%, transparent 70%)",
              pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: "clamp(12px, 2vw, 16px)", right: "clamp(12px, 2vw, 16px)",
              padding: "3px 8px", borderRadius: 99,
              background: "rgba(232,197,71,0.15)", border: "1px solid rgba(232,197,71,0.3)",
              fontSize: 10, fontWeight: 700, color: "var(--bm-accent)",
              textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              Most popular
            </div>
            <div style={{ marginBottom: "clamp(16px, 3vw, 24px)" }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--bm-accent)", marginBottom: 10 }}>Builder</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: "clamp(32px, 7vw, 42px)", fontWeight: 900,
                  color: "var(--bm-text)", letterSpacing: "-0.04em" }}>
                  {PLAN_PRICE_LABEL.builder}
                </span>
                <span style={{ fontSize: 14, color: "var(--bm-text3)" }}>/month</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text4)", marginBottom: 20 }}>
                Cancel anytime. No contracts.
              </p>
              <Link href="/upgrade" style={{ display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, width: "100%", padding: "clamp(12px, 2.5vw, 14px) 0",
                borderRadius: 10, border: "none",
                background: "var(--bm-accent)", color: "#000",
                fontWeight: 700, fontSize: "clamp(13px, 2.5vw, 15px)",
                textDecoration: "none", boxSizing: "border-box" as const }}>
                <Zap size={14} /> Get Builder
              </Link>
              <p style={{ textAlign: "center", fontSize: 11, color: "var(--bm-text4)", marginTop: 8 }}>
                14-day free trial included
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {BUILDER_FEATURES.map(({ label, note }) => (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <Check size={13} color="var(--bm-accent)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 600, color: "var(--bm-text)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: "clamp(10px, 1.8vw, 11px)", color: "var(--bm-text4)", lineHeight: 1.5 }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: "clamp(32px, 5vw, 48px)" }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--bm-text3)", textAlign: "center", marginBottom: "clamp(20px, 3vw, 32px)" }}>
            Common questions
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "clamp(16px, 3vw, 24px)" }}>
            {[
              { q: "What makes this worth $39?", a: "Most AI tools are query-response. BuildMind runs overnight on your startup context and builds a behavioral model of how you execute over time. By week 3, the daily task is calibrated to your avoidance patterns, your working style, and your startup's survival gaps. That's not a chatbot." },
              { q: "What's the free plan actually good for?", a: "Genuinely good. The onboarding Reflexion Strike gives you a live startup analysis. You get 3 AI-calibrated tasks per week and the morning briefing twice a week. It's enough to validate whether the system works for you before paying." },
              { q: "How is this different from Notion AI or ChatGPT?", a: "Those tools answer questions. BuildMind has a north-star goal (your startup's stage and core problem), remembers your history, detects your patterns, and gives you one specific task per day. It gets more accurate the longer you use it." },
              { q: "Can I cancel anytime?", a: "Yes. Month-to-month, cancel any time from Settings. Your data and history are retained for 90 days after cancellation." },
            ].map(({ q, a }) => (
              <div key={q} style={{ padding: "clamp(14px, 3vw, 20px)", borderRadius: 12,
                border: "1px solid var(--bm-border)", background: "var(--bm-bg2)" }}>
                <p style={{ fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 700, color: "var(--bm-text)", marginBottom: 8 }}>{q}</p>
                <p style={{ fontSize: "clamp(11px, 2vw, 12px)", color: "var(--bm-text3)", lineHeight: 1.65, margin: 0 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ textAlign: "center", marginTop: "clamp(40px, 7vw, 64px)" }}>
          <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8,
            padding: "clamp(12px, 2.5vw, 14px) clamp(24px, 5vw, 36px)", borderRadius: 12,
            background: "var(--bm-accent)", color: "#000",
            fontWeight: 700, fontSize: "clamp(13px, 2.5vw, 15px)", textDecoration: "none" }}>
            Start free today <ArrowRight size={15} />
          </Link>
          <p style={{ fontSize: 12, color: "var(--bm-text4)", marginTop: 10 }}>
            No card required. Builder trial starts automatically.
          </p>
        </div>

      </div>
    </main>
  );
    }

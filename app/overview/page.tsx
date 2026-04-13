"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/layout/logo";

/**
 * Overview page — BuildMind v7
 * Shows all features in one glanceable map for onboarding and navigation.
 */

const FEATURES = [
  {
    href: "/today",
    emoji: "⚡",
    label: "Today",
    badge: "Free · Builder",
    tagline: "Your one action for today",
    desc: "A single, personalized task for your startup — tuned to your stage, your blocker, and what you did yesterday. Builder gets adaptive regen. Free gets stage-based defaults.",
    color: "#6366f1",
    builderUpgrade: "Adaptive regen — based on yesterday's actual outcome",
  },
  {
    href: "/reflect",
    emoji: "🧠",
    label: "Reflect",
    badge: "Free · Builder",
    tagline: "Close the learning loop",
    desc: "After each action: log your outcome, get the causal reason why tomorrow's task follows, and build your execution identity over time. Free logs outcomes. Builder gives causality + identity tracking.",
    color: "#10b981",
    builderUpgrade: "Causality engine: 'because you got blocked → tomorrow removes that first'",
  },
  {
    href: "/break",
    emoji: "💀",
    label: "Break My Startup",
    badge: "Free · Builder+",
    tagline: "Stress-test your idea",
    desc: "Survival probability, kill reasons, survive reasons, and brutally honest advice. Free gives a preview. Builder adds live competitor scan from the real web and a full differentiation battle plan.",
    color: "#ef4444",
    builderUpgrade: "Live competitor scan + named differentiation plan",
  },
  {
    href: "/project",
    emoji: "📊",
    label: "Project",
    badge: "Free · Builder+",
    tagline: "Your startup at a glance",
    desc: "Execution score, validation score, momentum tracking, milestone progress. Builder unlocks investor-ready metrics, signal score, and a shareable project card.",
    color: "#f59e0b",
    builderUpgrade: "Investor signal metrics + full score breakdown",
  },
  {
    href: "/report",
    emoji: "📋",
    label: "Weekly Report",
    badge: "Builder only",
    tagline: "Every Friday — brutal and specific",
    desc: "Intention vs action gap. Momentum score. Biggest execution gap. What to fix next week. Grounded in your real task data, not vibes.",
    color: "#8b5cf6",
    builderUpgrade: "Included in Builder — runs automatically every Friday",
  },
  {
    href: "/roadmap",
    emoji: "🗺️",
    label: "Roadmap",
    badge: "Builder only",
    tagline: "90-day execution tracks",
    desc: "Auto-generated milestones for your stage: Idea → Validation → MVP → Launch. Enforcement checkpoints weekly. Adapts when you pivot.",
    color: "#0ea5e9",
    builderUpgrade: "Full 90-day tracks with weekly checkpoints",
  },
  {
    href: "/coach",
    emoji: "🤖",
    label: "AI Coach",
    badge: "3/day free · Unlimited Builder",
    tagline: "Ask anything, grounded in your startup",
    desc: "Talk through decisions, blockers, pricing, user feedback. Grounded in your actual project — not generic startup advice. Free caps at 3/day. Builder removes all limits.",
    color: "#06b6d4",
    builderUpgrade: "Unlimited — no daily caps, ever",
  },
  {
    href: "/kit",
    emoji: "🧰",
    label: "Startup Kit",
    badge: "Builder only",
    tagline: "Name · Brand · Domains",
    desc: "AI-generated startup names, taglines, brand color palettes, and domain suggestions. Ready for your pitch deck or landing page.",
    color: "#ec4899",
    builderUpgrade: "Full kit generation included in Builder",
  },
];

const SOLO_BUILDER_STACK = [
  { step: "01", label: "Set up your project", sub: "4 questions. 90 seconds." },
  { step: "02", label: "Get today's action", sub: "One specific, high-leverage task." },
  { step: "03", label: "Execute. Reflect.", sub: "Log outcome. Get causality." },
  { step: "04", label: "Break it on Friday", sub: "Stress-test weekly. Kill assumptions." },
  { step: "05", label: "Read your report", sub: "Intention vs action gap revealed." },
  { step: "06", label: "Repeat with better data", sub: "Strategy adapts to what you did." },
];

export default function OverviewPage() {
  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui,sans-serif", paddingBottom: 80 }}>
      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid var(--bm-border)", background: "rgba(7,8,12,0.92)", backdropFilter: "blur(8px)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BrandMark size={22} href="/dashboard" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>BuildMind</span>
          <span style={{ fontSize: 10, color: "var(--bm-text4)", fontFamily: "monospace", marginLeft: 4 }}>Overview</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/today" style={{ fontSize: 12, color: "var(--bm-text3)", textDecoration: "none" }}>Today →</Link>
          <Link href="/upgrade" style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", padding: "6px 14px", borderRadius: 8, textDecoration: "none" }}>Upgrade</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 0" }}>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 280, damping: 24 }} style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--bm-text4)", marginBottom: 10 }}>Founder OS · Feature Map</div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--bm-text)", marginBottom: 10, letterSpacing: "-0.02em" }}>Everything BuildMind does.</h1>
          <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
            Six pages. One goal: turn your startup idea into a daily execution engine that adapts to what you actually do.
          </p>
        </motion.div>

        {/* The solo builder loop */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ marginBottom: 32, borderRadius: 14, border: "1px solid var(--bm-border2)", background: "rgba(255,255,255,0.02)", padding: "16px 18px" }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--bm-text4)", marginBottom: 14 }}>The solo builder loop</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {SOLO_BUILDER_STACK.map((s, i) => (
              <div key={s.step} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: i < SOLO_BUILDER_STACK.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--bm-text4)", width: 20, flexShrink: 0, paddingTop: 2 }}>{s.step}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)" }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "var(--bm-text3)" }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Feature cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FEATURES.map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }}>
              <Link href={f.href} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ borderRadius: 14, border: "1px solid var(--bm-border2)", background: "rgba(255,255,255,0.02)", padding: "16px 18px", transition: "border-color 0.15s, background 0.15s", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = f.color + "55"; (e.currentTarget as HTMLDivElement).style.background = f.color + "08"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bm-border2)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{f.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>{f.label}</span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--bm-text4)", padding: "1px 6px", border: "1px solid var(--bm-border2)", borderRadius: 4 }}>{f.badge}</span>
                      </div>
                      <div style={{ fontSize: 11, color: f.color, fontWeight: 600, marginBottom: 5 }}>{f.tagline}</div>
                      <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.55, marginBottom: 6 }}>{f.desc}</div>
                      <div style={{ fontSize: 10, color: f.color + "cc", fontFamily: "monospace", padding: "4px 8px", background: f.color + "0d", borderRadius: 6, display: "inline-block" }}>
                        ⚡ Builder: {f.builderUpgrade}
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: "var(--bm-text4)", flexShrink: 0, paddingTop: 2 }}>→</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Upgrade CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          style={{ marginTop: 28, borderRadius: 16, border: "1px solid rgba(99,102,241,0.25)", background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))", padding: "22px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", marginBottom: 6 }}>Ready to unlock Builder?</div>
          <p style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 18, lineHeight: 1.6 }}>
            GHS 290/month. Unlimited AI Coach. Full Break My Startup. Weekly report. Startup kit. Data export. No cap on anything.
          </p>
          <Link href="/upgrade" style={{ display: "inline-block", padding: "12px 28px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 13, borderRadius: 12, textDecoration: "none", boxShadow: "0 0 24px rgba(99,102,241,0.3)" }}>
            Upgrade to Builder →
          </Link>
          <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 10 }}>Cancel anytime. 60 seconds to set up.</div>
        </motion.div>

      </div>
    </div>
  );
}

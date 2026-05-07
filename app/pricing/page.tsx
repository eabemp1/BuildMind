import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Check, Zap, Star, Shield } from "lucide-react";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing | BuildMind",
  description: "BuildMind pricing plans for founders. Free forever or upgrade to Builder for unlimited AI.",
};

const FREE_FEATURES = [
  "Onboarding Reflexion Strike - full quality, one-time",
  "3 AI-powered actions/week (Reflexion Loop)",
  "3 AI Coach messages/day",
  "Morning Briefing - Monday + Thursday",
  "Momentum Score (Level 1 visibility)",
  "1 full Strategy Blueprint (all 8 layers)",
  "Break My Startup - 1 Stress Test",
  "Public founder profile",
];

const BUILDER_FEATURES = [
  "Daily Morning Briefing - every day",
  "Full Reflexion Loop (3-agent chain)",
  "Unlimited AI tasks + messages",
  "Rotating Critic Personas (4 weekly)",
  "Full Momentum Score with decay warnings",
  "Recovery Mode - when confidence drops",
  "Emotional language layer at trigger moments",
  "Evening check nudges",
  "Founder memory - AI remembers your history",
  "Unlimited projects",
];

export default function PricingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bm-bg)", fontFamily: "inherit" }}>

      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, borderBottom: "1px solid var(--bm-border)", position: "sticky", top: 0, background: "rgba(15,15,16,0.92)", backdropFilter: "blur(10px)", zIndex: 10 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--bm-bg3)",
              border: "1px solid var(--bm-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image src="/logo/buildmind-mark.svg" alt="BuildMind" width={20} height={20} priority />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>BuildMind</span>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/auth/login" style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid var(--bm-border)", color: "var(--bm-text2)", fontSize: 13, textDecoration: "none", fontWeight: 500 }}>Log in</Link>
          <Link href="/auth/login" style={{ padding: "8px 16px", borderRadius: 9, background: "var(--grad-primary)", color: "white", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>Get started free</Link>
        </div>
      </nav>

      {/* Ambient glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "15%", left: "25%", width: 400, height: 400, background: "radial-gradient(circle, var(--bm-accent-dim) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "15%", right: "20%", width: 300, height: 300, background: "radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "72px 24px 80px", position: "relative" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, marginBottom: 18, padding: "4px 14px", borderRadius: 20, background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}>
            <Zap size={10} /> Pricing
          </div>
          <h1 style={{ fontSize: 46, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 16px" }}>
            Pick your founder plan
          </h1>
          <p style={{ fontSize: 16, color: "var(--bm-text3)", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
            Start free, upgrade when you need unlimited execution support.
          </p>
        </div>

        {/* Plans */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 720, margin: "0 auto 48px" }}>

          {/* Free */}
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 20, padding: "32px 28px" }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 10 }}>Starter</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em" }}>Free</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>forever — no card required</div>
            </div>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", marginBottom: 28, lineHeight: 1.6 }}>Real tools. Real limits. Start building today.</p>
            <Link href="/auth/login"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text)", fontWeight: 600, fontSize: 14, textDecoration: "none", marginBottom: 28, boxSizing: "border-box", transition: "all 0.15s" }}>
              Start for free
            </Link>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Check size={13} color="var(--bm-text3)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--bm-text3)" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Builder */}
          <div style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 20, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-primary)", borderRadius: "20px 20px 0 0" }} />
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Builder</div>
                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "var(--grad-primary)", color: "white", fontWeight: 700 }}>POPULAR</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em" }}>{PLAN_PRICE_LABEL.builder}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>billed monthly · cancel anytime</div>
            </div>
            <p style={{ fontSize: 13, color: "var(--bm-text2)", marginBottom: 28, lineHeight: 1.6 }}>Unlimited AI. Full tools. Maximum execution support.</p>
            <Link href="/upgrade"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: "var(--grad-primary)", color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 28, boxSizing: "border-box" }}>
              <Zap size={14} /> Get Builder
            </Link>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {BUILDER_FEATURES.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Check size={13} color="var(--bm-accent)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--bm-text2)" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trust bar */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, flexWrap: "wrap" }}>
            {[
              { icon: <Shield size={13} />, text: "Cancel anytime" },
              { icon: <Check size={13} />, text: "No contracts" },
              { icon: <Star size={13} />, text: "Built for founders" },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--bm-text3)" }}>
                <span style={{ color: "var(--bm-accent)" }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

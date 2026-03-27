"use client";
/**
 * BuildMind Landing Page — Conversion-first design
 *
 * Flow: Land → See real task → Try it (no login) → Feel clarity → Sign up → Pay
 * North star metric: time to first action < 30 seconds
 *
 * Key decisions:
 * - "Try it now" goes to /try — zero friction, no account needed
 * - Demo card on hero shows a REAL copyable outreach message
 * - Pricing is ONE plan, ONE button labeled "Continue building"
 * - Signup only requested AFTER user has felt the product
 */

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const step = Math.ceil(target / 40);
    const t = setInterval(() => setN(p => { if (p >= target) { clearInterval(t); return target; } return Math.min(p + step, target); }), 28);
    return () => clearInterval(t);
  }, [target]);
  return <>{n}{suffix}</>;
}

const TESTIMONIALS = [
  { av: "DM", color: "#6366f1", name: "Dmitrii Malakhov", handle: "@malakhovdm", quote: "9/10. Half the graveyard of side projects wouldn't exist if founders validated distribution before writing a single line of code.", context: "Verified founder • Unsolicited 9/10 rating" },
  { av: "AK", color: "#8b5cf6", name: "Adarsh Kumar", handle: "@firstadarsh", quote: "How can I access yours? I literally keep SESSION files manually to track my progress — BuildMind replaces exactly this.", context: "Verified founder • Publicly asked for access" },
  { av: "VL", color: "#a78bfa", name: "Vladi", handle: "@xvld666", quote: "Break it down until the next step is stupidly obvious. Then do that. Repeat.", context: "Verified founder • Build in Public" },
  { av: "MG", color: "#7c3aed", name: "Mike Gustafson", handle: "@Mikejgustafson2", quote: "My task list distorts without user conversations. I have to be extremely diligent about that.", context: "Verified founder • Active product" },
];

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const msg = `Hey, quick question — what's your biggest challenge with [your problem area]?`;
  const copy = () => { navigator.clipboard.writeText(msg).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ background: "#080a0f", color: "#f1f5f9", fontFamily: "'DM Sans',system-ui,sans-serif", minHeight: "100vh" }}>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,10,15,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image src="/brand/bui.svg" alt="BuildMind" width={34} height={34} style={{ objectFit: "contain", borderRadius: 6 }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, background: "linear-gradient(135deg,#cc44ff,#7755ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.02em" }}>BuildMind</div>
              <div style={{ fontSize: 8, color: "#475569", letterSpacing: "0.15em", textTransform: "uppercase" }}>Founder OS</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <a href="#proof" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>Proof</a>
            <a href="#pricing" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>Pricing</a>
            <Link href="/auth/login" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>Login</Link>
            <Link href="/try" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>
              Try it now →
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "80px 24px 60px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 700, height: 400, background: "radial-gradient(ellipse,rgba(99,102,241,0.13) 0%,transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 28, padding: "6px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9999 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 7px #22c55e" }} />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Validated by 4 verified founders — 9/10 impact score</span>
          </div>
          <h1 style={{ fontSize: "clamp(32px,6vw,60px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 18, letterSpacing: "-0.03em" }}>
            <span style={{ color: "#f1f5f9" }}>Stop guessing what to do next.</span><br />
            <span style={{ background: "linear-gradient(135deg,#cc44ff,#7755ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Build with clear daily actions.</span>
          </h1>
          <p style={{ fontSize: "clamp(15px,2.5vw,19px)", color: "#94a3b8", lineHeight: 1.65, maxWidth: 540, margin: "0 auto 40px" }}>
            BuildMind tells you exactly what to do next — and remembers whether you did it.
          </p>

          {/* DEMO CARD — real value, no signup */}
          <div style={{ background: "#f8f7f4", borderRadius: 20, padding: 28, maxWidth: 480, margin: "0 auto 28px", textAlign: "left", color: "#1a1a2e", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              You are in: <strong style={{ color: "#1e293b" }}>Validation Stage</strong>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 6, letterSpacing: "-0.02em" }}>DO THIS NOW:</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 14 }}>Send this message to 3 people:</div>
            <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6, flex: 1, fontStyle: "italic" }}>"{msg}"</div>
              <button onClick={copy} style={{ width: 32, height: 32, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 13 }}>{copied ? "✓" : "📋"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <button onClick={copy} style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#4338ca", fontSize: 13, fontWeight: 600, padding: 11, borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>📋 Copy</button>
              <Link href="/try" style={{ background: "#16a34a", color: "white", fontSize: 13, fontWeight: 700, padding: 11, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Try it now →</Link>
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 10 }}>WHY: Validate your idea without assumptions</div>
          </div>

          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>No signup required to try it</p>
          <p style={{ fontSize: 11, color: "#334155" }}>Free to start • No credit card • Cancel anytime</p>
        </div>
      </section>

      {/* PROBLEM / FIX */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "52px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ padding: "20px 36px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 10, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 10 }}>The problem</p>
            <p style={{ fontSize: 17, color: "#f1f5f9", lineHeight: 1.55, fontWeight: 500, marginBottom: 10 }}>"ChatGPT gives great advice and forgets it immediately. You ask the same question next week and do nothing again."</p>
            <p style={{ fontSize: 13, color: "#475569" }}>The problem was never information. It was accountability.</p>
          </div>
          <div style={{ padding: "20px 36px" }}>
            <p style={{ fontSize: 10, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 10 }}>The fix</p>
            <p style={{ fontSize: 17, color: "#f1f5f9", lineHeight: 1.55, fontWeight: 500, marginBottom: 10 }}>BuildMind reads your real execution data before every response and won't let you hide from the gap.</p>
            <p style={{ fontSize: 13, color: "#475569" }}>One action. Every day. Tracked. That's it.</p>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, textAlign: "center" }}>
          {[{ v: 221, s: "", l: "Impressions on first post, zero ad spend" }, { v: 9, s: "/10", l: "Validation score from real founders" }, { v: 4, s: "", l: "Verified founders gave detailed feedback" }, { v: 30, s: "s", l: "Target time to first action" }].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 38, fontWeight: 900, background: "linear-gradient(135deg,#cc44ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}><Counter target={s.v} suffix={s.s} /></div>
              <p style={{ fontSize: 11, color: "#475569", marginTop: 7, lineHeight: 1.4 }}>{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="proof" style={{ padding: "72px 24px", background: "rgba(99,102,241,0.03)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 11 }}>Real feedback from X — unprompted</p>
            <h2 style={{ fontSize: "clamp(22px,4vw,38px)", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Verified founders said this without being asked</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 20, position: "relative" }}>
                <span style={{ position: "absolute", top: 14, right: 14, fontSize: 12, color: "#334155" }}>𝕏</span>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${t.color},#1e1b4b)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white" }}>{t.av}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#f1f5f9" }}>{t.name} ✓</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{t.handle}</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.65, marginBottom: 10 }}>"{t.quote}"</p>
                <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 6, padding: "4px 10px", fontSize: 10, color: "#818cf8", fontWeight: 500 }}>{t.context}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 11 }}>How it works</p>
            <h2 style={{ fontSize: "clamp(22px,4vw,38px)", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Value in under 30 seconds. No signup required.</h2>
          </div>
          {[
            { n: "01", title: "See your action immediately", desc: "Land on BuildMind and you see a real task right there on the page. No login. No friction. You can copy the outreach message before you've even signed up." },
            { n: "02", title: "Try it — feel the clarity", desc: "Click 'Try it now' and BuildMind asks two questions about your startup. Generates your real daily action in under 30 seconds. Still no account required." },
            { n: "03", title: "Save your progress", desc: "When you want to come back tomorrow — that's when signup happens. Not before. Value first. Account second." },
            { n: "04", title: "One action every day. Tracked.", desc: "BuildMind remembers what you committed to. Tracks whether you did it. Won't let you move forward without addressing the gap." },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 22, padding: "22px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: "rgba(129,140,248,0.22)", width: 42, flexShrink: 0 }}>{s.n}</span>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING — one plan, no confusion */}
      <section id="pricing" style={{ padding: "80px 24px", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 11 }}>Pricing</p>
          <h2 style={{ fontSize: "clamp(22px,4vw,38px)", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.02em", marginBottom: 10 }}>One plan. No confusion.</h2>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 36 }}>Free to try. Pay when you feel the value.</p>
          <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))", border: "1px solid rgba(129,140,248,0.35)", borderRadius: 20, padding: "36px 32px" }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#f1f5f9", marginBottom: 4 }}>$10<span style={{ fontSize: 15, color: "#64748b", fontWeight: 400 }}>/month</span></div>
            <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 26 }}>Everything you need to ship your startup</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, textAlign: "left" }}>
              {["Daily action engine — one obvious task per day", "Execution score — real progress tracking", "Accountability gap — commitment vs completion", "AI Coach — reads your data before every response", "Break My Startup — honest failure analysis + web search", "Weekly honest mirror — intention vs action gap", "Stage-aware roadmap — proven actions for your exact stage"].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "#94a3b8" }}>
                  <span style={{ color: "#22c55e", flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                </div>
              ))}
            </div>
            {/* Button says "Continue building" not "Subscribe" */}
            <Link href="/try" style={{ display: "block", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontWeight: 700, fontSize: 15, padding: "14px", borderRadius: 11, textDecoration: "none", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}>
              Continue building →
            </Link>
            <p style={{ fontSize: 10, color: "#334155", marginTop: 12 }}>Try free first. No credit card until you're ready.</p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: "100px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(26px,5vw,48px)", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 16 }}>
            You told yourself you'd talk to users last week.<br />
            <span style={{ background: "linear-gradient(135deg,#cc44ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Did you?</span>
          </h2>
          <p style={{ fontSize: 16, color: "#64748b", marginBottom: 32, lineHeight: 1.6 }}>BuildMind knows. And it won't let you forget.</p>
          <Link href="/try" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontWeight: 700, fontSize: 16, padding: "14px 36px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 36px rgba(99,102,241,0.32)", display: "inline-block" }}>
            Try it now — free →
          </Link>
          <p style={{ fontSize: 11, color: "#1e293b", marginTop: 16 }}>Built by a solo founder in Ghana 🇬🇭 • Zero VC</p>
        </div>
      </section>

      <footer style={{ padding: "28px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Image src="/brand/bui.svg" alt="BuildMind" width={20} height={20} style={{ objectFit: "contain", borderRadius: 4 }} />
            <span style={{ fontSize: 12, color: "#475569" }}>BuildMind</span>
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            {[["Login", "/auth/login"], ["Sign up", "/auth/signup"], ["𝕏 @emma_bem", "https://x.com/emma_bem"]].map(([l, h]) => (
              <Link key={l} href={h} style={{ fontSize: 12, color: "#334155", textDecoration: "none" }}>{l}</Link>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#1e293b" }}>© 2026 BuildMind.</p>
        </div>
      </footer>
    </div>
  );
}

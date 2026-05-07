"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { usePlan } from "@/lib/usePlan";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";
import { Check, Zap, Shield, Star, ArrowRight, Loader2 } from "lucide-react";

const FEATURES = [
  { label: "Daily Reflexion Loop (free: 3/week)", free: false, builder: true },
  { label: "Morning Briefing every day before you wake", free: false, builder: true },
  { label: "Unlimited AI tasks + messages", free: false, builder: true },
  { label: "Rotating Critic Personas (4 weekly)", free: false, builder: true },
  { label: "Full Momentum Score with decay warnings", free: false, builder: true },
  { label: "Cognitive Load Check-in - Fresh / Drained / Auto-pilot", free: false, builder: true },
  { label: "HITL Overrides - every override feeds your context", free: false, builder: true },
  { label: "Unlimited Strategy Blueprints (free: one full, then draft)", free: false, builder: true },
  { label: "90-day Execution Systems (Roadmap Tracks)", free: false, builder: true },
  { label: "Recovery Mode - when confidence drops", free: false, builder: true },
  { label: "Emotional language layer at trigger moments", free: false, builder: true },
  { label: "Evening check nudges", free: false, builder: true },
  { label: "Founder memory - AI remembers your history", free: false, builder: true },
  { label: "Unlimited projects", free: false, builder: true },
  { label: "Weekly AI Strategy Report every Friday", free: false, builder: true },
  { label: "Streak insurance - 1 save/month", free: false, builder: true },
  { label: "Pattern Detection - AI names your avoidance patterns", free: false, builder: true },
  { label: "Onboarding Reflexion Strike", free: true, builder: true },
  { label: "3 AI actions/week + 3 Coach messages/day", free: true, builder: true },
  { label: "Morning Briefing - Monday + Thursday", free: true, builder: true },
  { label: "1 full Strategy Blueprint", free: true, builder: true },
  { label: "Break My Startup - 1 Stress Test", free: true, builder: true },
  { label: "Public founder profile", free: true, builder: true },
];

const TESTIMONIALS = [
  { text: "I shipped faster in 2 weeks with BuildMind than I did in 3 months without it.", name: "Kwame A.", role: "SaaS founder, Accra" },
  { text: "The Morning Briefing lands before I touch my phone. By the time I open the app, I already know what I'm doing today.", name: "Ama S.", role: "EdTech founder" },
  { text: "It named the exact thing I kept avoiding. I didn't need more tasks — I needed someone to call it out.", name: "Daniel O.", role: "Fintech founder, Lagos" },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export default function UpgradePage() {
  const router = useRouter();
  const { plan } = usePlan();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/billing/paystack/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Payment verification failed");
        if (!cancelled) router.replace("/overview");
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Payment verification failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleUpgrade() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "builder" }) });
      if (!res.ok) throw new Error("Could not create checkout session");
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  }

  if (plan !== "free") {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Check size={26} color="var(--bm-accent)" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 10 }}>You're already on Builder</h2>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", marginBottom: 24, lineHeight: 1.6 }}>All features are unlocked. Go build something.</p>
        <button onClick={() => router.push("/overview")} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "var(--grad-primary)", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)" }}>
      {/* Ambient */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "10%", left: "20%", width: 500, height: 500, background: "radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "15%", width: 350, height: 350, background: "radial-gradient(circle, var(--bm-accent-dim) 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "34px 16px 56px" : "60px 24px 80px", position: "relative" }}>

        {/* Header — adapts based on ?feature= query param */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", marginBottom: isMobile ? 34 : 56 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, marginBottom: 20, padding: "4px 14px", borderRadius: 20, background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}>
            <Zap size={10} /> Upgrade to Builder
          </div>
          {(() => {
            const feature = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("feature") : null;
            const headlines: Record<string, { h1: string; sub: string }> = {
              ventures:  { h1: "The strategy engine has done the work.", sub: "Builder unlocks all 8 Blueprint layers, unlimited systems, and your 7-day execution plan. Cheaper than building the wrong thing for one more week." },
              briefing:  { h1: "Your Morning Briefing is ready.", sub: "Builder delivers it every day before you wake. Three lines — yesterday's win, today's risk, your next move. Already decided." },
              coach:     { h1: "You've used your 3 messages today.", sub: "Builder removes the daily limit so the AI Coach is always there when the decision can't wait until tomorrow." },
              streak:    { h1: "Builder members get one save/month.", sub: "Strategic founders protect their momentum. Restore your streak — and make sure it never breaks without a safety net again." },
              actions:   { h1: "You've used your 3 actions this week.", sub: "Builder runs the Reflexion Loop every day. Your next action is ready — you just need Builder to receive it." },
            };
            const ctx = feature && headlines[feature] ? headlines[feature] : { h1: "Not a rate limit upgrade. A power upgrade.", sub: "Cheaper than building the wrong thing for one more week. Builder is the system that makes every day of founder work count." };
            return (
              <>
                <h1 style={{ fontSize: isMobile ? 30 : 42, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em", lineHeight: 1.12, margin: "0 0 16px" }}>
                  {ctx.h1}
                </h1>
                <p style={{ fontSize: isMobile ? 14 : 15, color: "var(--bm-text3)", maxWidth: 460, margin: "0 auto", lineHeight: 1.65 }}>
                  {ctx.sub}
                </p>
              </>
            );
          })()}
        </motion.div>

        {/* Pricing card + feature list */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: 16, marginBottom: 40, maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>

          {/* CTA card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 22, padding: isMobile ? "24px 18px" : "32px 28px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-primary)", borderRadius: "22px 22px 0 0" }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 12 }}>Builder Plan</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: isMobile ? 40 : 48, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em", lineHeight: 1 }}>{PLAN_PRICE_LABEL.builder}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>Cancel anytime. No contracts.</div>
            </div>

            {error && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.25)", fontSize: 12, color: "var(--bm-red)" }}>{error}</div>
            )}

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleUpgrade} disabled={loading}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "15px 0", borderRadius: 13, border: "none", background: "var(--grad-primary)", color: "white", fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginBottom: 18, opacity: loading ? 0.8 : 1 }}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Zap size={16} /> Upgrade to Builder <ArrowRight size={15} /></>}
            </motion.button>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[{ icon: <Shield size={11} />, text: "Secure checkout via Paystack" }, { icon: <Check size={11} />, text: "Instant access on payment" }, { icon: <Star size={11} />, text: "Cancel from Settings anytime" }].map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--bm-text3)" }}>
                  <span style={{ color: "var(--bm-accent)" }}>{icon}</span>
                  {text}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Feature comparison */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 22, padding: isMobile ? "22px 18px" : "28px 24px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text2)", marginBottom: 18 }}>What you get</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {FEATURES.map((f, i) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < FEATURES.length - 1 ? "1px solid var(--bm-border)" : "none" }}>
                  <span style={{ fontSize: 12, color: f.builder && !f.free ? "var(--bm-text2)" : "var(--bm-text3)" }}>{f.label}</span>
                  <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: f.free ? "var(--bm-text3)" : "rgba(255,255,255,0.1)", width: 32, textAlign: "center" }}>{f.free ? "✓" : "—"}</span>
                    <span style={{ fontSize: 11, color: f.builder ? "var(--bm-accent)" : "var(--bm-text3)", width: 32, textAlign: "center", fontWeight: f.builder && !f.free ? 700 : 400 }}>{f.builder ? "✓" : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--bm-border)" }}>
              <span style={{ fontSize: 10, color: "var(--bm-text3)", width: 32, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.07em" }}>Free</span>
              <span style={{ fontSize: 10, color: "var(--bm-accent)", width: 32, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Pro</span>
            </div>
          </motion.div>
        </div>

        {/* Testimonials */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12, maxWidth: 760, margin: "0 auto" }}>
          {TESTIMONIALS.map((t) => (
            <div key={t.name} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "20px" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                {[...Array(5)].map((_, i) => <Star key={i} size={11} color="var(--bm-amber)" fill="var(--bm-amber)" />)}
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, margin: "0 0 14px", fontStyle: "italic" }}>&ldquo;{t.text}&rdquo;</p>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--bm-text)" }}>{t.name}</div>
              <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>{t.role}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

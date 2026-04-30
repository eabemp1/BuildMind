"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { usePlan } from "@/lib/usePlan";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";
import { Check, Zap, Shield, Star, ArrowRight, Loader2 } from "lucide-react";

const FEATURES = [
  { label: "Unlimited AI Coach messages", free: false, builder: true },
  { label: "Full Break My Startup + competitor scan", free: false, builder: true },
  { label: "Weekly AI strategy report", free: false, builder: true },
  { label: "Startup score + investor metrics", free: false, builder: true },
  { label: "90-day roadmap tracks", free: false, builder: true },
  { label: "Streak insurance (1 miss/month)", free: false, builder: true },
  { label: "Full history & data export", free: false, builder: true },
  { label: "Priority support", free: false, builder: true },
  { label: "3 AI Coach messages/week", free: true, builder: true },
  { label: "Projects + AI roadmap", free: true, builder: true },
  { label: "Task tracking + streaks", free: true, builder: true },
];

const TESTIMONIALS = [
  { text: "I shipped faster in 2 weeks with BuildMind than I did in 3 months without it.", name: "Kwame A.", role: "SaaS founder, Accra" },
  { text: "The AI Coach is brutally honest. Exactly what I needed to stop overthinking.", name: "Ama S.", role: "EdTech founder" },
  { text: "The weekly report alone is worth it — it's like a board meeting with myself.", name: "Daniel O.", role: "Fintech founder" },
];

export default function UpgradePage() {
  const router = useRouter();
  const { plan } = usePlan();
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
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Payment verification failed");
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
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
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

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px 80px", position: "relative" }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, marginBottom: 20, padding: "4px 14px", borderRadius: 20, background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}>
            <Zap size={10} /> Upgrade to Builder
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 16px" }}>
            Stop limiting yourself
          </h1>
          <p style={{ fontSize: 16, color: "var(--bm-text3)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Get unlimited AI coaching, full stress-test analysis, and every tool a serious founder needs.
          </p>
        </motion.div>

        {/* Pricing card + feature list */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: 40, maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>

          {/* CTA card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 22, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-primary)", borderRadius: "22px 22px 0 0" }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 12 }}>Builder Plan</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 48, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.04em", lineHeight: 1 }}>{PLAN_PRICE_LABEL.builder}</span>
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
            style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 22, padding: "28px 24px" }}>
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
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, maxWidth: 760, margin: "0 auto" }}>
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

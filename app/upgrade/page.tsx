"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlan } from "@/lib/usePlan";
import { Check, Loader2, ArrowRight, Shield } from "lucide-react";
import TeamsWaitlistCard from "@/components/TeamsWaitlistCard";
import { PLAN_PRICE_MONTHLY } from "@/lib/pricing";

const TIERS = [
  {
    id: "founder",
    name: "Founder",
    price: "Free",
    priceSub: "forever",
    desc: "Hook into the daily loop. Generous enough to be genuinely useful. Upgrade feels obvious, not forced.",
    featured: false,
    features: [
      "1 project, unlimited task execution days",
      "5 AI coaching messages/day",
      "Daily task generation (reflexion loop)",
      "Morning brief + Reflect sheet",
      "Momentum Score & streak",
      "Break My Startup — 2 runs/month",
      "1 integration (Notion or Linear)",
    ],
    cta: "Get started free",
    planKey: null,
  },
  {
    id: "builder",
    name: "Builder",
    price: `$${PLAN_PRICE_MONTHLY.builder}`,
    priceSub: "/mo",
    desc: "For founders building seriously. Full intelligence layer, unlimited AI, deep integrations, and the weekly synthesis report that shows you your own patterns.",
    featured: true,
    badge: "Most popular",
    features: [
      "Unlimited projects & AI messages",
      "Full founder memory & personality model",
      "Weekly AI synthesis report",
      "Break My Startup — unlimited + shareable report",
      "All integrations (Notion, Linear, GitHub, Stripe)",
      "Execution Scorecard & Moat Fingerprint",
      "Priority reflexion model (deeper critique)",
    ],
    cta: "Upgrade to Builder",
    planKey: "builder",
  },
  {
    id: "team",
    name: "Team",
    price: "Waitlist",
    priceSub: "early access",
    desc: "For cofounding teams. Teams is opening through early access instead of a second paid tier.",
    featured: false,
    features: [
      "Everything in Builder × 3 seats",
      "Cofounder Pulse — shared check-ins",
      "Team Execution Scorecard",
      "Spiral alerts to cofounders",
      "Shared milestones & project board",
      "Team weekly synthesis report",
      "Slack integration for team nudges",
    ],
    cta: "Join Team waitlist",
    planKey: "team",
  },
];

export default function UpgradePage() {
  const router = useRouter();
  const { plan } = usePlan();
  const [loading, setLoading] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showTeamsWaitlist, setShowTeamsWaitlist] = useState(false);

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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  async function handleUpgrade(planKey: string | null) {
    if (!planKey) { router.push("/auth/signup"); return; }
    if (planKey === "team") {
      setShowTeamsWaitlist(true);
      return;
    }
    setLoadingTier(planKey);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      if (!res.ok) throw new Error("Could not create checkout session");
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setLoadingTier(null); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)", padding: "60px 24px 80px" }}>
      {showTeamsWaitlist && (
        <TeamsWaitlistCard asModal onClose={() => setShowTeamsWaitlist(false)} />
      )}
      <div style={{ maxWidth: 920, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: "var(--bm-accent)",
            marginBottom: 14,
          }}>
            Pricing
          </p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--bm-text)",
            marginBottom: 14,
            lineHeight: 1.2,
          }}>
            Not a rate limit upgrade.<br />A power upgrade.
          </h1>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: "var(--bm-text2)",
            maxWidth: 480,
            margin: "0 auto",
            lineHeight: 1.6,
          }}>
            At day 7 this product is good. At day 90 it&apos;s irreplaceable. The longer you use BuildMind, the more accurate your behavioral model becomes — avoidance zones, spiral signals, execution style.
          </p>
        </div>

        {error && (
          <div style={{
            maxWidth: 480,
            margin: "0 auto 28px",
            padding: "12px 16px",
            background: "var(--bm-red-dim)",
            border: "1px solid var(--bm-red-bd)",
            borderRadius: "var(--r-lg)",
            fontSize: 12,
            color: "var(--bm-red)",
            fontFamily: "'Inter', sans-serif",
          }}>
            {error}
          </div>
        )}

        {/* Tier cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginBottom: 48,
        }}>
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              style={{
                position: "relative",
                background: tier.featured ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
                border: `1px solid ${tier.featured ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                borderRadius: "var(--r-xl)",
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Most popular badge */}
              {tier.badge && (
                <div style={{
                  position: "absolute",
                  top: -1,
                  right: 20,
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  background: "var(--bm-accent)",
                  color: "var(--bm-text-inv)",
                  borderRadius: "0 0 var(--r-md) var(--r-md)",
                  fontWeight: 500,
                }}>
                  {tier.badge}
                </div>
              )}

              {/* Tier name */}
              <p style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--bm-text3)",
                marginBottom: 8,
              }}>
                {tier.name}
              </p>

              {/* Price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "var(--bm-text)",
                }}>
                  {tier.price}
                </span>
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  color: "var(--bm-text3)",
                }}>
                  {tier.priceSub}
                </span>
              </div>

              {/* Desc */}
              <p style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: "var(--bm-text2)",
                lineHeight: 1.55,
                marginBottom: 20,
              }}>
                {tier.desc}
              </p>

              {/* Features */}
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1 }}>
                {tier.features.map((f, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "6px 0",
                      borderTop: i === 0 ? "1px solid var(--bm-border)" : "1px solid var(--bm-border)",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12.5,
                      color: "var(--bm-text2)",
                      lineHeight: 1.45,
                    }}
                  >
                    <span style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      color: "var(--bm-accent)",
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      →
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => handleUpgrade(tier.planKey)}
                disabled={loading || loadingTier === tier.planKey}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  padding: "11px 0",
                  borderRadius: "var(--r-lg)",
                  border: tier.featured ? "none" : "1px solid var(--bm-border2)",
                  background: tier.featured ? "var(--bm-accent)" : "transparent",
                  color: tier.featured ? "var(--bm-text-inv)" : "var(--bm-text2)",
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize: 13,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {loadingTier === tier.planKey ? (
                  <><Loader2 size={14} className="animate-spin" /> Processing…</>
                ) : (
                  <>{tier.cta} <ArrowRight size={13} /></>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Trust row */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}>
          {[
            { icon: <Shield size={11} />, text: "Secure checkout via Paystack" },
            { icon: <Check size={11} />, text: "Instant access on payment" },
            { icon: <Check size={11} />, text: "Cancel from Settings anytime" },
          ].map(({ icon, text }) => (
            <div key={text} style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              color: "var(--bm-text3)",
              letterSpacing: "0.04em",
            }}>
              <span style={{ color: "var(--bm-accent)" }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {/* Bottom positioning statement */}
        <div style={{
          marginTop: 56,
          padding: "24px 28px",
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border)",
          borderRadius: "var(--r-xl)",
          borderLeft: "2px solid var(--bm-accent)",
        }}>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: "var(--bm-accent)",
            marginBottom: 8,
          }}>
            The pricing insight
          </p>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: "var(--bm-text2)",
            lineHeight: 1.6,
            maxWidth: 640,
          }}>
            BuildMind is not competing with Notion or Linear. It&apos;s competing with the expensive executive coach, the VC operating partner, and the founder therapist — all three — at a fraction of the cost and available at 2am when the anxiety hits. Builder gets you in. The reflexion loop keeps you. Raise to $39 when D30 retention crosses 40%.
          </p>
        </div>
      </div>
    </div>
  );
}

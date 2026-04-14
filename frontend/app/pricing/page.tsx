import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing | BuildMind",
  description:
    "BuildMind pricing plans for founders: Starter (free) and Builder with unlimited AI coaching and execution tools.",
};

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "forever",
    description: "Real tools. Real limits. No card.",
    cta: "Start for free",
    href: "/auth/signup",
    featured: false,
    features: [
      "Projects + AI-generated roadmap",
      "Daily action engine by stage",
      "Task tracking + streaks",
      "3 AI Coach messages/day",
      "Break My Startup preview",
      "Public weekly share card",
    ],
  },
  {
    name: "Builder",
    price: "GHS 290",
    period: "/month (~$19)",
    description: "For solo founders ready to ship consistently.",
    cta: "Upgrade to Builder",
    href: "/upgrade?plan=builder",
    featured: true,
    features: [
      "Unlimited AI Coach",
      "Full Break My Startup + competitor scan",
      "Weekly AI strategy report",
      "Startup score and investor metrics",
      "Startup kit + landing generator",
      "90-day roadmap tracks",
      "Full history and data export",
    ],
  },
];

export default function PricingPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 20px 72px", background: "var(--bm-bg)" }}>
      <div style={{ maxWidth: 1050, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              color: "var(--bm-accent)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Pricing
          </div>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: 0, color: "var(--bm-text)" }}>
            Pick your founder plan
          </h1>
          <p style={{ fontSize: 14, color: "var(--bm-text3)", marginTop: 10 }}>
            Start free, upgrade when you need unlimited execution support.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14 }}>
          {plans.map((plan) => (
            <section
              key={plan.name}
              style={{
                border: plan.featured ? "1px solid rgba(99,102,241,0.35)" : "1px solid var(--bm-border2)",
                borderRadius: 16,
                padding: "22px 20px",
                background: plan.featured
                  ? "linear-gradient(180deg, rgba(99,102,241,0.12), rgba(255,255,255,0.02))"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              {plan.featured ? (
                <div
                  style={{
                    fontSize: 10,
                    color: "#a5b4fc",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 8,
                    fontWeight: 700,
                  }}
                >
                  Most popular
                </div>
              ) : null}

              <h2 style={{ margin: "0 0 2px", fontSize: 20, color: "var(--bm-text)" }}>{plan.name}</h2>
              <p style={{ margin: "0 0 10px", color: "var(--bm-text3)", fontSize: 12 }}>{plan.description}</p>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
                <div style={{ fontSize: 34, color: "var(--bm-text)", fontWeight: 700 }}>{plan.price}</div>
                <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>{plan.period}</div>
              </div>

              <ul style={{ margin: "0 0 16px", paddingLeft: 18, color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.8 }}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <Link
                href={plan.href}
                style={{
                  display: "inline-block",
                  width: "100%",
                  textAlign: "center",
                  padding: "10px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  border: plan.featured ? "none" : "1px solid var(--bm-border2)",
                  color: plan.featured ? "#fff" : "var(--bm-text)",
                  background: plan.featured
                    ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                    : "rgba(255,255,255,0.04)",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {plan.cta}
              </Link>
            </section>
          ))}
        </div>

        <p style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--bm-text4)" }}>
          Need team or enterprise billing? Contact hello@buildmind.live.
        </p>
      </div>
    </main>
  );
}

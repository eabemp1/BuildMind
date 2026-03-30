"use client";
/**
 * /welcome — Post-payment page
 *
 * Critical conversion principle: after payment, show the NEXT TASK immediately.
 * NOT the dashboard. NOT a welcome screen. The task.
 *
 * Momentum must not break at the payment moment.
 * User just paid → they should feel immediately productive.
 *
 * The /action route is the existing daily action page in the dashboard.
 * If you don't have /action yet, redirect to /dashboard instead and
 * make sure the dashboard surfaces today's task at the top.
 */

import Link from "next/link";
import Image from "next/image";

export default function WelcomePage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", fontFamily: "'DM Sans',system-ui,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
        <Image src="/brand/bui.svg" alt="BuildMind" width={36} height={36} style={{ objectFit: "contain", borderRadius: 7 }} />
        <div style={{ fontWeight: 900, fontSize: 18, background: "linear-gradient(135deg,#cc44ff,#7755ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.02em" }}>BuildMind</div>
      </div>

      <div style={{ width: "100%", maxWidth: 480 }}>
        {/* Quick confirmation */}
        <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div style={{ fontSize: 13, color: "#f1f5f9" }}>You're in. BuildMind will hold you accountable from today.</div>
        </div>

        {/* NEXT TASK — not dashboard, not welcome screen */}
        <div style={{ background: "#f8f7f4", borderRadius: 20, padding: 28, color: "#1a1a2e", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            Keep the momentum going. Your next action:
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 7, letterSpacing: "-0.02em" }}>DO THIS NOW:</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 16, lineHeight: 1.45 }}>
            Open your project and complete the first pending task
          </div>
          <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
            You just committed to keeping momentum. The only way to keep it is to act right now, before the feeling fades.
          </div>
          <Link
            href="/dashboard"
            style={{ display: "block", background: "#16a34a", color: "white", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none", textAlign: "center" }}
          >
            See today's action →
          </Link>
          <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 10 }}>
            WHY: Momentum compounds. Don't break it now.
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <Link href="/dashboard" style={{ fontSize: 12, color: "#475569", textDecoration: "none" }}>Go to dashboard instead</Link>
        </div>
      </div>
    </div>
  );
}

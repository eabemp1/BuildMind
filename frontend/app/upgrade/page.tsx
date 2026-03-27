"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const CHECKOUT_URL = process.env.NEXT_PUBLIC_CHECKOUT_URL ?? "#";

const FEATURES = [
  "Daily action engine — one obvious task generated every morning",
  "Execution score — real progress tracking from your actual tasks",
  "Accountability gap — commitment vs completion, always visible",
  "AI Coach — reads your real data before every response",
  "Break My Startup — honest failure analysis with web search",
  "Weekly honest mirror — intention vs action gap, every Friday",
  "Stage-aware roadmap — proven actions for your exact stage",
];

function UpgradeContent() {
  const params = useSearchParams();
  const tasksCompleted = params.get("tasks") ?? "2";
  const streak = params.get("streak") ?? "1";

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", fontFamily: "'DM Sans',system-ui,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 36 }}>
        <Image src="/brand/bui.svg" alt="BuildMind" width={36} height={36} style={{ objectFit: "contain", borderRadius: 7 }} />
        <div style={{ fontWeight: 900, fontSize: 18, background: "linear-gradient(135deg,#cc44ff,#7755ff,#44aaff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.02em" }}>BuildMind</div>
      </div>

      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>You're making progress.</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {tasksCompleted} tasks completed • {streak} day streak. Unlock your next steps and stay consistent.
            </div>
          </div>
        </div>

        <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))", border: "1px solid rgba(129,140,248,0.35)", borderRadius: 20, padding: "32px 28px" }}>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#f1f5f9", marginBottom: 4 }}>
            $10<span style={{ fontSize: 14, color: "#64748b", fontWeight: 400 }}>/month</span>
          </div>
          <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 22 }}>Everything you need to keep this momentum going</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "#94a3b8" }}>
                <span style={{ color: "#22c55e", flexShrink: 0, marginTop: 1 }}>✓</span>{f}
              </div>
            ))}
          </div>

          <a
            href={CHECKOUT_URL}
            style={{ display: "block", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontWeight: 700, fontSize: 15, padding: "14px", borderRadius: 11, textDecoration: "none", textAlign: "center", boxShadow: "0 0 24px rgba(99,102,241,0.3)" }}
          >
            Continue building →
          </a>

          <p style={{ fontSize: 11, color: "#334155", textAlign: "center", marginTop: 12 }}>Cancel anytime. No questions asked.</p>
        </div>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link href="/dashboard" style={{ fontSize: 12, color: "#475569", textDecoration: "none" }}>
            Continue with free access during beta →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0f1117" }} />}>
      <UpgradeContent />
    </Suspense>
  );
}

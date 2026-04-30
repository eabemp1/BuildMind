"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { canAccess, Plan } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { PLAN_NAME, PLAN_PRICE_LABEL } from "@/lib/pricing";

interface PaywallGateProps {
  feature: string;
  featureLabel?: string;
  requiredPlan?: Plan;
  children: ReactNode;
  variant?: "overlay" | "block" | "inline";
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="var(--bm-accent)" strokeWidth="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="var(--bm-accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GateCard({ featureLabel, requiredPlan, onUpgrade }: { featureLabel: string; requiredPlan: Plan; onUpgrade: () => void }) {
  const displayPlan = requiredPlan;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 14,
        border: "1px solid var(--bm-accent-bd)",
        background: "var(--bm-accent-dim)",
        padding: "24px 20px", textAlign: "center",
        fontFamily: "inherit",
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: "var(--bm-bg3)", border: "1px solid var(--bm-accent-bd)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 14px",
      }}>
        <LockIcon />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text)", marginBottom: 8 }}>
        {featureLabel}
      </div>
      <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.65, marginBottom: 20 }}>
        This feature is included in the{" "}
        <span style={{ color: "var(--bm-accent)", fontWeight: 500 }}>{PLAN_NAME[displayPlan]} plan</span>{" "}
        ({PLAN_PRICE_LABEL[displayPlan]}).
      </div>
      <button
        onClick={onUpgrade}
        style={{
          width: "100%", padding: "11px 0",
          background: "var(--bm-accent)", color: "var(--bm-text-inv)",
          fontWeight: 600, fontSize: 13, borderRadius: 10,
          border: "none", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Upgrade to {PLAN_NAME[displayPlan]} →
      </button>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--bm-text4)" }}>Cancel anytime · No questions asked</div>
    </motion.div>
  );
}

export default function PaywallGate({ feature, featureLabel, requiredPlan = "builder", children, variant = "overlay" }: PaywallGateProps) {
  const router = useRouter();
  const { plan } = usePlan();
  const hasAccess = canAccess(feature, plan);

  const displayPlan = requiredPlan;
  const onUpgrade = () => router.push(`/upgrade?plan=${displayPlan}`);
  const label = featureLabel ?? feature;

  if (hasAccess) return <>{children}</>;

  if (variant === "block") return <GateCard featureLabel={label} requiredPlan={requiredPlan} onUpgrade={onUpgrade} />;

  if (variant === "inline") {
    return (
      <button onClick={onUpgrade} style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 99,
        background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
        color: "var(--bm-accent)", fontSize: 11, fontWeight: 500, cursor: "pointer",
        fontFamily: "inherit",
      }}>
        <LockIcon /> {PLAN_NAME[displayPlan]}
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none", opacity: 0.3 }}>{children}</div>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
        <div style={{ width: "100%", maxWidth: 340 }}>
          <GateCard featureLabel={label} requiredPlan={requiredPlan} onUpgrade={onUpgrade} />
        </div>
      </div>
    </div>
  );
}

export function usePaywall(feature: string) {
  const router = useRouter();
  const { plan } = usePlan();
  return {
    hasAccess: canAccess(feature, plan),
    onUpgrade: (targetPlan: Plan = "builder") => router.push(`/upgrade?plan=${targetPlan}`),
  };
}

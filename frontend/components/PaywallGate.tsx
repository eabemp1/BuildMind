"use client";

/**
 * components/PaywallGate.tsx
 *
 * Drop-in paywall overlay for any feature gated to Builder or Venture.
 * Usage:
 *   <PaywallGate feature="weeklyReport" requiredPlan="builder">
 *     <YourFeatureComponent />
 *   </PaywallGate>
 *
 * Props:
 *   feature        — human-readable feature name shown in the gate UI
 *   requiredPlan   — "builder" | "venture"
 *   variant        — "overlay" (default) | "block" | "inline"
 *                    overlay: blurs content behind and shows gate on top
 *                    block:   replaces content entirely with gate card
 *                    inline:  small locked pill, no children shown
 */

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { canAccess, getPlan, Plan } from "@/lib/plan";

interface PaywallGateProps {
  feature: string;           // key used in FEATURE_GATES (e.g. "weeklyReport")
  featureLabel?: string;     // human-readable label shown in gate UI
  requiredPlan?: Plan;       // shown price tier — default "builder"
  children: ReactNode;
  variant?: "overlay" | "block" | "inline";
}

const PLAN_PRICE: Record<Plan, string> = {
  free: "$0",
  builder: "$19/mo",
  venture: "$49/mo",
};

const PLAN_LABEL: Record<Plan, string> = {
  free: "Starter",
  builder: "Builder",
  venture: "Venture",
};

function normalizeRequiredPlan(plan: Plan): Plan {
  return plan === "venture" ? "builder" : plan;
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#6366f1" strokeWidth="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GateCard({ featureLabel, requiredPlan, onUpgrade }: {
  featureLabel: string;
  requiredPlan: Plan;
  onUpgrade: () => void;
}) {
  const displayPlan = normalizeRequiredPlan(requiredPlan);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 16,
        border: "1px solid rgba(99,102,241,0.25)",
        background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.05))",
        padding: "24px 20px",
        textAlign: "center",
        fontFamily: "system-ui,sans-serif",
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 14px",
      }}>
        <LockIcon />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color:"var(--bm-text)", marginBottom: 6 }}>
        {featureLabel}
      </div>
      <div style={{ fontSize: 12, color:"var(--bm-text3)", lineHeight: 1.6, marginBottom: 20 }}>
        This feature is included in the{" "}
        <span style={{ color: "#818cf8", fontWeight: 500 }}>
          {PLAN_LABEL[displayPlan]} plan
        </span>{" "}
        ({PLAN_PRICE[displayPlan]}).
      </div>
      <button
        onClick={onUpgrade}
        style={{
          width: "100%", padding: "11px 0",
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          color: "#fff", fontWeight: 600, fontSize: 13,
          borderRadius: 10, border: "none", cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: "0 0 20px rgba(99,102,241,0.3)",
        }}
        >
        Upgrade to {PLAN_LABEL[displayPlan]} →
      </button>
      <div style={{ marginTop: 10, fontSize: 11, color:"var(--bm-text4)" }}>
        Cancel anytime · No questions asked
      </div>
    </motion.div>
  );
}

export default function PaywallGate({
  feature,
  featureLabel,
  requiredPlan = "builder",
  children,
  variant = "overlay",
}: PaywallGateProps) {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    setHasAccess(canAccess(feature, getPlan()));
  }, [feature]);

  const displayPlan = normalizeRequiredPlan(requiredPlan);
  const onUpgrade = () => router.push(`/upgrade?plan=${displayPlan}`);
  const label = featureLabel ?? feature;

  // Still loading — render nothing to avoid flash
  if (hasAccess === null) return null;

  // Has access — render children normally
  if (hasAccess) return <>{children}</>;

  if (variant === "block") {
    return <GateCard featureLabel={label} requiredPlan={requiredPlan} onUpgrade={onUpgrade} />;
  }

  if (variant === "inline") {
    return (
      <button
        onClick={onUpgrade}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "5px 11px", borderRadius: 99,
          background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
          color: "#818cf8", fontSize: 11, fontWeight: 500, cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
            <LockIcon /> {PLAN_LABEL[displayPlan]}
      </button>
    );
  }

  // overlay variant — blurs content behind the gate
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(5px)", pointerEvents: "none", userSelect: "none", opacity: 0.35 }}>
        {children}
      </div>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 20px",
      }}>
        <div style={{ width: "100%", maxWidth: 340 }}>
          <GateCard featureLabel={label} requiredPlan={requiredPlan} onUpgrade={onUpgrade} />
        </div>
      </div>
    </div>
  );
}

/**
 * Hook version for programmatic checks in existing pages.
 * Returns { hasAccess, onUpgrade } — call onUpgrade() to redirect.
 */
export function usePaywall(feature: string) {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    setHasAccess(canAccess(feature, getPlan()));
  }, [feature]);

  return {
    hasAccess,
    onUpgrade: (plan: Plan = "builder") => router.push(`/upgrade?plan=${normalizeRequiredPlan(plan)}`),
  };
}

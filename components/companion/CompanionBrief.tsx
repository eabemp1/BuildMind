"use client";

import React from "react";
import { useCompanion } from "@/components/companion/useCompanion";
import MomentCard from "@/components/companion/MomentCard";
import { useActiveProjectId } from "@/lib/queries";
import { usePlan } from "@/lib/usePlan";

/** Top of Today: the Co-founder's highest-priority moment (the rest live in the top-bar button). */
export default function CompanionBrief() {
  const { plan } = usePlan();
  const projectId = useActiveProjectId();
  const { data, dismiss, acted } = useCompanion(projectId);
  if (plan !== "builder" || !data || data.moments.length === 0) return null;
  const color = data.styles.find((s) => s.key === data.style)?.color ?? "var(--bm-accent)";
  const m = data.moments[0];
  return (
    <div style={{ marginBottom: "var(--space-3)", minWidth: 0 }}>
      <MomentCard m={m} color={color} projectId={projectId} onDismiss={dismiss} onActed={acted} />
      {data.moments.length > 1 && (
        <div style={{ fontSize: 11.5, color: "var(--bm-text3)", marginTop: 4 }}>{data.moments.length - 1} more in the co-founder button, top right.</div>
      )}
    </div>
  );
}

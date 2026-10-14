"use client";

import React from "react";
import { usePricing } from "@/lib/usePricing";

/** Inline regional price. kind: "label" → "$15/mo", "amount" → "$15", "month" → "$15/month". */
export function Price({ kind = "label" }: { kind?: "label" | "amount" | "month" }) {
  const p = usePricing();
  const amount = Number.isInteger(p.monthlyUsd) ? `$${p.monthlyUsd}` : `$${p.monthlyUsd.toFixed(2)}`;
  if (kind === "amount") return <>{amount}</>;
  if (kind === "month") return <>{amount}/month</>;
  return <>{p.label}</>;
}

/** Small line shown only to visitors getting regional pricing. */
export function RegionalNote({ style }: { style?: React.CSSProperties }) {
  const p = usePricing();
  if (!p.regional) return null;
  return (
    <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: "4px 0 0", ...style }}>
      Africa pricing, standard {p.standardLabel.replace("/mo", "")}/month elsewhere.
    </p>
  );
}

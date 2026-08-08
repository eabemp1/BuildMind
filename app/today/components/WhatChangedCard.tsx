"use client";

/**
 * app/today/components/WhatChangedCard.tsx
 *
 * Spec §10 — "What Changed". Surfaces state.temporal.week_changes in full
 * (up to 3 items, per summarizeFounderIntelligenceForClient in
 * lib/founderIntelligence.ts). Previously only what_changed[0] was ever
 * rendered (inside IntelligencePanel) and the rest of the array was
 * silently discarded — this card is purely additive, no backend change.
 */

import { Sparkles } from "lucide-react";

export function WhatChangedCard({ items }: { items: string[] }) {
  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 6, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", margin: 0, color: "var(--bm-text)" }}>
          What changed since yesterday
        </h3>
      </div>

      {items.length === 0 ? (
        <div style={{ marginTop: 10, color: "var(--bm-text3)", fontSize: 12.5, lineHeight: 1.55 }}>
          No material shift detected yet. BuildMind is monitoring for a meaningful change.
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 0",
                borderBottom: i < items.length - 1 ? "1px solid var(--bm-border)" : "none",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "var(--bm-intel-dim)",
                  color: "var(--bm-intel)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <Sparkles size={12} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{item}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WhatChangedCard;

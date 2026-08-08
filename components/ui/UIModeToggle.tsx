"use client";

import type { UIMode } from "@/lib/uiMode";

/**
 * components/ui/UIModeToggle.tsx
 *
 * Two-state switch: Lite (existing focused Today experience) vs Pro (Founder
 * Intelligence OS — deeper signals, evidence, full metric row). Lite is the
 * default so first-time founders aren't overwhelmed; Pro is one tap away and
 * sticks per-device once chosen.
 */
export function UIModeToggle({
  mode,
  onChange,
}: {
  mode: UIMode;
  onChange: (mode: UIMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Display density"
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border)",
        borderRadius: 7,
        padding: 2,
        gap: 2,
      }}
    >
      <button
        type="button"
        onClick={() => onChange("lite")}
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10.5,
          letterSpacing: "0.02em",
          padding: "5px 10px",
          borderRadius: 5,
          border: "none",
          cursor: "pointer",
          background: mode === "lite" ? "var(--bm-bg4)" : "transparent",
          color: mode === "lite" ? "var(--bm-text)" : "var(--bm-text3)",
        }}
      >
        Lite
      </button>
      <button
        type="button"
        onClick={() => onChange("pro")}
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10.5,
          letterSpacing: "0.02em",
          padding: "5px 10px",
          borderRadius: 5,
          border: "none",
          cursor: "pointer",
          background: mode === "pro" ? "var(--bm-bg4)" : "transparent",
          color: mode === "pro" ? "var(--bm-intel)" : "var(--bm-text3)",
        }}
      >
        Pro
      </button>
    </div>
  );
}

export default UIModeToggle;

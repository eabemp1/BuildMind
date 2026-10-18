"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { shrinkFits, type SwapMode, type SwapReason } from "@/lib/today/swap";

/**
 * "Replace this task" with an optional one-tap reason. The reason is saved
 * as a fact the generator and guards must respect; skipping is always allowed.
 */

export const FEEDBACK_REASONS = [
  { key: "no_motivation", label: "Don't feel like it" },
  { key: "no_users", label: "No users yet" },
  { key: "no_access", label: "No access" },
  { key: "already_done", label: "Already did this" },
  { key: "too_big", label: "Too big" },
  { key: "not_relevant", label: "Not relevant" },
  { key: "no_time", label: "No time" },
] as const;
export type FeedbackKey = (typeof FEEDBACK_REASONS)[number]["key"];

export default function ReplaceWithReason({
  taskText, projectId, busy, onReplace,
}: {
  taskText: string;
  projectId?: string | null;
  busy: boolean;
  onReplace: (swap: { reason: SwapReason | null; mode: SwapMode }) => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<FeedbackKey | null | undefined>(undefined);

  async function choose(reason: FeedbackKey | null) {
    // Reasons where a smaller version helps get a second step: shrink or switch.
    if (shrinkFits(reason as SwapReason | null) && reason !== null) { setPicked(reason); return; }
    await finish(reason, "alternative");
  }

  async function finish(reason: FeedbackKey | null, mode: SwapMode) {
    setOpen(false);
    setPicked(undefined);
    if (reason) {
      try {
        await fetch("/api/today/feedback", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_text: taskText, reason, projectId: projectId ?? null }),
        });
      } catch { /* feedback is best-effort; the replace still happens */ }
    }
    await onReplace({ reason: reason as SwapReason | null, mode });
  }

  const chip: React.CSSProperties = {
    border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)",
    borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)} disabled={busy}
        style={{
          display: "flex", alignItems: "center", gap: "var(--space-2)", background: "transparent",
          border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "var(--space-2) var(--space-3)",
          fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--bm-text3)",
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1, marginBottom: "var(--space-3)", fontFamily: "inherit",
        }}
      >
        <RotateCcw size={11} />
        {busy ? "Fetching new task..." : "Replace this task →"}
      </button>
    );
  }

  if (picked) {
    const opt: React.CSSProperties = { ...chip, display: "block", textAlign: "left", width: "100%", padding: "8px 10px", marginBottom: 6, color: "var(--bm-text)" };
    return (
      <div style={{ marginBottom: "var(--space-3)", minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 6 }}>The goal stays. How should it change?</div>
        <button type="button" style={opt} onClick={() => void finish(picked, "shrink")}>
          <span style={{ fontWeight: 600 }}>Make it smaller</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--bm-text3)", marginTop: 2 }}>Same task, a first slice of about 15 minutes.</span>
        </button>
        <button type="button" style={opt} onClick={() => void finish(picked, "alternative")}>
          <span style={{ fontWeight: 600 }}>A different task that matters just as much</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--bm-text3)", marginTop: 2 }}>Never an easier, lower-value one.</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "var(--space-3)", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 6 }}>What doesn't fit? It helps the next task.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FEEDBACK_REASONS.map((r) => (
          <button key={r.key} type="button" style={chip} onClick={() => void choose(r.key)}>{r.label}</button>
        ))}
        <button type="button" style={{ ...chip, color: "var(--bm-text3)" }} onClick={() => void choose(null)}>Just replace</button>
      </div>
    </div>
  );
}

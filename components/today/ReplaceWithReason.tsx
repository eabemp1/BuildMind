"use client";

import React from "react";
import { RotateCcw } from "lucide-react";

/**
 * "Replace this task" with an optional one-tap reason. The reason is saved
 * as a fact the generator and guards must respect; skipping is always allowed.
 */

export const FEEDBACK_REASONS = [
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
  onReplace: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);

  async function choose(reason: FeedbackKey | null) {
    setOpen(false);
    if (reason) {
      try {
        await fetch("/api/today/feedback", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_text: taskText, reason, projectId: projectId ?? null }),
        });
      } catch { /* feedback is best-effort; the replace still happens */ }
    }
    await onReplace();
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

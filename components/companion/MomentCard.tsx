"use client";

import React from "react";
import Link from "next/link";
import { DURATION_CHOICES, type DurationChoice } from "@/lib/today/loops";
import type { ShapedMoment } from "@/lib/companion/moments";

const KIND_LABEL: Record<ShapedMoment["kind"], string> = {
  pushback_planned_vs_done: "Plan vs output",
  pushback_avoidance: "Avoiding",
  reflection_gap: "Reflection",
  milestone_overdue: "Deadline",
  restart: "Momentum",
  win: "Win",
};

const chip = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "var(--bm-accent)" : "var(--bm-border)"}`,
  background: active ? "var(--bm-accent-dim)" : "transparent",
  color: active ? "var(--bm-text)" : "var(--bm-text3)",
  borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
});

/**
 * One Co-founder moment: lead line, the plain evidence behind it, and at most
 * one job the founder approves. Nothing happens until they press the button.
 */
export default function MomentCard({
  m, color, projectId, onDismiss, onActed,
}: {
  m: ShapedMoment; color: string; projectId?: string | null;
  onDismiss: (key: string) => void; onActed: (key: string) => void;
}) {
  const job = m.job;
  const [choice, setChoice] = React.useState<DurationChoice>(job?.type === "schedule_followup" ? job.choice : "1d");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  async function approve() {
    if (job?.type !== "schedule_followup") return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/today/loops", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_text: job.task, measure: job.measure, choice, projectId: projectId ?? null }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j?.error ?? "Could not schedule it."); return; }
      onActed(m.key);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ borderLeft: `3px solid ${color}`, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderLeftWidth: 3, borderLeftColor: color, borderRadius: "var(--r-lg)", padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>{KIND_LABEL[m.kind]}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.4, overflowWrap: "anywhere" }}>{m.headline}</div>
      <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
        {m.facts.map((f, i) => (
          <li key={i} style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.45, overflowWrap: "anywhere" }}>{f}</li>
        ))}
      </ul>
      <div style={{ fontSize: 12.5, color: "var(--bm-text2)", marginTop: 6, lineHeight: 1.45 }}>{m.body}</div>

      {job?.type === "schedule_followup" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 4 }}>Check back on: “{job.task}”</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(DURATION_CHOICES) as DurationChoice[]).map((k) => (
              <button key={k} type="button" style={chip(choice === k)} onClick={() => setChoice(k)}>{DURATION_CHOICES[k].label}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {job?.type === "schedule_followup" && (
          <button type="button" disabled={busy} style={chip(true)} onClick={() => void approve()}>{busy ? "Saving…" : "Approve"}</button>
        )}
        {job?.type === "open" && (
          <Link href={job.href} style={{ ...chip(true), textDecoration: "none" }} onClick={() => onActed(m.key)}>{job.label}</Link>
        )}
        <button type="button" style={chip(false)} onClick={() => onDismiss(m.key)}>{m.kind === "win" ? "Thanks" : "Not now"}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: "var(--bm-red)", marginTop: 6 }}>{err}</div>}
    </div>
  );
}

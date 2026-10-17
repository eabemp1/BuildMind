"use client";

import React from "react";
import { DURATION_CHOICES, canSnooze, loopQuestion, urgencyOf, type DurationChoice, type Loop, type LoopResult } from "@/lib/today/loops";

/**
 * Follow-ups the founder scheduled themselves ("check back in 3 days").
 * Shown above the Today task once due. Flat and compact: one row per
 * follow-up, evidence box opens inline.
 */

const RESULTS: Array<{ key: LoopResult; label: string }> = [
  { key: "worked", label: "Worked" },
  { key: "mixed", label: "Mixed" },
  { key: "failed", label: "Didn't work" },
];

const URGENCY_TEXT = { due: "Due", overdue: "Overdue", stale: "Waiting a while" } as const;

async function patch(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`/api/today/loops/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

function Row({ loop, onDone }: { loop: Loop; onDone: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [evidence, setEvidence] = React.useState("");
  const [result, setResult] = React.useState<LoopResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const u = urgencyOf(loop);

  async function run(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    const ok = await patch(loop.id, body);
    setBusy(false);
    if (ok) onDone(loop.id); else setErr("Could not save. Try again.");
  }

  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "var(--bm-accent)" : "var(--bm-border)"}`,
    background: active ? "var(--bm-accent-dim)" : "transparent",
    color: active ? "var(--bm-text)" : "var(--bm-text3)",
    borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--bm-border)" }}>
      <div style={{ fontSize: 11, color: u === "due" ? "var(--bm-text3)" : "var(--bm-amber)", marginBottom: 3 }}>{URGENCY_TEXT[u]}</div>
      <div style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.45, overflowWrap: "anywhere" }}>{loopQuestion(loop)}</div>
      {!open ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" style={chip(true)} onClick={() => setOpen(true)}>Record what happened</button>
          {canSnooze(loop) && (Object.keys(DURATION_CHOICES) as DurationChoice[]).slice(0, 3).map((k) => (
            <button key={k} type="button" disabled={busy} style={chip(false)} onClick={() => void run({ action: "snooze", choice: k })}>
              {DURATION_CHOICES[k].label}
            </button>
          ))}
          <button type="button" disabled={busy} style={chip(false)} onClick={() => void run({ action: "dismiss" })}>Dismiss</button>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} maxLength={1000}
            placeholder="Numbers if you have them: 3 replies, 0 signups…"
            style={{ width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: 8, fontSize: 13, color: "var(--bm-text)", fontFamily: "inherit", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
            {RESULTS.map((r) => (
              <button key={r.key} type="button" style={chip(result === r.key)} onClick={() => setResult(result === r.key ? null : r.key)}>{r.label}</button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" style={chip(false)} onClick={() => setOpen(false)}>Back</button>
            <button
              type="button" disabled={busy || evidence.trim().length < 2}
              style={{ ...chip(true), opacity: evidence.trim().length < 2 ? 0.5 : 1 }}
              onClick={() => void run({ action: "record", evidence: evidence.trim(), ...(result ? { result } : {}) })}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: "var(--bm-red)", marginTop: 6 }}>{err}</div>}
    </div>
  );
}

export default function FollowUpCard() {
  const [loops, setLoops] = React.useState<Loop[]>([]);

  React.useEffect(() => {
    let live = true;
    fetch("/api/today/loops", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok && Array.isArray(j.due)) setLoops(j.due); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (loops.length === 0) return null;
  return (
    <section style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "12px 14px", marginBottom: "var(--space-3)", minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bm-text3)" }}>
        Time to check back
      </h3>
      {loops.slice(0, 3).map((l) => (
        <Row key={l.id} loop={l} onDone={(id) => setLoops((xs) => xs.filter((x) => x.id !== id))} />
      ))}
    </section>
  );
}

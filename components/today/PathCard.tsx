"use client";
import { useEffect, useState } from "react";

type Goal = { vision: string; label: string; target: number; current: number; daysLeft: number };
type Data = { goal: Goal | null; setup: boolean; stage: string; stages: string[] };

const card = { background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "14px 16px", marginBottom: 12 } as const;
const eyebrow = { fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: "var(--bm-text3)" } as const;
const field = { width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: 14 } as const;
const small = { background: "transparent", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "6px 12px", color: "var(--bm-text)", fontSize: 13, cursor: "pointer" } as const;

/** Where the founder is on the way to their vision: stage route, one 90-day goal, and progress they log themselves. */
export default function PathCard({ projectId }: { projectId?: string | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [vision, setVision] = useState("");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/project/path?project_id=${projectId}`).then((r) => r.json()).then((b) => { if (b?.ok) setData(b); }).catch(() => {});
  }, [projectId]);

  if (!projectId || !data || data.setup) return null;
  const { goal, stage, stages } = data;

  async function send(method: "PUT" | "PATCH", body: Record<string, unknown>) {
    setError("");
    try {
      const r = await fetch("/api/project/path", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId, ...body }) });
      const b = await r.json();
      if (!r.ok || !b?.ok) { setError(b?.error ?? "Could not save. Try again."); return; }
      setData((d) => (d ? { ...d, goal: b.goal } : d)); setEditing(false);
    } catch { setError("Could not save. Try again."); }
  }

  if (!goal || editing) {
    return (
      <div style={card}>
        <div style={eyebrow}>YOUR PATH</div>
        <p style={{ fontSize: 14, color: "var(--bm-text2)", margin: "6px 0 10px", lineHeight: 1.5 }}>Say where you are heading and pick one goal for the next 90 days, with a number.</p>
        <div style={{ display: "grid", gap: 8 }}>
          <input style={field} value={vision} onChange={(e) => setVision(e.target.value)} maxLength={200} placeholder="Your vision, in one sentence" aria-label="Vision" />
          <input style={field} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="90-day goal, e.g. customer conversations" aria-label="90-day goal" />
          <input style={field} value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="How many? e.g. 20" aria-label="Target number" />
        </div>
        {error && <p style={{ fontSize: 12, color: "var(--bm-red, #c0392b)", margin: "8px 0 0" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" style={{ ...small, background: "var(--bm-accent)", borderColor: "var(--bm-accent)", color: "#09090A", fontWeight: 600 }} onClick={() => send("PUT", { vision, label, target: Number(target) })}>Save goal</button>
          {goal && <button type="button" style={small} onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </div>
    );
  }

  const at = Math.max(0, stages.indexOf(stage));
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  return (
    <div style={card}>
      <div style={eyebrow}>YOUR PATH</div>
      {goal.vision && <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1.35, margin: "6px 0 12px", color: "var(--bm-text)" }}>{goal.vision}</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 4 }} aria-label={`You are at the ${stage} stage`}>
        {stages.map((s, i) => (
          <div key={s} style={{ textAlign: "center" }}>
            <div style={{ height: 4, borderRadius: 2, background: i <= at ? "var(--bm-accent)" : "var(--bm-border2)", opacity: i < at ? 0.55 : 1 }} />
            <div style={{ fontSize: 10, marginTop: 5, color: i === at ? "var(--bm-text)" : "var(--bm-text3)", fontWeight: i === at ? 600 : 400 }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--bm-border)", marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: "var(--bm-text2)" }}>
          <span>{goal.label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--bm-text)" }}>{goal.current} of {goal.target}</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--bm-border)", marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--bm-accent)", borderRadius: 4, transition: "width .4s" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>{goal.daysLeft} days left · you log this yourself</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" style={small} aria-label="Remove one" onClick={() => send("PATCH", { delta: -1 })}>−1</button>
            <button type="button" style={{ ...small, background: "var(--bm-accent)", borderColor: "var(--bm-accent)", color: "#09090A", fontWeight: 600 }} aria-label="Add one" onClick={() => send("PATCH", { delta: 1 })}>+1</button>
            <button type="button" style={small} onClick={() => { setVision(goal.vision); setLabel(goal.label); setTarget(String(goal.target)); setEditing(true); }}>Edit</button>
          </span>
        </div>
        {error && <p style={{ fontSize: 12, color: "var(--bm-red, #c0392b)", margin: "8px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}

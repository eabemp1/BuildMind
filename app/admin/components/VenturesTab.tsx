"use client";
// Auto-extracted from app/admin/page.tsx (Fix #2 — page decomposition)

import React, { useState } from "react";
import { Map } from "lucide-react";
import { VENTURE_TRACKS, type VentureTrack } from "@/lib/ventures";

const C = {
  bg2: "var(--bm-bg2)", bg3: "var(--bm-bg3)",
  b:   "var(--bm-border)", b2: "var(--bm-border2)",
  t:   "var(--bm-text)", t2: "var(--bm-text2)", t3: "var(--bm-text3)",
  a:   "var(--bm-accent)", ad: "var(--bm-accent-dim)", ab: "var(--bm-accent-bd)",
  rMd: "var(--r-md)", rLg: "var(--r-lg)",
};
type DoneMap = Record<string, boolean>;

export { VenturesTab };

function VenturesTab() {
  const [selected, setSelected] = useState<VentureTrack | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { const r = localStorage.getItem("bm_admin_ventures_done"); if (r) setDone(JSON.parse(r)); } catch {}
  }, []);

  function toggle(vid: string, mid: string) {
    const key = `${vid}::${mid}`;
    setDone(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("bm_admin_ventures_done", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  if (selected) {
    const milestones = selected.phases.flatMap(p => p.milestones);
    const completed = milestones.filter(m => done[`${selected.id}::${m.id}`]).length;
    const pct = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;

    return (
      <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{ padding: "7px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← All ventures</button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: selected.color, flexShrink: 0 }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: C.t }}>{selected.name}</span>
              <Badge label={selected.status} color={selected.status === "active" ? "#34d399" : "#818cf8"} bg={selected.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(129,140,248,0.1)"} border={selected.status === "active" ? "rgba(52,211,153,0.2)" : "rgba(129,140,248,0.2)"} />
            </div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{selected.tagline}</div>
          </div>
        </div>

        <Card style={{ padding: "16px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.t3 }}>Milestone progress</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: selected.color }}>{pct}% · {completed}/{milestones.length}</span>
          </div>
          <div style={{ height: 5, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} style={{ height: "100%", background: selected.color, borderRadius: 99 }} />
          </div>
        </Card>

        <div style={{ fontSize: 12, color: C.t3, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: C.rMd, padding: "12px 16px", marginBottom: 14, lineHeight: 1.6 }}>
          {selected.soloFirstNote}
        </div>

        <Card style={{ padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.t4, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Revenue model</div>
          {selected.revenueModel.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: C.t3 }}>{r.label}</span>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{r.value}</span>
            </div>
          ))}
        </Card>

        {selected.phases.map(phase => (
          <div key={phase.id} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 3, height: 18, borderRadius: 99, background: phase.color }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.t }}>{phase.label}</div>
                <div style={{ fontSize: 11, color: C.t4 }}>{phase.weeks} · {phase.goal}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {phase.milestones.map(m => {
                const key = `${selected.id}::${m.id}`;
                const isDone = !!done[key];
                return (
                  <div key={m.id} style={{ borderRadius: C.rMd, border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : C.b}`, background: isDone ? "rgba(16,185,129,0.03)" : C.bg2, opacity: isDone ? 0.6 : 1 }}>
                    <div style={{ padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <button onClick={() => toggle(selected.id, m.id)}
                        style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1, border: `1px solid ${isDone ? "#10b981" : C.b2}`, background: isDone ? "#10b981" : "transparent", color: "white", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isDone ? "✓" : ""}
                      </button>
                      <div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8" }}>{m.type}</span>
                          <span style={{ fontSize: 10, color: C.t4 }}>{m.week}</span>
                        </div>
                        <div style={{ fontSize: 13, color: isDone ? C.t3 : C.t, textDecoration: isDone ? "line-through" : "none", lineHeight: 1.4 }}>{m.task}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </motion.div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>Your 4 private venture roadmaps. Not visible to other users.</p>
      {VENTURE_TRACKS.map(v => {
        const ms = v.phases.flatMap(p => p.milestones);
        const comp = ms.filter(m => done[`${v.id}::${m.id}`]).length;
        const pct = ms.length ? Math.round((comp / ms.length) * 100) : 0;
        return (
          <Card key={v.id} onClick={() => setSelected(v)}
            style={{ padding: "20px 22px", transition: "border-color 0.15s, background 0.15s" }}
            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLElement).style.borderColor = C.b3; }}
            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLElement).style.borderColor = C.b; }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: v.color, flexShrink: 0, boxShadow: `0 0 8px ${v.color}55` }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.t }}>{v.name}</span>
                  <Badge label={v.status} color={v.status === "active" ? "#34d399" : "#818cf8"} bg={v.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(129,140,248,0.1)"} border={v.status === "active" ? "rgba(52,211,153,0.2)" : "rgba(129,140,248,0.2)"} />
                </div>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 14 }}>{v.tagline}</div>
                <div style={{ height: 3, background: C.bg4, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: v.color, borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: v.color, letterSpacing: "-0.03em" }}>{pct}%</div>
                <div style={{ fontSize: 11, color: C.t4 }}>{comp}/{ms.length}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

"use client";
/**
 * components/today/RadarBar.tsx - Radar's presence on Today.
 *
 * Radar is not a side list. It is a live line at the top of Today that always says
 * something true (what is due, or that it is watching, or that it is empty), and when
 * something cannot wait it takes over the task (see lib/radar/urgency.ts). The takeover
 * always carries an "Keep my usual task" undo, so the founder stays in control.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RadarView } from "@/lib/radar/store";
import { radarSignal, type RadarSignal } from "@/lib/radar/urgency";
import { sinceLabel } from "@/lib/radar/autoRun";

export interface RadarAuto { enabled: boolean; lastRunAt: string | null; lastAdded: number; known: boolean; paid: boolean }

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const undoKey = () => `bm_radar_undo_${dayKey()}`;

export function readUndone(): string | null {
  try { return localStorage.getItem(undoKey()); } catch { return null; }
}
export function markUndone(id: string): void {
  try { localStorage.setItem(undoKey(), id); } catch { /* private mode */ }
}

export function useRadarSignal(projectId?: string | null): { items: RadarView[] | null; signal: RadarSignal; setup: boolean; auto: RadarAuto; reload: () => void } {
  const [items, setItems] = useState<RadarView[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [auto, setAuto] = useState<RadarAuto>({ enabled: true, lastRunAt: null, lastAdded: 0, known: false, paid: true });
  const [ignored, setIgnored] = useState<string | null>(null);
  const reload = useCallback(() => {
    let where = ""; try { where = localStorage.getItem("bm_radar_where") ?? ""; } catch { /* ignore */ }
    const q = new URLSearchParams({ ...(projectId ? { projectId } : {}), ...(where ? { where } : {}) });
    setIgnored(readUndone());
    fetch(`/api/radar?${q}`).then((r) => r.json()).then((b) => { setItems(b.items ?? []); setSetup(b.reason === "setup"); if (b.auto) setAuto({ ...b.auto, known: true }); }).catch(() => setItems([]));
  }, [projectId]);
  useEffect(() => { reload(); }, [reload]);
  const signal = useMemo(() => radarSignal(items ?? [], ignored), [items, ignored]);
  return { items, signal, setup, auto, reload };
}

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 12px", borderRadius: "var(--mood-radius, 10px)", minWidth: 0 };
const link: React.CSSProperties = { fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--bm-accent)", textDecoration: "none", whiteSpace: "nowrap" };
const ghost: React.CSSProperties = { minHeight: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-border3)", background: "transparent", color: "var(--bm-text2)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

export default function RadarBar({ signal, setup, auto, tookOver, onUndo, onAutoChange }: { signal: RadarSignal; setup: boolean; auto?: RadarAuto; tookOver: boolean; onUndo: () => void; onAutoChange?: () => void }) {
  const [turningOn, setTurningOn] = useState(false);
  async function turnOn() {
    setTurningOn(true);
    try { await fetch("/api/radar/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto: true }) }); onAutoChange?.(); } catch { /* try again */ }
    setTurningOn(false);
  }
  const checked = auto && !auto.paid ? "Automatic search is part of the paid plan" : auto?.enabled === false ? "Automatic search is off" : auto?.lastRunAt ? `Last searched ${sinceLabel(auto.lastRunAt)}${auto.lastAdded ? `, found ${auto.lastAdded} new` : ""}` : "Searches for you twice a week";
  const { level } = signal;
  const dot = (color: string, pulse: boolean) => (
    <span aria-hidden="true" className={pulse ? "bm-radar-dot" : undefined} style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
  );
  const style = `@keyframes bmRadarPulse{0%,100%{opacity:1}50%{opacity:.35}}.bm-radar-dot{animation:bmRadarPulse 1.8s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.bm-radar-dot{animation:none}}`;

  if (setup) {
    return <div role="status" style={{ ...row, border: "1px dashed var(--bm-border2)" }}><span style={{ fontSize: "var(--text-sm)", color: "var(--bm-text3)" }}>Radar needs its database migration before it can watch for you.</span></div>;
  }

  if (tookOver && signal.item) {
    return (
      <div role="status" style={{ ...row, border: "1px solid var(--bm-accent)", background: "var(--bm-accent-dim)" }}>
        <style>{style}</style>
        {dot("var(--bm-accent)", true)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--bm-accent)" }}>Radar took over today</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--bm-text)", fontWeight: 600, overflowWrap: "anywhere" }}>{signal.headline}</div>
        </div>
        <button type="button" onClick={onUndo} style={ghost}>Keep my usual task</button>
      </div>
    );
  }

  if (level === "soon" && signal.item) {
    return (
      <div role="status" style={{ ...row, border: "1px solid var(--bm-accent-bd)", borderLeft: "3px solid var(--bm-accent)", background: "var(--bm-bg2)" }}>
        <style>{style}</style>
        {dot("var(--bm-accent)", true)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--bm-accent)" }}>Radar{signal.dueThisWeek > 1 ? ` · ${signal.dueThisWeek} due this week` : ""}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--bm-text)", fontWeight: 600, overflowWrap: "anywhere" }}>{signal.headline}</div>
        </div>
        <Link href="/radar" style={link}>Open →</Link>
      </div>
    );
  }

  if (level === "watching") {
    return (
      <div role="status" style={{ ...row, border: "1px solid var(--bm-border)", background: "var(--bm-bg2)" }}>
        {dot("var(--bm-green)", false)}
        <span style={{ fontSize: "var(--text-sm)", color: "var(--bm-text2)", overflowWrap: "anywhere" }}><strong style={{ color: "var(--bm-text)" }}>Radar watching</strong> · {signal.tracked} tracked · {signal.headline}<span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--bm-text3)", marginTop: 2 }}>{checked}</span></span>
        <Link href="/radar" style={{ ...link, marginLeft: "auto", color: "var(--bm-text3)" }}>Open →</Link>
      </div>
    );
  }

  return (
    <div style={{ ...row, border: "1px dashed var(--bm-border2)" }}>
      {dot("var(--bm-text4)", false)}
      <span style={{ fontSize: "var(--text-sm)", color: "var(--bm-text3)", flex: "1 1 220px" }}>
        Radar is empty. {auto && !auto.paid ? "Add a grant, event, meeting or person and it will start shaping Today. Automatic weekly search is part of the paid plan." : auto?.known && auto.enabled && auto.lastRunAt ? `${checked}.` : "Let it search for grants, events and hackathons that fit you, twice a week, or add one yourself."}
      </span>
      {auto?.paid !== false && !(auto?.known && auto.enabled && auto.lastRunAt) && auto?.enabled !== false && onAutoChange && (
        <button type="button" onClick={turnOn} disabled={turningOn} style={ghost}>{turningOn ? "Turning on..." : "Search for me"}</button>
      )}
      <Link href="/radar" style={{ ...link, marginLeft: "auto" }}>Add one →</Link>
    </div>
  );
}

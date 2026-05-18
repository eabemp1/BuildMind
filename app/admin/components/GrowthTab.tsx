"use client";
// Auto-extracted from app/admin/page.tsx (Fix #2 — page decomposition)
// See audit report §P0.2: admin/page.tsx was 1,120 lines.

import React, { useState, useEffect } from "react";
import { TrendingUp, Target, BarChart3 } from "lucide-react";

// Shared token map (duplicated from admin/page.tsx for isolation)
const C = {
  bg:  "var(--bm-bg)",  bg2: "var(--bm-bg2)",
  b:   "var(--bm-border)",
  t:   "var(--bm-text)", t2: "var(--bm-text2)", t3: "var(--bm-text3)",
  a:   "var(--bm-accent)", amber: "var(--bm-amber)", red: "var(--bm-red)",
  rSm: "var(--r-sm)", rMd: "var(--r-md)", rLg: "var(--r-lg)",
};
type MetricStatus = "on_track" | "watch" | "below_target" | "no_data";
interface GrowthMetric { key: string; label: string; value: number | null; target: number | null; status: MetricStatus; unit: string; }
interface ActivityPoint { date: string; dau: number; wau: number; }
interface GrowthData { generatedAt: string; summary: GrowthMetric[]; weeklyActivity: ActivityPoint[]; }
const statusColor = (s: MetricStatus) => ({ on_track: C.a, watch: C.amber, below_target: C.red, no_data: C.t3 })[s];
const statusLabel  = (s: MetricStatus) => ({ on_track: "On track", watch: "Watch", below_target: "Below", no_data: "—" })[s];

export { GrowthTab };

function GrowthTab() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/system/growth-metrics", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed");
      setData(j.data);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <RefreshCw size={12} style={{ animation: loading ? "adm-spin 0.8s linear infinite" : "none" }} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div style={{ padding: "12px 16px", borderRadius: C.rMd, background: "rgba(224,85,85,0.07)", border: "1px solid rgba(224,85,85,0.2)", color: C.red, fontSize: 13 }}>{error}</div>}
      {loading && !data && <div style={{ padding: 48, textAlign: "center", color: C.t3, fontSize: 13 }}>Loading growth metrics…</div>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {data.summary.map(m => {
              const col = statusColor(m.status);
              const val = m.value === null ? "—" : m.unit === "percent" ? `${m.value}%` : n(m.value);
              return (
                <Card key={m.key} style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.3 }}>{m.label}</span>
                    <Badge label={statusLabel(m.status)} color={col} bg={`${col}14`} border={`${col}33`} />
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: col, letterSpacing: "-0.04em", marginBottom: 2 }}>{val}</div>
                  <div style={{ fontSize: 10, color: C.t4, marginBottom: 10 }}>target {m.unit === "percent" ? `${m.target}%` : n(m.target)}</div>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: C.t3, margin: 0 }}>{m.detail}</p>
                </Card>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Stat label="Weekly active founders" value={`${data.weeklyActive.founders}`} sub={`since ${new Date(data.weeklyActive.since).toLocaleDateString()}`} icon={Activity} />
            <Stat label="Paid activation" value={`${data.conversion.paidActivatedUsers} / ${data.conversion.activatedUsers}`} sub="paid / activated" icon={DollarSign} color={C.teal} />
            <Stat label="Execution proof" value={`${data.executionBehavior.foundersWithThreeCompletedActions}`} sub="founders with 3+ completions" icon={CheckCircle2} color={C.a} />
            <Stat label="Avg completed actions" value={data.executionBehavior.averageCompletedActionsPerActivatedFounder ?? "—"} sub="per activated founder" icon={Target} color={C.blue} />
          </div>

          <Card style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <BarChart3 size={14} color={C.a} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: "0.08em" }}>Venture signal</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: C.t3, margin: 0 }}>
              BuildMind looks venture-scalable when D30 retention &gt; 25%, weekly active founders &gt; 100, activated-to-paid conversion &gt; 10%, and execution data proves the product changes founder behaviour.
            </p>
            <p style={{ fontSize: 11, color: C.t4, margin: "10px 0 0" }}>Generated {new Date(data.generatedAt).toLocaleString()}</p>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════
const SRC_LABELS: Record<string, string> = { streak_7: "🔥 7d streak", streak_14: "⚔️ 14d", streak_30: "💎 30d", high_confidence: "💪 High confidence", manual: "Manual", admin: "Admin" };


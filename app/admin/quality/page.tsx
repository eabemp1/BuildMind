"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, XCircle, TrendingUp, BarChart2, RefreshCw } from "lucide-react";

interface DailyStat {
  date: string;
  pass: number;
  fail: number;
  total: number;
  passRate: number | null;
}

interface ContextStat {
  context: string;
  pass: number;
  fail: number;
  total: number;
  passRate: number | null;
}

interface RejectReason {
  reason: string;
  count: number;
}

interface DashboardData {
  summary: {
    total: number;
    totalPass: number;
    totalFail: number;
    overallPassRate: number | null;
    recentPassRate: number | null;
    qualityAlert: string | null;
  };
  dailyTrend: DailyStat[];
  contextBreakdown: ContextStat[];
  topRejectReasons: RejectReason[];
}

function PassRateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span style={{ color: "var(--bm-text3)", fontSize: 12 }}>–</span>;
  const color = rate >= 80 ? "var(--bm-accent)" : rate >= 60 ? "var(--bm-amber)" : "var(--bm-red)";
  return (
    <span style={{ fontWeight: 700, color, fontSize: 13 }}>{rate}%</span>
  );
}

function MiniBar({ pass, fail }: { pass: number; fail: number }) {
  const total = pass + fail;
  if (total === 0) return <div style={{ height: 6, borderRadius: 3, background: "var(--bm-bg3)", width: "100%" }} />;
  const passW = Math.round((pass / total) * 100);
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${passW}%`, background: "var(--bm-accent)", transition: "width 0.4s" }} />
      <div style={{ flex: 1, background: "var(--bm-red)", opacity: 0.6 }} />
    </div>
  );
}

export default function QualityDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/quality-dashboard");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setError("Admin access required.");
        } else {
          setError(json?.error ?? "Failed to load quality data.");
        }
        return;
      }
      const json = await res.json();
      if (json?.data) {
        setData(json.data);
        setLastRefreshed(new Date());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
            Internal · Admin Only
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>
            Reflexion Quality Log
          </h1>
          <p style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 4 }}>
            Agent B pass/fail rates — last 30 days
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "var(--bm-bg2)", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)", color: "var(--bm-red)", fontSize: 13, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--bm-text3)", fontSize: 13 }}>
          Loading quality data…
        </div>
      )}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Quality alert */}
          {data.summary.qualityAlert && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: 12, background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.25)", color: "var(--bm-amber)" }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>{data.summary.qualityAlert}</span>
            </div>
          )}

          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              { label: "Total evaluations", value: data.summary.total.toLocaleString(), icon: BarChart2, color: "var(--bm-text)" },
              { label: "Overall pass rate", value: data.summary.overallPassRate !== null ? `${data.summary.overallPassRate}%` : "–", icon: TrendingUp, color: data.summary.overallPassRate !== null && data.summary.overallPassRate >= 70 ? "var(--bm-accent)" : "var(--bm-amber)" },
              { label: "Last 7 days", value: data.summary.recentPassRate !== null ? `${data.summary.recentPassRate}%` : "–", icon: TrendingUp, color: data.summary.recentPassRate !== null && data.summary.recentPassRate >= 70 ? "var(--bm-accent)" : "var(--bm-red)" },
              { label: "Total passed", value: data.summary.totalPass.toLocaleString(), icon: CheckCircle2, color: "var(--bm-accent)" },
              { label: "Total failed", value: data.summary.totalFail.toLocaleString(), icon: XCircle, color: "var(--bm-red)" },
            ].map(tile => {
              const Icon = tile.icon;
              return (
                <div key={tile.label} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <Icon size={13} color={tile.color} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.label}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: tile.color, letterSpacing: "-0.03em" }}>{tile.value}</div>
                </div>
              );
            })}
          </div>

          {/* Daily trend — sparkline style */}
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              Pass rate — daily (last 30 days)
            </div>
            {data.dailyTrend.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0 }}>No evaluations yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, minWidth: data.dailyTrend.length * 26, height: 80 }}>
                  {data.dailyTrend.map(d => {
                    const rate = d.passRate ?? 0;
                    const barH = Math.max(4, Math.round((rate / 100) * 72));
                    const color = rate >= 80 ? "var(--bm-accent)" : rate >= 60 ? "var(--bm-amber)" : "var(--bm-red)";
                    return (
                      <div key={d.date} title={`${d.date}: ${rate}% (${d.pass}/${d.total})`} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}>
                        <div style={{ width: "100%", height: barH, background: color, borderRadius: 3, opacity: 0.85, transition: "height 0.3s" }} />
                        <span style={{ fontSize: 8, color: "var(--bm-text3)", transform: "rotate(-45deg)", display: "block", whiteSpace: "nowrap" }}>
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Context breakdown + top reject reasons side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* Per-context */}
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>By context</div>
              {data.contextBreakdown.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0 }}>No data.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.contextBreakdown.map(ctx => (
                    <div key={ctx.context}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: "var(--bm-text)", fontWeight: 500 }}>{ctx.context}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>{ctx.total} runs</span>
                          <PassRateBadge rate={ctx.passRate} />
                        </div>
                      </div>
                      <MiniBar pass={ctx.pass} fail={ctx.fail} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top reject reasons */}
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Top reject reasons</div>
              {data.topRejectReasons.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0 }}>No rejections recorded yet. {data.summary.totalFail > 0 ? "Fails exist but reject_reason column may be empty." : ""}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.topRejectReasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-red)", minWidth: 20 }}>{r.count}×</span>
                      <span style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.5 }}>{r.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          {lastRefreshed && (
            <p style={{ fontSize: 11, color: "var(--bm-text3)", textAlign: "center", margin: 0 }}>
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}

        </motion.div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

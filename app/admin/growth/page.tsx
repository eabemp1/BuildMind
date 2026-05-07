"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, CheckCircle2, RefreshCw, Target, TrendingUp } from "lucide-react";

type MetricStatus = "on_track" | "watch" | "below_target" | "no_data";

interface GrowthMetric {
  key: string;
  label: string;
  value: number | null;
  target: number;
  unit: "percent" | "count";
  status: MetricStatus;
  detail: string;
}

interface GrowthMetricsPayload {
  generatedAt: string;
  summary: GrowthMetric[];
  weeklyActive: { founders: number; since: string };
  conversion: { activatedUsers: number; paidActivatedUsers: number };
  executionBehavior: {
    foundersWithThreeCompletedActions: number;
    averageCompletedActionsPerActivatedFounder: number | null;
  };
}

const STATUS_LABEL: Record<MetricStatus, string> = {
  on_track: "On track",
  watch: "Watch",
  below_target: "Below target",
  no_data: "No data",
};

function statusColor(status: MetricStatus) {
  if (status === "on_track") return "var(--bm-accent)";
  if (status === "watch") return "var(--bm-amber)";
  if (status === "below_target") return "var(--bm-red)";
  return "var(--bm-text3)";
}

function formatMetric(metric: GrowthMetric) {
  if (metric.value === null) return "-";
  return metric.unit === "percent" ? `${metric.value}%` : metric.value.toLocaleString();
}

export default function GrowthMetricsPage() {
  const [data, setData] = useState<GrowthMetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/growth-metrics", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Failed to load growth metrics.");
        return;
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-text3)", marginBottom: 5 }}>
            Internal Growth Metrics
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 850, letterSpacing: "-0.03em", color: "var(--bm-text)", margin: 0 }}>
            Venture-Scale Readiness
          </h1>
          <p style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 5, maxWidth: 620 }}>
            Tracks D30 retention, weekly active founders, activated-to-paid conversion, and execution behavior change.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "var(--bm-bg2)", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "14px 16px", borderRadius: 12, color: "var(--bm-red)", background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)", marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 36, color: "var(--bm-text3)", textAlign: "center", fontSize: 13 }}>
          Loading growth metrics...
        </div>
      )}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {data.summary.map((metric) => {
              const color = statusColor(metric.status);
              return (
                <div key={metric.key} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "17px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{metric.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color, background: `${color}16`, border: `1px solid ${color}33`, borderRadius: 999, padding: "3px 8px" }}>
                      {STATUS_LABEL[metric.status]}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 30, lineHeight: 1, fontWeight: 850, color, letterSpacing: "-0.04em" }}>{formatMetric(metric)}</span>
                    <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>target {metric.unit === "percent" ? `${metric.target}%` : metric.target}</span>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--bm-text3)", margin: 0 }}>{metric.detail}</p>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            {[
              { icon: Activity, title: "Weekly activity", value: `${data.weeklyActive.founders} founders`, detail: `Active since ${new Date(data.weeklyActive.since).toLocaleDateString()}` },
              { icon: TrendingUp, title: "Paid activation", value: `${data.conversion.paidActivatedUsers}/${data.conversion.activatedUsers}`, detail: "Activated means one project plus at least 3 completed actions." },
              { icon: CheckCircle2, title: "Execution proof", value: `${data.executionBehavior.foundersWithThreeCompletedActions} founders`, detail: "Founders with at least 3 completed tasks, reflections, or Reflexion outcomes." },
              { icon: Target, title: "Avg completed actions", value: data.executionBehavior.averageCompletedActionsPerActivatedFounder === null ? "-" : String(data.executionBehavior.averageCompletedActionsPerActivatedFounder), detail: "Average completed actions per activated founder." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "17px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                    <Icon size={15} color="var(--bm-accent)" />
                    <span style={{ fontSize: 12, fontWeight: 750, color: "var(--bm-text2)" }}>{item.title}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 850, color: "var(--bm-text)", marginBottom: 5 }}>{item.value}</div>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--bm-text3)", margin: 0 }}>{item.detail}</p>
                </div>
              );
            })}
          </div>

          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <BarChart3 size={15} color="var(--bm-accent)" />
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--bm-text2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Venture signal</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--bm-text3)", margin: 0 }}>
              BuildMind starts looking venture-scalable when D30 retention clears 25%, weekly active founders cross 100, activated-to-paid conversion clears 10%, and completion behavior proves the product changes what founders actually do.
            </p>
          </div>

          <p style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center", margin: 0 }}>
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </motion.div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

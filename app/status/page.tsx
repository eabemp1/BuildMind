import React from "react";
import type { Metadata } from "next";
import { checkAndRecord, getStatusHistory, dailyUptime, overallUptime, COMPONENT_LABELS, type Health } from "@/lib/statusChecks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "BuildMind Status", description: "Live system status and 30-day uptime for BuildMind." };

const COL: Record<Health, string> = { up: "#3fb97c", degraded: "#e0a63a", down: "#e05555" };
const TXT: Record<Health, string> = { up: "Operational", degraded: "Degraded", down: "Outage" };
const HEADLINE: Record<Health, string> = { up: "All systems operational", degraded: "Partial degradation", down: "Service disruption" };

function Bars({ days }: { days: { date: string; uptime: number | null }[] }) {
  return (
    <div style={{ display: "flex", gap: 2, height: 26 }} aria-hidden>
      {days.map((d, i) => {
        const c = d.uptime === null ? "#3a3d44" : d.uptime >= 99.5 ? COL.up : d.uptime >= 95 ? COL.degraded : COL.down;
        return <span key={d.date} className="st-bar" title={`${d.date}: ${d.uptime === null ? "no data" : d.uptime + "%"}`} style={{ flex: 1, minWidth: 0, background: c, borderRadius: 2, opacity: d.uptime === null ? 0.5 : 1, animationDelay: `${i * 14}ms` }} />;
      })}
    </div>
  );
}

export default async function StatusPage() {
  const [now, history] = await Promise.all([checkAndRecord(), getStatusHistory(30)]);
  const overallDays = dailyUptime(history, null);
  const total = overallUptime(overallDays);
  return (
    <main style={{ minHeight: "100vh", background: "#0f1012", color: "#e8eaed", fontFamily: "Geist, system-ui, sans-serif", padding: "40px 16px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b8f98", fontWeight: 700, marginBottom: 18 }}>BuildMind status</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", border: "1px solid #26282d", borderLeft: `3px solid ${COL[now.overall]}`, borderRadius: 10, background: "#15171a" }}>
          <span className="st-pulse" style={{ width: 10, height: 10, borderRadius: "50%", background: COL[now.overall], flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{HEADLINE[now.overall]}</div>
            <div style={{ fontSize: 12, color: "#8b8f98", marginTop: 2 }}>
              Checked {new Date(now.checkedAt).toUTCString().replace("GMT", "UTC")}{total !== null ? ` · ${total}% uptime, last 30 days` : ""}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22, border: "1px solid #26282d", borderRadius: 10, background: "#15171a", overflow: "hidden" }}>
          {Object.entries(now.components).map(([key, c], i) => {
            const days = dailyUptime(history, key);
            const up = overallUptime(days);
            return (
              <div key={key} style={{ padding: "14px 18px", borderTop: i ? "1px solid #26282d" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{COMPONENT_LABELS[key] ?? key}</span>
                  <span style={{ color: COL[c.status], fontWeight: 600, whiteSpace: "nowrap" }}>{TXT[c.status]}{up !== null ? <span style={{ color: "#8b8f98", fontWeight: 400 }}> · {up}%</span> : null}</span>
                </div>
                <Bars days={days} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b6f78", marginTop: 8 }}><span>30 days ago</span><span>Today</span></div>
        <p style={{ fontSize: 12, color: "#6b6f78", marginTop: 28 }}>Machine-readable: <a href="/api/status" style={{ color: "#8b8f98" }}>/api/status</a></p>
      </div>
      <style>{`
        @keyframes stGrow { from { transform: scaleY(0.2); opacity: 0 } to { transform: scaleY(1) } }
        @keyframes stPulse { 0% { box-shadow: 0 0 0 0 rgba(63,185,124,.5) } 70% { box-shadow: 0 0 0 7px rgba(63,185,124,0) } 100% { box-shadow: 0 0 0 0 rgba(63,185,124,0) } }
        .st-bar { transform-origin: bottom; animation: stGrow .5s ease-out both }
        .st-pulse { animation: stPulse 2.2s ease-out infinite }
        @media (prefers-reduced-motion: reduce) { .st-bar, .st-pulse { animation: none } }
      `}</style>
    </main>
  );
}

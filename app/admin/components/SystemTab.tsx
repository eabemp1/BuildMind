"use client";
import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { C, Panel } from "./ui";

interface Check { label: string; healthy?: boolean | null; note?: string | null }
interface Live { status: "up" | "degraded" | "down"; components: Record<string, { status: string }> }
const COL = { up: C.a, degraded: C.amber, down: C.red } as const;

export function SystemTab() {
  const [live, setLive] = useState<Live | null>(null);
  const [checks, setChecks] = useState<Record<string, Check> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setLive).catch(() => {});
    fetch("/api/admin/health-check").then((r) => r.json()).then((j) => (j.ok ? setChecks(j.checks) : setErr(j.error ?? "Health check failed"))).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="Live status" right={<a href="/status" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.a, textDecoration: "none" }}>Public page <ExternalLink size={10} /></a>}>
        {!live ? <div style={{ fontSize: 12, color: C.t3 }}>Checking…</div> : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 12, color: COL[live.status] }}>
              <span className="adm-live" style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
              {live.status === "up" ? "All systems operational" : live.status === "degraded" ? "Partially degraded" : "Outage"}
            </div>
            <div className="adm-three">
              {Object.entries(live.components).map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${C.b}` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: COL[v.status as keyof typeof COL] ?? C.t4 }} />
                  <span style={{ textTransform: "capitalize", flex: 1 }}>{k}</span>
                  <span style={{ color: C.t3 }}>{v.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel title="Deep health check">
        {err && <div style={{ fontSize: 12, color: C.red }}>{err}</div>}
        {!checks && !err && <div style={{ fontSize: 12, color: C.t3 }}>Running…</div>}
        {checks && Object.entries(checks).map(([k, c], i) => (
          <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderTop: i ? `1px solid ${C.b}` : "none", fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 5, background: c.healthy === true ? C.a : c.healthy === false ? C.red : C.t4, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              {c.note && <span style={{ display: "block", color: C.t3, marginTop: 2, wordBreak: "break-word" }}>{c.note}</span>}
            </span>
          </div>
        ))}
      </Panel>

      <Panel title="Get paged when it breaks">
        <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6 }}>
          Point a free monitor (UptimeRobot or BetterStack) at <code>https://buildmind.live/api/status</code> every 5 minutes. It returns HTTP 503 on an outage. Visiting any status check also alerts your phone on down and recovery through your alert channels.
        </div>
      </Panel>
    </div>
  );
}

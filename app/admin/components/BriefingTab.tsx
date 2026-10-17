import React from "react";
import { AlertTriangle, CheckCircle2, Info, ArrowRight } from "lucide-react";
import type { Briefing } from "@/lib/adminBriefing";
import { C, Panel, Sparkline, Delta } from "./ui";
import { AILoadCard } from "./AILoadCard";
import { TodayQualityCard } from "./TodayQualityCard";

const SEV = { critical: C.red, warning: C.amber, info: C.t3 } as const;
const ago = (s: string) => { const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };

function SignupsChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96 }}>
        {data.map((d, i) => (
          <div key={d.date} title={`${d.date}: ${d.count}`} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end" }}>
            <div className="adm-bar" style={{ width: "100%", height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, background: d.count ? C.a : C.b2, borderRadius: 2, animationDelay: `${i * 12}ms` }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.t4, marginTop: 6 }}><span>30 days ago</span><span>Today</span></div>
    </div>
  );
}

export function BriefingTab({ b, funnel, onTab }: { b: Briefing; funnel: { step: string; label: string; count: number; drop_pct: number | null }[]; onTab: (t: string) => void }) {
  const fMax = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="adm-kpis">
        {b.kpis.map((k, i) => (
          <div key={k.key} className="adm-rise" style={{ animationDelay: `${i * 40}ms`, background: C.bg2, border: `1px solid ${C.b}`, borderRadius: C.rLg, padding: "12px 14px", minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{k.value}</div>
              <Sparkline data={k.spark} />
            </div>
            <div style={{ marginTop: 8 }}><Delta v={k.delta} label={k.deltaLabel} /></div>
          </div>
        ))}
      </div>

      <Panel title="Needs attention" right={<span style={{ fontSize: 11, color: C.t3 }}>{b.attention.length ? `${b.attention.length} item${b.attention.length > 1 ? "s" : ""}` : "all clear"}</span>}>
        {b.attention.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.t2 }}><CheckCircle2 size={15} color={C.a} /> Nothing needs you right now.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {b.attention.map((a, i) => {
              const Icon = a.severity === "info" ? Info : AlertTriangle;
              return (
                <button key={a.id} onClick={() => a.tab && onTab(a.tab)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", border: 0, borderTop: i ? `1px solid ${C.b}` : "none", background: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: a.tab ? "pointer" : "default" }}>
                  <Icon size={14} color={SEV[a.severity]} style={{ flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                    <span style={{ display: "block", fontSize: 12, color: C.t3 }}>{a.detail}</span>
                  </span>
                  {a.tab && <ArrowRight size={13} color={C.t4} />}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <AILoadCard />

      <TodayQualityCard />

      <div className="adm-two">
        <Panel title="Signups, last 30 days" right={<span style={{ fontSize: 11, color: C.t3 }}>{b.totals.users} total</span>}>
          <SignupsChart data={b.signups30} />
        </Panel>
        <Panel title="Latest signups" right={<button onClick={() => onTab("signups")} style={{ border: 0, background: "none", color: C.a, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>All →</button>}>
          {b.recent.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>No signups yet.</div>}
          {b.recent.slice(0, 6).map((u, i) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: i ? `1px solid ${C.b}` : "none", fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.activated ? C.a : C.t4, flexShrink: 0 }} title={u.activated ? "Created a project" : "No project yet"} />
              <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
              <span style={{ color: C.t3, whiteSpace: "nowrap" }}>{ago(u.created_at)}</span>
            </div>
          ))}
        </Panel>
      </div>

      {funnel.length > 0 && (
        <Panel title="Activation funnel">
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {funnel.map((f, i) => (
              <div key={f.step} style={{ display: "grid", gridTemplateColumns: "minmax(70px,120px) minmax(0,1fr) 76px", alignItems: "center", gap: 10, fontSize: 12 }}>
                <span style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                <div style={{ height: 6, background: C.bg4, borderRadius: 3, overflow: "hidden" }}>
                  <div className="adm-rise" style={{ height: "100%", width: `${(f.count / fMax) * 100}%`, background: C.a, borderRadius: 3, animationDelay: `${i * 60}ms` }} />
                </div>
                <span style={{ textAlign: "right", color: C.t2 }}>{f.count}{f.drop_pct !== null && f.drop_pct > 0 ? <span style={{ color: C.red }}> −{f.drop_pct}%</span> : null}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

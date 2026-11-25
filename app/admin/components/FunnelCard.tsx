import React from "react";
import { C, Panel } from "./ui";

type Row = { source: string; visitors: number; signups: number; firstAction: number; returnEligible: number; returned: number };
type Report = { days: number; total: Row; bySource: Row[]; excludedAccounts: number; diagnosis: string; enoughData: boolean };

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

/** Where founders drop off: visitors, signups, first completed task, back within 7 days. QA left out. */
export function FunnelCard() {
  const [r, setR] = React.useState<Report | null>(null);
  const [note, setNote] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    fetch("/api/admin/funnel?days=30")
      .then((x) => (x.ok ? x.json() : Promise.reject()))
      .then((j) => { if (live) { setR(j.report); setNote(!j.excludeListSet); } })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);
  const th: React.CSSProperties = { textAlign: "right", fontSize: 11, color: C.t3, fontWeight: 500, padding: "4px 6px" };
  const td: React.CSSProperties = { textAlign: "right", fontSize: 12, color: C.t, padding: "5px 6px", borderTop: `1px solid ${C.b}`, whiteSpace: "nowrap" };
  return (
    <Panel title="Where founders drop off" right={r ? <span style={{ fontSize: 11, color: C.t3 }}>last {r.days} days · QA left out ({r.excludedAccounts})</span> : undefined}>
      {failed && <div style={{ fontSize: 12, color: C.t3 }}>Could not load the funnel.</div>}
      {!failed && !r && <div style={{ fontSize: 12, color: C.t3 }}>Loading…</div>}
      {r && (
        <>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>{r.diagnosis}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Source</th><th style={th}>Visitors</th><th style={th}>Signups</th><th style={th}>First task</th><th style={th}>Back in 7 days</th>
              </tr></thead>
              <tbody>
                {[r.total, ...r.bySource].map((x, i) => (
                  <tr key={x.source}>
                    <td style={{ ...td, textAlign: "left", fontWeight: i === 0 ? 600 : 400 }}>{x.source}</td>
                    <td style={td}>{x.visitors}</td>
                    <td style={td}>{x.signups} <span style={{ color: C.t3 }}>{pct(x.signups, x.visitors)}</span></td>
                    <td style={td}>{x.firstAction} <span style={{ color: C.t3 }}>{pct(x.firstAction, x.signups)}</span></td>
                    <td style={td}>{x.returned}/{x.returnEligible} <span style={{ color: C.t3 }}>{pct(x.returned, x.returnEligible)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>
            Visitors are distinct browsers that loaded the landing page after this tracking went live. Signups with no recorded source show as “unknown”.
            Back in 7 days only counts accounts at least 7 days old.
            {note && " FUNNEL_EXCLUDE_EMAILS is not set, so only admins and +qa addresses are left out."}
            {!r.enoughData && " Fewer than 20 signups, so treat the percentages as a first look."}
          </div>
        </>
      )}
    </Panel>
  );
}

import React from "react";
import { C, Panel } from "./ui";

type Slo = { key: string; label: string; value: number | null; target: number; direction: "max" | "min"; status: "ok" | "warn" | "breach" | "nodata"; detail: string };
type Resp = {
  days: number; overall: Slo["status"]; slos: Slo[]; byRule: Array<[string, number]>; pending: number;
  recent: Array<{ kind: string; rules: string[]; task: string | null; detail: string | null; at: string }>;
};
type Replay = {
  days: number;
  replay: { total: number; flagged: number; flaggedPct: number; byRule: Record<string, number>; flaggedAndRejected: number; flaggedButCompleted: number; rows: Array<{ at: string; task: string; outcome: string | null; rules: string[] }> };
};

const COLOR = { ok: C.a, warn: C.amber, breach: C.red, nodata: C.t4 } as const;
const WORD = { ok: "On target", warn: "Watch", breach: "Breached", nodata: "Not enough data" } as const;

export function TodayQualityCard() {
  const [d, setD] = React.useState<Resp | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [rp, setRp] = React.useState<Replay | null>(null);
  const [rpBusy, setRpBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetch("/api/admin/today-quality")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => live && setD(j))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  async function runReplay() {
    setRpBusy(true);
    try {
      const r = await fetch("/api/admin/today-quality?replay=1&days=21");
      if (r.ok) setRp(await r.json());
    } finally { setRpBusy(false); }
  }

  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.b}`, borderRadius: 6, color: C.t2, fontSize: 11, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" };

  return (
    <Panel
      title="Today quality"
      right={d ? <span style={{ fontSize: 11, fontWeight: 600, color: COLOR[d.overall] }}>{WORD[d.overall]}</span> : undefined}
    >
      {failed && <div style={{ fontSize: 12, color: C.t3 }}>Could not load Today quality. Apply migration 20261016000000.</div>}
      {!failed && !d && <div style={{ fontSize: 12, color: C.t3 }}>Loading…</div>}
      {d && (
        <>
          <div style={{ display: "grid", gap: 0 }}>
            {d.slos.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.b}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.t }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: C.t3, overflowWrap: "anywhere" }}>{s.detail}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLOR[s.status] }}>{s.value === null ? "–" : `${s.value}%`}</span>
                  <div style={{ fontSize: 10, color: C.t4 }}>{s.direction === "max" ? "≤" : "≥"} {s.target}%</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Last {d.days} days · {d.pending} tasks awaiting an outcome</div>

          {d.byRule.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 4 }}>Guard rejections by rule</div>
              {d.byRule.map(([rule, n]) => (
                <div key={rule} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.t2 }}>
                  <span>{rule}</span><span>{n}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" style={btn} disabled={rpBusy} onClick={() => void runReplay()}>
              {rpBusy ? "Replaying…" : "Replay last 21 days"}
            </button>
            <span style={{ fontSize: 11, color: C.t4 }}>Runs past tasks through today's guards</span>
          </div>

          {rp && (
            <div style={{ marginTop: 10, fontSize: 12, color: C.t2 }}>
              <div>
                {rp.replay.flagged} of {rp.replay.total} past tasks would be blocked ({rp.replay.flaggedPct}%).{" "}
                {rp.replay.flaggedAndRejected} were ignored or replaced by the founder; {rp.replay.flaggedButCompleted} were completed (review for false positives).
              </div>
              {rp.replay.rows.slice(0, 8).map((r, i) => (
                <div key={i} style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.b}` }}>
                  <div style={{ color: C.t, overflowWrap: "anywhere" }}>{r.task.slice(0, 140)}</div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{r.rules.join(", ")} · {r.outcome ?? "pending"}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

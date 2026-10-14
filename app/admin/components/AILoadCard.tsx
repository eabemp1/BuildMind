import React from "react";
import { C, Panel } from "./ui";
import type { AILoad } from "@/lib/server/aiBudget";

type Resp = { ceiling: number; load: AILoad | null };

const TIERS: Array<{ key: "paid" | "trial" | "free" | "public"; label: string; color: string }> = [
  { key: "paid", label: "Paid", color: C.a },
  { key: "trial", label: "Trial", color: C.amber },
  { key: "free", label: "Free", color: C.t3 },
  { key: "public", label: "/break", color: C.t4 },
];

const STATUS = {
  ok: { text: "Healthy", color: C.a },
  degrading: { text: "Pausing free + public", color: C.amber },
  shedding: { text: "Pausing trials too", color: C.red },
  unknown: { text: "Guard off", color: C.t3 },
} as const;

export function AILoadCard() {
  const [d, setD] = React.useState<Resp | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/admin/ai-load")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => live && (setD(j), setFailed(false)))
        .catch(() => live && setFailed(true));
    load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const l = d?.load;
  const s = l ? STATUS[l.status] : null;

  return (
    <Panel
      title="AI load today"
      right={s ? <span style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.text}</span> : undefined}
    >
      {failed && <div style={{ fontSize: 12, color: C.t3 }}>Could not load AI usage.</div>}
      {!failed && !d && <div style={{ fontSize: 12, color: C.t3 }}>Loading…</div>}
      {d && !l && (
        <div style={{ fontSize: 12, color: C.t3 }}>
          No counter yet. Apply migration 20261014040000 to start tracking daily AI calls.
        </div>
      )}
      {l && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{l.total.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: C.t3 }}>
              {l.ceiling > 0 ? `of ${l.ceiling.toLocaleString()} calls (${l.pct}%)` : "calls, no ceiling set"}
            </span>
          </div>
          <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: C.bg4, margin: "10px 0 8px" }}>
            {TIERS.map((t) => {
              const base = l.ceiling > 0 ? l.ceiling : Math.max(l.total, 1);
              const w = Math.min(100, (l.buckets[t.key] / base) * 100);
              return <div key={t.key} title={`${t.label}: ${l.buckets[t.key]}`} style={{ width: `${w}%`, background: t.color, transition: "width .4s ease" }} />;
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11, color: C.t3 }}>
            {TIERS.map((t) => (
              <span key={t.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: t.color }} />
                {t.label} {l.buckets[t.key].toLocaleString()}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
            Free pauses at 70% of the ceiling, trials at 85%. Paid users are never paused. Set AI_DAILY_CEILING to match what your providers can serve.
          </div>
        </>
      )}
    </Panel>
  );
}

import React from "react";
import type { VisualPanel, VisualSpec, VisualTone } from "@/lib/visuals/spec";
import { clampNum } from "@/lib/visuals/spec";

/**
 * components/visuals/VisualBoard.tsx
 *
 * Draws a VisualSpec. No hooks, no animation library, no browser APIs: it
 * renders identically in the app, in the side pane, and server-side into the
 * exported HTML report. Colours come from the app's --bm-* tokens, each with
 * a concrete fallback so the export looks right with no stylesheet.
 */

const C = {
  bg: "var(--bm-bg, #0e0f12)", card: "var(--bm-bg2, #15161b)", card2: "var(--bm-bg3, #1b1d24)", track: "var(--bm-bg4, #262933)",
  border: "var(--bm-border, #2a2d37)", text: "var(--bm-text, #ecebe6)", text2: "var(--bm-text2, #c4c2b8)", text3: "var(--bm-text3, #8f8d82)",
  green: "var(--bm-green, #4ade80)", amber: "var(--bm-amber, #f5a524)", red: "var(--bm-red, #f87171)", accent: "var(--bm-accent, #d4af37)",
};
const TONE: Record<VisualTone, string> = { good: C.green, warn: C.amber, bad: C.red, accent: C.accent, neutral: C.text3 };
const SEV: Record<string, string> = { critical: C.red, high: C.amber, medium: C.accent, low: C.text3 };
const mono = "'DM Mono', ui-monospace, monospace";
const display = "'Syne', 'Inter', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, breakInside: "avoid" };

function Head({ title, caption }: { title?: string; caption?: string }) {
  if (!title && !caption) return null;
  return (
    <div>
      {title && <p style={{ margin: 0, fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text3 }}>{title}</p>}
      {caption && <p style={{ margin: "4px 0 0", fontFamily: body, fontSize: 12.5, lineHeight: 1.5, color: C.text3 }}>{caption}</p>}
    </div>
  );
}

const fmt = (n: number, unit = "") => `${Math.round(n * 10) / 10}${unit}`;

function Stats({ p }: { p: Extract<VisualPanel, { type: "stats" }> }) {
  return (
    <div style={{ ...card, gridColumn: "1 / -1" }}>
      <Head title={p.title} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {p.items.map((s) => (
          <div key={s.label} style={{ background: C.card2, border: `1px solid ${C.border}`, borderTop: `3px solid ${TONE[s.tone ?? "neutral"]}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontFamily: display, fontSize: 26, fontWeight: 700, lineHeight: 1, color: C.text }}>{s.value}</div>
            <div style={{ marginTop: 6, fontFamily: body, fontSize: 12, color: C.text2 }}>{s.label}</div>
            {s.sub && <div style={{ marginTop: 2, fontFamily: body, fontSize: 11, color: C.text3 }}>{s.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Gauge({ p }: { p: Extract<VisualPanel, { type: "gauge" }> }) {
  const max = p.max ?? 100;
  const v = clampNum(p.value, 0, max);
  const frac = max ? v / max : 0;
  const r = 70, cx = 90, cy = 90;
  const arc = (f: number) => {
    const a = Math.PI * (1 - f);
    return `${cx + r * Math.cos(a)},${cy - r * Math.sin(a)}`;
  };
  const tone = TONE[p.tone ?? (frac >= 0.7 ? "good" : frac >= 0.4 ? "warn" : "bad")];
  return (
    <div style={card}>
      <Head title={p.title} />
      <svg viewBox="0 0 180 112" width="100%" style={{ maxWidth: 240, alignSelf: "center" }} role="img" aria-label={`${p.title}: ${fmt(v)} of ${max}`}>
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke={C.track} strokeWidth={14} strokeLinecap="round" />
        {frac > 0.001 && <path d={`M ${cx - r},${cy} A ${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${arc(frac)}`} fill="none" stroke={tone} strokeWidth={14} strokeLinecap="round" />}
        <text x={cx} y={cy - 8} textAnchor="middle" fontFamily={display} fontSize={34} fontWeight={700} fill={C.text}>{fmt(v)}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontFamily={body} fontSize={11} fill={C.text3}>{p.label ?? `of ${max}`}</text>
      </svg>
      {p.caption && <p style={{ margin: 0, textAlign: "center", fontFamily: body, fontSize: 12.5, color: C.text3 }}>{p.caption}</p>}
    </div>
  );
}

function Bars({ p }: { p: Extract<VisualPanel, { type: "bars" }> }) {
  return (
    <div style={card}>
      <Head title={p.title} caption={p.caption} />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {p.items.map((it) => {
          const max = it.max ?? 100;
          const w = max ? clampNum((it.value / max) * 100, 0, 100) : 0;
          return (
            <div key={it.label}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: body, fontSize: 12.5, color: C.text2 }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{it.label}</span>
                <span style={{ fontFamily: mono, color: C.text, flexShrink: 0 }}>{fmt(it.value, p.unit)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: C.track, marginTop: 5, overflow: "hidden" }}>
                <div style={{ width: `${w}%`, height: "100%", borderRadius: 99, background: TONE[it.tone ?? "accent"] }} />
              </div>
              {it.note && <div style={{ marginTop: 3, fontFamily: body, fontSize: 11.5, color: C.text3 }}>{it.note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Line({ p, idx }: { p: Extract<VisualPanel, { type: "line" }>; idx: number }) {
  const pts = p.points;
  const W = 520, H = 170, L = 34, R = 10, T = 12, B = 24;
  if (pts.length < 2) {
    return <div style={{ ...card, gridColumn: "span 2" }}><Head title={p.title} caption={p.caption} /><p style={{ margin: 0, fontFamily: body, fontSize: 13, color: C.text3 }}>Not enough history yet to draw a trend. It appears after a few days of data.</p></div>;
  }
  const vals = pts.map((x) => x.value);
  const lo = p.min ?? Math.min(...vals), hi = p.max ?? Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);
  const line = pts.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(q.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const delta = last.value - first.value;
  const gid = `bvl${idx}`;
  return (
    <div style={{ ...card, gridColumn: "span 2" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <Head title={p.title} caption={p.caption} />
        <span style={{ fontFamily: mono, fontSize: 12, color: delta >= 0 ? C.green : C.red, flexShrink: 0 }}>{delta >= 0 ? "+" : ""}{fmt(delta, p.unit)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${p.title}, from ${fmt(first.value)} to ${fmt(last.value)}`}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d4af37" stopOpacity="0.28" /><stop offset="100%" stopColor="#d4af37" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map((f) => {
          const gy = T + f * (H - T - B);
          return <g key={f}><line x1={L} x2={W - R} y1={gy} y2={gy} stroke={C.border} strokeDasharray="3 4" /><text x={L - 6} y={gy + 3.5} textAnchor="end" fontFamily={mono} fontSize={9.5} fill={C.text3}>{Math.round(hi - f * span)}</text></g>;
        })}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={C.accent} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((q, i) => (pts.length <= 31 ? <circle key={i} cx={x(i)} cy={y(q.value)} r={i === pts.length - 1 ? 4.5 : 2.2} fill={i === pts.length - 1 ? C.accent : C.card}  stroke={C.accent} strokeWidth={1.4}><title>{`${q.label}: ${fmt(q.value, p.unit)}`}</title></circle> : null))}
        <text x={L} y={H - 6} fontFamily={mono} fontSize={9.5} fill={C.text3}>{first.label}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontFamily={mono} fontSize={9.5} fill={C.text3}>{last.label}</text>
      </svg>
    </div>
  );
}

function Radar({ p }: { p: Extract<VisualPanel, { type: "radar" }> }) {
  const n = p.axes.length;
  if (n < 3) return null;
  const S = 260, cx = S / 2, cy = S / 2, R = 88;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, f: number) => `${(cx + R * f * Math.cos(ang(i))).toFixed(1)},${(cy + R * f * Math.sin(ang(i))).toFixed(1)}`;
  const data = p.axes.map((a, i) => pt(i, clampNum(a.value / (a.max ?? 100), 0, 1))).join(" ");
  return (
    <div style={card}>
      <Head title={p.title} caption={p.caption} />
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 300, alignSelf: "center", overflow: "visible" }} role="img" aria-label={p.title}>
        {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={p.axes.map((_, i) => pt(i, f)).join(" ")} fill="none" stroke={C.border} />)}
        {p.axes.map((_, i) => <line key={i} x1={cx} y1={cy} x2={pt(i, 1).split(",")[0]} y2={pt(i, 1).split(",")[1]} stroke={C.border} />)}
        <polygon points={data} fill="#d4af37" fillOpacity={0.22} stroke={C.accent} strokeWidth={2} strokeLinejoin="round" />
        {p.axes.map((a, i) => {
          const lx = cx + (R + 22) * Math.cos(ang(i)), ly = cy + (R + 22) * Math.sin(ang(i));
          const anchor = Math.abs(Math.cos(ang(i))) < 0.2 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end";
          return (
            <g key={a.label}>
              <circle cx={pt(i, clampNum(a.value / (a.max ?? 100), 0, 1)).split(",")[0]} cy={pt(i, clampNum(a.value / (a.max ?? 100), 0, 1)).split(",")[1]} r={3.5} fill={C.accent} />
              <text x={lx} y={ly + 3} textAnchor={anchor} fontFamily={body} fontSize={10.5} fill={C.text2}>{a.label} {Math.round(a.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Heat({ p }: { p: Extract<VisualPanel, { type: "heat" }> }) {
  const cols = p.columns ?? 7;
  return (
    <div style={{ ...card, gridColumn: "span 2" }}>
      <Head title={p.title} caption={p.caption} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 5 }}>
        {p.cells.map((c, i) => (
          <div key={i} title={`${c.label}${c.note ? `: ${c.note}` : ""}`}
            style={{ aspectRatio: "1 / 1", borderRadius: 6, background: c.value > 0 ? `color-mix(in srgb, ${C.accent} ${Math.round(18 + clampNum(c.value, 0, 1) * 82)}%, ${C.card2})` : C.card2, border: `1px solid ${C.border}`, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 9.5, color: c.value > 0.55 ? "var(--bm-text-inv, #15130a)" : C.text3 }}>
            {c.label.slice(-2)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Signals({ p }: { p: Extract<VisualPanel, { type: "signals" }> }) {
  return (
    <div style={{ ...card, gridColumn: "span 2" }}>
      <Head title={p.title} caption={p.caption} />
      {p.items.length === 0 && <p style={{ margin: 0, fontFamily: body, fontSize: 13, color: C.text3 }}>No active signals right now.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {p.items.map((s) => (
          <div key={s.label} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) 86px", gap: 12, alignItems: "center", background: C.card2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${SEV[s.severity]}`, borderRadius: 10, padding: "10px 12px" }}>
            <span style={{ fontFamily: mono, fontSize: 10.5, textTransform: "uppercase", color: SEV[s.severity] }}>{s.severity}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: body, fontSize: 13.5, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{s.label}</div>
              {s.note && <div style={{ fontFamily: body, fontSize: 12, color: C.text3, marginTop: 2 }}>{s.note}</div>}
            </div>
            {typeof s.confidence === "number" && (
              <div title={`Confidence ${Math.round(s.confidence * 100)}%`}>
                <div style={{ height: 5, borderRadius: 99, background: C.track, overflow: "hidden" }}><div style={{ width: `${clampNum(s.confidence, 0, 1) * 100}%`, height: "100%", background: SEV[s.severity] }} /></div>
                <div style={{ marginTop: 3, textAlign: "right", fontFamily: mono, fontSize: 10, color: C.text3 }}>{Math.round(s.confidence * 100)}% sure</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tree({ p }: { p: Extract<VisualPanel, { type: "tree" }> }) {
  return (
    <div style={{ ...card, gridColumn: "span 2" }}>
      <Head title={p.title} caption={p.caption} />
      <div style={{ fontFamily: display, fontSize: 14, fontWeight: 700, color: C.text, display: "flex", gap: 8, alignItems: "center" }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: C.accent }} />{p.root}
      </div>
      <div style={{ marginLeft: 4, borderLeft: `2px solid ${C.border}`, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {p.branches.map((b) => (
          <div key={b.label} style={{ position: "relative" }}>
            <span aria-hidden style={{ position: "absolute", left: -16, top: 14, width: 14, borderTop: `2px solid ${C.border}` }} />
            <div style={{ background: C.card2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${TONE[b.tone ?? "accent"]}`, borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontFamily: body, fontSize: 13.5, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{b.label}</div>
              {b.note && <div style={{ fontFamily: body, fontSize: 12, color: C.text3, marginTop: 2 }}>{b.note}</div>}
            </div>
            {b.children && b.children.length > 0 && (
              <div style={{ marginLeft: 14, marginTop: 6, borderLeft: `2px solid ${C.border}`, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {b.children.map((c) => (
                  <div key={c.label} style={{ position: "relative", fontFamily: body, fontSize: 12.5, color: C.text2 }}>
                    <span aria-hidden style={{ position: "absolute", left: -14, top: 9, width: 12, borderTop: `2px solid ${C.border}` }} />
                    {c.label}{c.note && <span style={{ color: C.text3 }}> · {c.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Callout({ p }: { p: Extract<VisualPanel, { type: "callout" }> }) {
  const t = TONE[p.tone ?? "accent"];
  return (
    <div style={{ ...card, gridColumn: "1 / -1", borderColor: t, background: `color-mix(in srgb, ${t} 8%, ${C.card})` }}>
      {p.title && <p style={{ margin: 0, fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: t }}>{p.title}</p>}
      <p style={{ margin: 0, fontFamily: body, fontSize: 14, lineHeight: 1.6, color: C.text }}>{p.text}</p>
    </div>
  );
}

export function VisualBoard({ spec, showHeader = true }: { spec: VisualSpec; showHeader?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: body, color: C.text }}>
      {showHeader && (
        <div>
          <h2 style={{ margin: 0, fontFamily: display, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: C.text }}>{spec.title}</h2>
          {(spec.subtitle || spec.generatedAt) && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.text3 }}>{[spec.subtitle, spec.generatedAt && `Generated ${new Date(spec.generatedAt).toUTCString().replace(" GMT", " UTC")}`].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 290px), 1fr))" }}>
        {spec.panels.map((p, i) => {
          switch (p.type) {
            case "stats": return <Stats key={i} p={p} />;
            case "gauge": return <Gauge key={i} p={p} />;
            case "bars": return <Bars key={i} p={p} />;
            case "line": return <Line key={i} p={p} idx={i} />;
            case "radar": return <Radar key={i} p={p} />;
            case "heat": return <Heat key={i} p={p} />;
            case "signals": return <Signals key={i} p={p} />;
            case "tree": return <Tree key={i} p={p} />;
            case "callout": return <Callout key={i} p={p} />;
          }
        })}
      </div>
    </div>
  );
}

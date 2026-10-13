import React from "react";
import type { VisualPanel, VisualSpec, VisualTone } from "@/lib/visuals/spec";
import { clampNum } from "@/lib/visuals/spec";

/**
 * components/visuals/VisualBoard.tsx
 *
 * Draws a VisualSpec. Hook-free, so it renders the same in the app, the side
 * pane, and server-side into the exported HTML report. Flat, compact panels:
 * no glow, no gradients, no tinted fills. Motion is CSS-only (bars grow, arcs
 * and lines draw, cells fade in, staggered) and switches itself off for
 * prefers-reduced-motion and print. Panels never force a minimum width wider
 * than their container: the grid is auto-fill and "wide" panels take a full
 * row, so nothing can overflow a narrow pane.
 */

const C = {
  card: "var(--bm-bg2, #15161b)", card2: "var(--bm-bg3, #1b1d24)", track: "var(--bm-bg4, #262933)",
  border: "var(--bm-border, #2a2d37)", text: "var(--bm-text, #ecebe6)", text2: "var(--bm-text2, #c4c2b8)", text3: "var(--bm-text3, #8f8d82)",
  green: "var(--bm-green, #4ade80)", amber: "var(--bm-amber, #f5a524)", red: "var(--bm-red, #f87171)", accent: "var(--bm-accent, #d4af37)",
};
const TONE: Record<VisualTone, string> = { good: C.green, warn: C.amber, bad: C.red, accent: C.accent, neutral: C.text3 };
const SEV: Record<string, string> = { critical: C.red, high: C.amber, medium: C.accent, low: C.text3 };
const mono = "'DM Mono', ui-monospace, monospace";
const display = "'Syne', 'Inter', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";

const CSS = `
.vb{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));font-family:${body};color:${C.text};min-width:0}
.vb *{box-sizing:border-box}
.vb-p{background:${C.card};border:1px solid ${C.border};border-radius:10px;padding:12px;min-width:0;display:flex;flex-direction:column;gap:10px;break-inside:avoid}
.vb-w{grid-column:1/-1}
.vb-h{margin:0;font-family:${mono};font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:${C.text3};line-height:1.3}
.vb-c{margin:3px 0 0;font-size:11.5px;line-height:1.45;color:${C.text3}}
.vb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:0;border:1px solid ${C.border};border-radius:10px;background:${C.card};overflow:hidden}
.vb-stat{padding:10px 12px;min-width:0;border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};margin:0 -1px -1px 0}
.vb-stat b{display:block;font-family:${display};font-size:18px;font-weight:600;line-height:1.1;color:${C.text};overflow-wrap:anywhere}
.vb-stat span{display:block;margin-top:4px;font-size:11px;line-height:1.3;color:${C.text3}}
.vb-stat i{display:block;width:14px;height:2px;margin-top:6px;border-radius:2px}
.vb-row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:${C.text2}}
.vb-row span:first-child{min-width:0;overflow-wrap:anywhere}
.vb-row span:last-child{font-family:${mono};color:${C.text};flex-shrink:0}
.vb-bar{height:4px;border-radius:2px;background:${C.track};margin-top:5px;overflow:hidden}
.vb-bar>div{height:100%;border-radius:2px;transform-origin:left center;animation:vbGrow .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*60ms)}
.vb-item:hover .vb-bar>div{filter:brightness(1.15)}
.vb-note{margin-top:3px;font-size:11px;color:${C.text3}}
.vb-draw{stroke-dasharray:100;stroke-dashoffset:0;animation:vbDraw 1s ease-out both}
.vb-arc{animation:vbArc .9s cubic-bezier(.2,.7,.2,1) both}
.vb-pop{animation:vbPop .45s ease-out both;animation-delay:calc(var(--i,0)*25ms)}
.vb-rad{transform-origin:center;transform-box:fill-box;animation:vbScale .7s cubic-bezier(.2,.7,.2,1) both}
.vb-sev{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid ${C.border};font-size:12px}
.vb-sev:first-of-type{border-top:0;padding-top:0}
.vb-t{border-left:1px solid ${C.border};margin-left:3px;padding-left:12px;display:flex;flex-direction:column;gap:8px}
.vb-tb{position:relative;font-size:12px;color:${C.text}}
.vb-tb:before{content:"";position:absolute;left:-12px;top:8px;width:9px;border-top:1px solid ${C.border}}
@keyframes vbGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes vbDraw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes vbArc{from{stroke-dasharray:0 100}}
@keyframes vbPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes vbScale{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce),print{.vb *{animation:none!important}}
`;

function Head({ title, caption }: { title?: string; caption?: string }) {
  if (!title && !caption) return null;
  return <div>{title && <p className="vb-h">{title}</p>}{caption && <p className="vb-c">{caption}</p>}</div>;
}

const fmt = (n: number, unit = "") => `${Math.round(n * 10) / 10}${unit}`;

function Stats({ p }: { p: Extract<VisualPanel, { type: "stats" }> }) {
  return (
    <div className="vb-w">
      {p.title && <p className="vb-h" style={{ marginBottom: 6 }}>{p.title}</p>}
      <div className="vb-stats">
        {p.items.map((s) => (
          <div className="vb-stat" key={s.label}>
            <b>{s.value}</b>
            <span>{s.label}{s.sub ? ` · ${s.sub}` : ""}</span>
            {s.tone && s.tone !== "neutral" && <i style={{ background: TONE[s.tone] }} />}
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
  const tone = TONE[p.tone ?? (frac >= 0.7 ? "good" : frac >= 0.4 ? "warn" : "bad")];
  const arc = "M 14,76 A 56,56 0 0 1 126,76";
  return (
    <div className="vb-p">
      <Head title={p.title} />
      <svg viewBox="0 0 140 92" width="100%" style={{ maxWidth: 150, alignSelf: "center" }} role="img" aria-label={`${p.title}: ${fmt(v)} of ${max}`}>
        <path d={arc} fill="none" stroke={C.track} strokeWidth={7} strokeLinecap="round" />
        {frac > 0.001 && <path className="vb-arc" pathLength={100} d={arc} fill="none" stroke={tone} strokeWidth={7} strokeLinecap="round" style={{ strokeDasharray: `${(frac * 100).toFixed(1)} 100` }} />}
        <text x={70} y={64} textAnchor="middle" fontFamily={display} fontSize={22} fontWeight={600} fill={C.text}>{fmt(v)}</text>
        {(p.label ?? `of ${max}`).length <= 14 && <text x={70} y={80} textAnchor="middle" fontFamily={body} fontSize={9.5} fill={C.text3}>{p.label ?? `of ${max}`}</text>}
      </svg>
      {(p.caption || (p.label && p.label.length > 14)) && <p className="vb-c" style={{ margin: 0, textAlign: "center" }}>{[p.label && p.label.length > 14 ? p.label : null, p.caption].filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

function Bars({ p }: { p: Extract<VisualPanel, { type: "bars" }> }) {
  return (
    <div className="vb-p">
      <Head title={p.title} caption={p.caption} />
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {p.items.map((it, i) => {
          const max = it.max ?? 100;
          const w = max ? clampNum((it.value / max) * 100, 0, 100) : 0;
          return (
            <div className="vb-item" key={it.label + i}>
              <div className="vb-row"><span>{it.label}</span><span>{fmt(it.value, p.unit)}</span></div>
              <div className="vb-bar"><div style={{ width: `${w}%`, background: TONE[it.tone ?? "accent"], ["--i" as string]: i }} /></div>
              {it.note && <div className="vb-note">{it.note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Line({ p }: { p: Extract<VisualPanel, { type: "line" }> }) {
  const pts = p.points;
  const W = 400, H = 110, L = 26, R = 8, T = 8, B = 18;
  if (pts.length < 2) {
    return <div className="vb-p vb-w"><Head title={p.title} caption={p.caption} /><p className="vb-c" style={{ margin: 0 }}>Not enough history yet to draw a trend.</p></div>;
  }
  const vals = pts.map((x) => x.value);
  const lo = p.min ?? Math.min(...vals), hi = p.max ?? Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);
  const line = pts.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(q.value).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1], first = pts[0];
  const delta = last.value - first.value;
  return (
    <div className="vb-p vb-w">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Head title={p.title} caption={p.caption} />
        <span style={{ fontFamily: mono, fontSize: 11, color: delta >= 0 ? C.green : C.red, flexShrink: 0 }}>{delta >= 0 ? "+" : ""}{fmt(delta, p.unit)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 520 }} role="img" aria-label={`${p.title}, from ${fmt(first.value)} to ${fmt(last.value)}`}>
        {[0, 1].map((f) => {
          const gy = T + f * (H - T - B);
          return <g key={f}><line x1={L} x2={W - R} y1={gy} y2={gy} stroke={C.border} /><text x={L - 5} y={gy + 3} textAnchor="end" fontFamily={mono} fontSize={8.5} fill={C.text3}>{Math.round(hi - f * span)}</text></g>;
        })}
        <path className="vb-draw" pathLength={100} d={line} fill="none" stroke={C.accent} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        {pts.length <= 31 && pts.map((q, i) => (
          <circle key={i} className="vb-pop" style={{ ["--i" as string]: i }} cx={x(i)} cy={y(q.value)} r={i === pts.length - 1 ? 3 : 1.6} fill={i === pts.length - 1 ? C.accent : C.card} stroke={C.accent} strokeWidth={1}><title>{`${q.label}: ${fmt(q.value, p.unit)}`}</title></circle>
        ))}
        <text x={L} y={H - 4} fontFamily={mono} fontSize={8.5} fill={C.text3}>{first.label}</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontFamily={mono} fontSize={8.5} fill={C.text3}>{last.label}</text>
      </svg>
    </div>
  );
}

function Radar({ p }: { p: Extract<VisualPanel, { type: "radar" }> }) {
  const n = p.axes.length;
  if (n < 3) return null;
  const S = 240, cx = S / 2, cy = S / 2, R = 70;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const xy = (i: number, f: number): [number, number] => [cx + R * f * Math.cos(ang(i)), cy + R * f * Math.sin(ang(i))];
  const pt = (i: number, f: number) => xy(i, f).map((v) => v.toFixed(1)).join(",");
  const data = p.axes.map((a, i) => pt(i, clampNum(a.value / (a.max ?? 100), 0, 1))).join(" ");
  return (
    <div className="vb-p">
      <Head title={p.title} caption={p.caption} />
      <svg viewBox={`-40 0 ${S + 80} ${S}`} width="100%" style={{ maxWidth: 300, alignSelf: "center" }} role="img" aria-label={p.title}>
        {[0.5, 1].map((f) => <polygon key={f} points={p.axes.map((_, i) => pt(i, f)).join(" ")} fill="none" stroke={C.border} />)}
        {p.axes.map((_, i) => { const [x2, y2] = xy(i, 1); return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke={C.border} />; })}
        <polygon className="vb-rad" points={data} fill={C.accent} fillOpacity={0.1} stroke={C.accent} strokeWidth={1.5} strokeLinejoin="round" />
        {p.axes.map((a, i) => {
          const f = clampNum(a.value / (a.max ?? 100), 0, 1);
          const [dx, dy] = xy(i, f);
          const lx = cx + (R + 14) * Math.cos(ang(i)), ly = cy + (R + 14) * Math.sin(ang(i));
          const anchor = Math.abs(Math.cos(ang(i))) < 0.2 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end";
          return (
            <g key={a.label + i}>
              <circle className="vb-pop" style={{ ["--i" as string]: i + 6 }} cx={dx} cy={dy} r={2.6} fill={C.accent} />
              <text x={lx} y={ly + 3} textAnchor={anchor} fontFamily={body} fontSize={9.5} fill={C.text2}>{a.label}</text>
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
    <div className="vb-p vb-w">
      <Head title={p.title} caption={p.caption} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 3, maxWidth: 360 }}>
        {p.cells.map((c, i) => (
          <div key={i} className="vb-pop" title={`${c.label}${c.note ? `: ${c.note}` : ""}`}
            style={{ ["--i" as string]: i, aspectRatio: "1 / 1", borderRadius: 3, background: c.value > 0 ? `color-mix(in srgb, ${C.accent} ${Math.round(25 + clampNum(c.value, 0, 1) * 75)}%, ${C.card2})` : C.card2 }} />
        ))}
      </div>
    </div>
  );
}

function Signals({ p }: { p: Extract<VisualPanel, { type: "signals" }> }) {
  return (
    <div className="vb-p vb-w">
      <Head title={p.title} caption={p.caption} />
      {p.items.length === 0 && <p className="vb-c" style={{ margin: 0 }}>No active signals right now.</p>}
      <div>
        {p.items.map((s, i) => (
          <div className="vb-sev" key={s.label + i}>
            <span title={s.severity} style={{ width: 8, height: 8, borderRadius: 4, background: SEV[s.severity] }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{s.label}</div>
              {s.note && <div className="vb-note">{s.note}</div>}
            </div>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.text3, textAlign: "right" }}>{s.severity}{typeof s.confidence === "number" ? ` · ${Math.round(s.confidence * 100)}%` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tree({ p }: { p: Extract<VisualPanel, { type: "tree" }> }) {
  return (
    <div className="vb-p vb-w">
      <Head title={p.title} caption={p.caption} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{p.root}</div>
      <div className="vb-t">
        {p.branches.map((b, i) => (
          <div className="vb-tb" key={b.label + i}>
            <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: TONE[b.tone ?? "accent"], marginRight: 7 }} />
            <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{b.label}</span>
            {b.note && <span style={{ color: C.text3 }}> · {b.note}</span>}
            {b.children && b.children.length > 0 && (
              <div className="vb-t" style={{ marginTop: 6 }}>
                {b.children.map((c, j) => (
                  <div className="vb-tb" key={c.label + j} style={{ color: C.text2 }}>{c.label}{c.note && <span style={{ color: C.text3 }}> · {c.note}</span>}</div>
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
    <div className="vb-p vb-w" style={{ borderLeft: `3px solid ${t}`, borderRadius: 6, gap: 4 }}>
      {p.title && <p className="vb-h" style={{ color: t }}>{p.title}</p>}
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: C.text2 }}>{p.text}</p>
    </div>
  );
}

export function VisualBoard({ spec, showHeader = true }: { spec: VisualSpec; showHeader?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <style>{CSS}</style>
      {showHeader && (
        <div>
          <h2 style={{ margin: 0, fontFamily: display, fontSize: 16, fontWeight: 600, color: C.text }}>{spec.title}</h2>
          {(spec.subtitle || spec.generatedAt) && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: C.text3 }}>{[spec.subtitle, spec.generatedAt && `Generated ${new Date(spec.generatedAt).toUTCString().replace(" GMT", " UTC")}`].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
      <div className="vb">
        {spec.panels.map((p, i) => {
          switch (p.type) {
            case "stats": return <Stats key={i} p={p} />;
            case "gauge": return <Gauge key={i} p={p} />;
            case "bars": return <Bars key={i} p={p} />;
            case "line": return <Line key={i} p={p} />;
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

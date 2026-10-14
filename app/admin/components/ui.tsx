import React from "react";

export const C = {
  bg: "var(--bm-bg)", bg2: "var(--bm-bg2)", bg3: "var(--bm-bg3)", bg4: "var(--bm-bg4)",
  b: "var(--bm-border)", b2: "var(--bm-border2)",
  t: "var(--bm-text)", t2: "var(--bm-text2)", t3: "var(--bm-text3)", t4: "var(--bm-text4)",
  a: "var(--bm-accent)", ad: "var(--bm-accent-dim)", ab: "var(--bm-accent-bd)",
  amber: "var(--bm-amber)", red: "var(--bm-red)", teal: "var(--bm-teal)",
  rSm: "var(--r-sm)", rMd: "var(--r-md)", rLg: "var(--r-lg)",
};

/** Flat panel with a small uppercase title and optional right-hand action. */
export function Panel({ title, right, children, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: C.bg2, border: `1px solid ${C.b}`, borderRadius: C.rLg, padding: 16, minWidth: 0, ...style }}>
      {(title || right) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.t3 }}>{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Sparkline({ data, color = C.a, w = 84, h = 26 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <span style={{ width: w, height: h, display: "inline-block" }} />;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", maxWidth: "100%" }} aria-hidden>
      <polyline className="adm-draw" fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" points={pts} pathLength={1} />
    </svg>
  );
}

export function Delta({ v, label }: { v: number | null; label: string }) {
  if (v === null) return <span style={{ fontSize: 11, color: C.t3 }}>{label || "no change data"}</span>;
  const up = v > 0, flat = v === 0;
  return (
    <span style={{ fontSize: 11, color: flat ? C.t3 : up ? C.a : C.red, fontWeight: 600 }}>
      {flat ? "±0%" : `${up ? "▲" : "▼"} ${Math.abs(v)}%`} <span style={{ color: C.t3, fontWeight: 400 }}>{label}</span>
    </span>
  );
}

export const adminCss = `
@keyframes adm-spin { to { transform: rotate(360deg) } }
@keyframes adm-rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes adm-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes adm-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
@keyframes adm-pulse { 0% { box-shadow: 0 0 0 0 currentColor } 70% { box-shadow: 0 0 0 6px transparent } 100% { box-shadow: 0 0 0 0 transparent } }
.adm-rise { animation: adm-rise .35s ease-out both }
.adm-bar { transform-origin: bottom; animation: adm-grow .5s ease-out both }
.adm-draw { stroke-dasharray: 1; animation: adm-draw .8s ease-out both }
.adm-live { animation: adm-pulse 2s ease-out infinite }
.adm-shell { display: grid; grid-template-columns: 208px minmax(0,1fr); gap: 0; max-width: 1360px; margin: 0 auto }
.adm-side { position: sticky; top: 52px; align-self: start; height: calc(100vh - 52px); overflow-y: auto; padding: 16px 12px; border-right: 1px solid var(--bm-border) }
.adm-main { padding: 22px 24px 80px; min-width: 0 }
.adm-grp { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--bm-text4); margin: 14px 8px 6px }
.adm-grp:first-child { margin-top: 0 }
.adm-nav { display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--bm-text3); font: inherit; font-size: 13px; cursor: pointer; text-align: left; transition: background .15s, color .15s }
.adm-nav:hover { background: var(--bm-bg3); color: var(--bm-text2) }
.adm-nav[aria-current="page"] { background: var(--bm-bg3); color: var(--bm-text); font-weight: 600; box-shadow: inset 2px 0 0 var(--bm-accent) }
.adm-cnt { margin-left: auto; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: var(--bm-red); color: #fff }
.adm-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 10px }
.adm-two { display: grid; grid-template-columns: minmax(0,3fr) minmax(0,2fr); gap: 12px }
.adm-three { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px }
@media (max-width: 900px) { .adm-two { grid-template-columns: minmax(0,1fr) } }
@media (max-width: 820px) {
  .adm-shell { grid-template-columns: minmax(0,1fr) }
  .adm-side { position: static; height: auto; display: flex; gap: 4px; overflow-x: auto; padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--bm-border) }
  .adm-grp { display: none }
  .adm-nav { width: auto; flex-shrink: 0; white-space: nowrap }
  .adm-nav[aria-current="page"] { box-shadow: inset 0 -2px 0 var(--bm-accent) }
  .adm-main { padding: 16px 12px 60px }
}
@media (prefers-reduced-motion: reduce) { .adm-rise, .adm-bar, .adm-draw, .adm-live { animation: none } }
`;

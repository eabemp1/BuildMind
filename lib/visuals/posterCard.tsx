/**
 * lib/visuals/posterCard.tsx
 *
 * A PNG poster of a VisualSpec, for next/og (Satori): flexbox only, every
 * multi-child div declares display:flex, no CSS variables, no grid. It picks
 * the panels that read well as a single image (headline numbers, gauges,
 * a trend, bars, top signals, one callout) and leaves the rest to the HTML
 * report. Everything drawn is a field from the spec.
 */

import React from "react";
import type { VisualPanel, VisualSpec, VisualTone } from "./spec";
import { clampNum } from "./spec";

const P = { bg: "#0b0c0f", card: "#14161b", card2: "#1b1e25", track: "#262a33", line: "#2a2e38", text: "#f1efe8", text2: "#c3c1b6", text3: "#8c8a7f", accent: "#e0b93f", good: "#58d08a", warn: "#f2a93a", bad: "#f27d73" };
const T: Record<VisualTone, string> = { good: P.good, warn: P.warn, bad: P.bad, accent: P.accent, neutral: P.text3 };
const SEV: Record<string, string> = { critical: P.bad, high: P.warn, medium: P.accent, low: P.text3 };
export const POSTER = { w: 1200, h: 1600 };

const label = (t: string): React.CSSProperties => ({ display: "flex", fontFamily: "DM Mono", fontSize: 20, letterSpacing: 2, textTransform: "uppercase", color: P.text3 });

function Card({ children, flex = 1 }: { children: React.ReactNode; flex?: number }) {
  return <div style={{ display: "flex", flexDirection: "column", flex, background: P.card, border: `2px solid ${P.line}`, borderRadius: 28, padding: 28, gap: 16 }}>{children}</div>;
}

function StatRow({ p }: { p: Extract<VisualPanel, { type: "stats" }> }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {p.items.slice(0, 4).map((s) => (
        <div key={s.label} style={{ display: "flex", flexDirection: "column", flex: 1, background: P.card, border: `2px solid ${P.line}`, borderTop: `8px solid ${T[s.tone ?? "neutral"]}`, borderRadius: 24, padding: "22px 24px", gap: 8 }}>
          <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 64, lineHeight: 1, color: P.text }}>{s.value}</div>
          <div style={{ display: "flex", fontSize: 22, color: P.text2 }}>{s.label}</div>
          {s.sub ? <div style={{ display: "flex", fontSize: 18, color: P.text3 }}>{s.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

function BigGauge({ p }: { p: Extract<VisualPanel, { type: "gauge" }> }) {
  const max = p.max ?? 100;
  const frac = clampNum(p.value / (max || 1), 0, 1);
  const tone = T[p.tone ?? (frac >= 0.7 ? "good" : frac >= 0.4 ? "warn" : "bad")];
  return (
    <Card>
      <div style={label(p.title)}>{p.title}</div>
      <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 96, lineHeight: 1, color: tone }}>{Math.round(p.value)}</div>
      <div style={{ display: "flex", height: 16, borderRadius: 99, background: P.track, overflow: "hidden" }}>
        <div style={{ display: "flex", width: `${frac * 100}%`, background: tone }} />
      </div>
      {p.label ? <div style={{ display: "flex", fontSize: 20, color: P.text3 }}>{p.label}</div> : null}
    </Card>
  );
}

function TrendCols({ p }: { p: Extract<VisualPanel, { type: "line" }> }) {
  const vals = p.points.map((x) => x.value);
  const hi = Math.max(...vals, p.max ?? 0, 1);
  return (
    <Card>
      <div style={label(p.title)}>{p.title}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 150 }}>
        {p.points.map((x, i) => (
          <div key={i} style={{ display: "flex", flex: 1, height: `${Math.max(4, (x.value / hi) * 100)}%`, background: i === p.points.length - 1 ? P.accent : "#7a6a2c", borderRadius: 4 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "DM Mono", fontSize: 18, color: P.text3 }}>
        <span>{p.points[0]?.label}</span><span>{p.points[p.points.length - 1]?.label}</span>
      </div>
    </Card>
  );
}

function BarsCard({ p }: { p: Extract<VisualPanel, { type: "bars" }> }) {
  return (
    <Card>
      <div style={label(p.title)}>{p.title}</div>
      {p.items.slice(0, 6).map((it) => {
        const w = clampNum((it.value / (it.max || 100)) * 100, 0, 100);
        return (
          <div key={it.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: P.text2 }}>
              <span style={{ display: "flex" }}>{it.label.slice(0, 34)}</span><span style={{ display: "flex", fontFamily: "DM Mono", color: P.text }}>{Math.round(it.value)}{p.unit ?? ""}</span>
            </div>
            <div style={{ display: "flex", height: 14, borderRadius: 99, background: P.track, overflow: "hidden" }}>
              <div style={{ display: "flex", width: `${w}%`, background: T[it.tone ?? "accent"] }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function SignalsCard({ p }: { p: Extract<VisualPanel, { type: "signals" }> }) {
  return (
    <Card>
      <div style={label(p.title)}>{p.title}</div>
      {p.items.slice(0, 3).map((s) => (
        <div key={s.label} style={{ display: "flex", gap: 16, alignItems: "center", background: P.card2, borderLeft: `8px solid ${SEV[s.severity]}`, borderRadius: 16, padding: "16px 20px" }}>
          <div style={{ display: "flex", fontFamily: "DM Mono", fontSize: 18, textTransform: "uppercase", color: SEV[s.severity], width: 110 }}>{s.severity}</div>
          <div style={{ display: "flex", flex: 1, fontSize: 24, fontWeight: 700, color: P.text }}>{s.label.slice(0, 64)}</div>
          {typeof s.confidence === "number" ? <div style={{ display: "flex", fontFamily: "DM Mono", fontSize: 20, color: P.text3 }}>{Math.round(s.confidence * 100)}%</div> : null}
        </div>
      ))}
    </Card>
  );
}

export function VisualPoster({ spec }: { spec: VisualSpec }) {
  const find = <K extends VisualPanel["type"]>(t: K) => spec.panels.filter((p): p is Extract<VisualPanel, { type: K }> => p.type === t);
  const stats = find("stats")[0];
  const gauges = find("gauge").slice(0, 3);
  const line = find("line")[0];
  const bars = find("bars").slice(0, 2);
  const signals = find("signals")[0];
  const callout = find("callout")[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", width: POSTER.w, height: POSTER.h, background: P.bg, padding: 56, gap: 20, fontFamily: "Inter", color: P.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "DM Mono", fontSize: 22, letterSpacing: 5, color: P.accent }}>BUILDMIND</div>
        <div style={{ display: "flex", fontFamily: "DM Mono", fontSize: 20, color: P.text3 }}>{spec.generatedAt ? spec.generatedAt.slice(0, 10) : ""}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 72, lineHeight: 1.05, letterSpacing: -2 }}>{spec.title}</div>
        {spec.subtitle ? <div style={{ display: "flex", fontSize: 26, color: P.text3 }}>{spec.subtitle.slice(0, 90)}</div> : null}
      </div>
      {stats ? <StatRow p={stats} /> : null}
      {gauges.length ? <div style={{ display: "flex", gap: 14 }}>{gauges.map((g) => <BigGauge key={g.title} p={g} />)}</div> : null}
      {line ? <TrendCols p={line} /> : null}
      {bars.length ? <div style={{ display: "flex", gap: 14 }}>{bars.map((b) => <BarsCard key={b.title} p={b} />)}</div> : null}
      {signals ? <SignalsCard p={signals} /> : null}
      {callout ? <div style={{ display: "flex", background: P.card2, borderLeft: `8px solid ${P.accent}`, borderRadius: 16, padding: "18px 24px", fontSize: 24, lineHeight: 1.4, color: P.text2 }}>{callout.text.slice(0, 220)}</div> : null}
      <div style={{ display: "flex", marginTop: "auto", fontSize: 20, color: P.text3 }}>buildmind.live · every figure comes from your own activity</div>
    </div>
  );
}

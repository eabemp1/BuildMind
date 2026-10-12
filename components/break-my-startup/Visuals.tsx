"use client";

/**
 * components/break-my-startup/Visuals.tsx
 *
 * Visual layer for the Break My Startup result. Every component here is a
 * second way to read data the result already contains. Nothing is invented:
 * if the data for a visual is missing, the component renders nothing.
 *
 *   SignalRadar     the five signals as one shape (outward is always good)
 *   RiskMap         every risk placed in a severity lane, numbered
 *   RiskTree        verdict, then severity, then risk, then the fix
 *   ThreatMap       competitors on rings around your idea, nearer is worse
 *   PivotCompare    current score against each pivot's estimated score,
 *                   with how well each one fits how you execute
 *   RoadmapTimeline the recovery plan as a path with phases
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { RadarChart } from "@/components/charts";
import { Chip, bodyText, display, firstSentence, labelText, mono, smallText } from "@/components/break-my-startup/ui";
import type { BreakResult, CompetitorRow, PivotItem, RiskItem, RiskSeverity } from "@/components/break-my-startup/viewTypes";

const SEV_COLOR: Record<RiskSeverity, string> = {
  Critical: "var(--bm-red)", High: "var(--bm-amber)", Medium: "var(--bm-blue)", Low: "var(--bm-green)",
};
const SEV_ORDER: RiskSeverity[] = ["Critical", "High", "Medium", "Low"];
const THREAT_COLOR = { high: "var(--bm-red)", medium: "var(--bm-amber)", low: "var(--bm-green)" } as const;

const card: React.CSSProperties = { background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "16px" };

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

// ── Signal radar ─────────────────────────────────────────────────────────

export function SignalRadar({ scores, overall }: { scores: NonNullable<BreakResult["signalScores"]>; overall?: number }) {
  // Competition and risk are "lower is better". Flip them so every axis reads
  // the same way: further from the centre is better.
  const axes = [
    { key: "demand", label: "Demand", value: clamp(scores.demand), tip: "Is anyone looking for this?" },
    { key: "uniqueness", label: "Uniqueness", value: clamp(scores.uniqueness), tip: "Is it different from what exists?" },
    { key: "timing", label: "Timing", value: clamp(scores.timing), tip: "Is now a good time?" },
    { key: "competition", label: "Open field", value: clamp(100 - scores.competition), tip: "Higher means less crowded" },
    { key: "risk", label: "Safety", value: clamp(100 - scores.risk), tip: "Higher means less likely to go wrong" },
  ];
  const weakest = [...axes].sort((a, b) => a.value - b.value)[0];
  const strongest = [...axes].sort((a, b) => b.value - a.value)[0];
  return (
    <div style={{ ...card, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <div style={{ flexShrink: 0, maxWidth: "100%" }}>
        <RadarChart axes={axes} size={260} centerValue={overall} centerLabel="survive" />
      </div>
      <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <p style={labelText}>Shape of the idea</p>
        <p style={{ ...bodyText, color: "var(--bm-text)" }}>
          A big, even shape is healthy. Dents show where it is weakest.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...smallText, display: "flex", gap: 8, alignItems: "center" }}>
            <Dot color="var(--bm-green)" /> Strongest: <strong style={{ color: "var(--bm-text)" }}>{strongest.label}</strong> ({strongest.value})
          </span>
          <span style={{ ...smallText, display: "flex", gap: 8, alignItems: "center" }}>
            <Dot color="var(--bm-red)" /> Weakest: <strong style={{ color: "var(--bm-text)" }}>{weakest.label}</strong> ({weakest.value})
          </span>
        </div>
        <p style={{ ...smallText, fontSize: 11.5 }}>Competition and risk are flipped here so that further out is always better.</p>
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0, display: "inline-block" }} />;
}

// ── Risk map (severity lanes) ────────────────────────────────────────────

export function RiskMap({ risks, onPick }: { risks: RiskItem[]; onPick?: (index: number) => void }) {
  if (risks.length === 0) return null;
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <p style={labelText}>Risk map</p>
        <span style={{ ...smallText, fontSize: 11.5 }}>Numbers match the list below. Tap one to jump to it.</span>
      </div>
      {SEV_ORDER.map((sev) => {
        const items = risks.map((r, i) => ({ r, i })).filter((x) => x.r.severity === sev);
        return (
          <div key={sev} style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 10, alignItems: "center" }}>
            <span style={{ fontFamily: mono, fontSize: 11.5, color: SEV_COLOR[sev], fontWeight: 600 }}>{sev}</span>
            <div style={{ minHeight: 34, borderRadius: 10, background: "var(--bm-bg3)", border: `1px dashed ${items.length ? SEV_COLOR[sev] + "66" : "var(--bm-border)"}`, display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", flexWrap: "wrap" }}>
              {items.length === 0 && <span style={{ ...smallText, fontSize: 11.5 }}>none</span>}
              {items.map(({ r, i }) => (
                <motion.button key={i} type="button" title={`${r.category}: ${firstSentence(r.description, 90)}`}
                  initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.05 * i, type: "spring", stiffness: 380, damping: 22 }}
                  onClick={() => onPick?.(i)} aria-label={`Risk ${i + 1}: ${r.category}, ${sev}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${SEV_COLOR[sev]}`, background: `color-mix(in srgb, ${SEV_COLOR[sev]} 14%, transparent)`, color: "var(--bm-text)", borderRadius: 99, padding: "3px 10px 3px 4px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 99, background: SEV_COLOR[sev], color: "var(--bm-text-inv)", fontFamily: mono, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.category}</span>
                </motion.button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Risk tree (hierarchy) ────────────────────────────────────────────────

export function RiskTree({ verdict, risks }: { verdict: string; risks: RiskItem[] }) {
  const groups = SEV_ORDER.map((s) => ({ s, items: risks.filter((r) => r.severity === s) })).filter((g) => g.items.length);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (groups.length === 0) return null;
  const line = "var(--bm-border)";
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={labelText}>How the risks branch</p>
      <div style={{ ...bodyText, color: "var(--bm-text)", fontWeight: 700, fontFamily: display, display: "flex", gap: 8, alignItems: "center" }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: "var(--bm-accent)" }} /> {verdict}
      </div>
      <div style={{ marginLeft: 4, borderLeft: `2px solid ${line}`, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((g) => (
          <div key={g.s} style={{ position: "relative" }}>
            <span aria-hidden style={{ position: "absolute", left: -14, top: 11, width: 12, borderTop: `2px solid ${line}` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Chip color={SEV_COLOR[g.s]}>{g.s}</Chip>
              <span style={{ ...smallText, fontSize: 11.5 }}>{g.items.length} {g.items.length === 1 ? "risk" : "risks"}</span>
            </div>
            <div style={{ marginLeft: 4, marginTop: 6, borderLeft: `2px solid ${line}`, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {g.items.map((r) => {
                const key = `${g.s}-${r.category}`;
                const isOpen = open[key];
                return (
                  <div key={key} style={{ position: "relative" }}>
                    <span aria-hidden style={{ position: "absolute", left: -14, top: 12, width: 12, borderTop: `2px solid ${line}` }} />
                    <button type="button" aria-expanded={Boolean(isOpen)} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                      style={{ background: "var(--bm-bg3)", border: `1px solid var(--bm-border)`, borderLeft: `3px solid ${SEV_COLOR[g.s]}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", textAlign: "left", color: "var(--bm-text)", fontFamily: display, fontSize: 13.5, fontWeight: 600, width: "100%" }}>
                      {r.category}
                    </button>
                    {isOpen && (
                      <div style={{ marginLeft: 4, marginTop: 6, borderLeft: `2px solid ${line}`, paddingLeft: 14, position: "relative" }}>
                        <span aria-hidden style={{ position: "absolute", left: -2, top: 12, width: 12, borderTop: `2px solid ${line}` }} />
                        <div style={{ display: "flex", gap: 8, background: "color-mix(in srgb, var(--bm-green) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--bm-green) 40%, transparent)", borderRadius: 8, padding: "7px 10px" }}>
                          <span style={{ ...labelText, color: "var(--bm-green)", flexShrink: 0 }}>Fix</span>
                          <span style={{ ...bodyText, fontSize: 13 }}>{firstSentence(r.mitigation, 170)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p style={{ ...smallText, fontSize: 11.5 }}>Tap a risk to see its fix.</p>
    </div>
  );
}

// ── Threat map (competitors on rings) ────────────────────────────────────

export function ThreatMap({ competitors }: { competitors: CompetitorRow[] }) {
  const list = competitors.slice(0, 14);
  if (list.length === 0) return null;
  const size = 300, c = size / 2;
  const radiusFor = (t: CompetitorRow["threat_level"]) => (t === "high" ? 52 : t === "medium" ? 92 : 128);
  const byThreat = { high: list.filter((x) => x.threat_level === "high"), medium: list.filter((x) => x.threat_level === "medium"), low: list.filter((x) => x.threat_level === "low") };
  // Spread each ring's dots evenly, offsetting rings so labels do not line up.
  const placed: Array<{ comp: CompetitorRow; n: number; x: number; y: number }> = [];
  let n = 0;
  (["high", "medium", "low"] as const).forEach((t, ringIdx) => {
    const ring = byThreat[t];
    ring.forEach((comp, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ring.length, 1) + ringIdx * 0.7 - Math.PI / 2;
      n += 1;
      placed.push({ comp, n, x: c + radiusFor(t) * Math.cos(angle), y: c + radiusFor(t) * Math.sin(angle) });
    });
  });
  return (
    <div style={{ ...card, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Competitor threat map" style={{ maxWidth: "100%", height: "auto", flexShrink: 0 }}>
        {(["low", "medium", "high"] as const).map((t) => (
          <circle key={t} cx={c} cy={c} r={radiusFor(t) + 16} fill={`color-mix(in srgb, ${THREAT_COLOR[t]} 6%, transparent)`} stroke={THREAT_COLOR[t]} strokeOpacity={0.35} strokeDasharray="3 4" />
        ))}
        <circle cx={c} cy={c} r={20} fill="var(--bm-accent)" />
        <text x={c} y={c + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--bm-text-inv)">YOU</text>
        {placed.map((p, i) => (
          <motion.g key={p.comp.name} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.04 * i }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
            <title>{`${p.comp.name} (${p.comp.threat_level} threat): ${p.comp.weakness}`}</title>
            <line x1={c} y1={c} x2={p.x} y2={p.y} stroke={THREAT_COLOR[p.comp.threat_level]} strokeOpacity={0.18} />
            <circle cx={p.x} cy={p.y} r={11} fill={THREAT_COLOR[p.comp.threat_level]} />
            <text x={p.x} y={p.y + 3.7} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--bm-text-inv)">{p.n}</text>
          </motion.g>
        ))}
      </svg>
      <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={labelText}>Nearer to the centre means a bigger threat</p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {placed.map((p) => (
            <li key={p.comp.name} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--bm-text2)" }}>
              <span style={{ width: 18, height: 18, borderRadius: 99, background: THREAT_COLOR[p.comp.threat_level], color: "var(--bm-text-inv)", fontFamily: mono, fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{p.n}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.comp.name}</span>
            </li>
          ))}
        </ol>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          {(["high", "medium", "low"] as const).map((t) => (
            <span key={t} style={{ ...smallText, fontSize: 11.5, display: "inline-flex", gap: 5, alignItems: "center" }}><Dot color={THREAT_COLOR[t]} />{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Pivot comparison ─────────────────────────────────────────────────────

const EFFORT: Record<NonNullable<PivotItem["effort"]>, { label: string; n: number }> = {
  light: { label: "Light effort", n: 1 }, moderate: { label: "Moderate effort", n: 2 }, heavy: { label: "Heavy effort", n: 3 },
};

export function fitColor(v: number) {
  return v >= 70 ? "var(--bm-green)" : v >= 45 ? "var(--bm-amber)" : "var(--bm-red)";
}

export function EffortDots({ effort }: { effort?: PivotItem["effort"] }) {
  if (!effort) return null;
  const e = EFFORT[effort];
  return (
    <span title={e.label} style={{ display: "inline-flex", gap: 3, alignItems: "center", ...smallText, fontSize: 11.5 }}>
      {[1, 2, 3].map((i) => <span key={i} aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: i <= e.n ? "var(--bm-accent)" : "var(--bm-bg4)" }} />)}
      <span style={{ marginLeft: 4 }}>{e.label}</span>
    </span>
  );
}

export function PivotCompare({ current, pivots, styleLabel }: { current?: number; pivots: PivotItem[]; styleLabel?: string | null }) {
  if (pivots.length === 0) return null;
  const base = typeof current === "number" ? clamp(current) : null;
  const hasFit = pivots.some((p) => typeof p.style_fit === "number");
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <p style={labelText}>Where each direction could take the score</p>
        {styleLabel && hasFit && <span style={{ ...smallText, fontSize: 11.5 }}>Fit is matched to you: {styleLabel}</span>}
      </div>
      {pivots.map((p, i) => {
        const delta = clamp(p.estimated_score_delta, 0, 40);
        const from = base ?? 0;
        const to = clamp(from + delta);
        return (
          <div key={p.title} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontFamily: display, fontSize: 13.5, fontWeight: 700, color: "var(--bm-text)", minWidth: 0 }}>{i + 1}. {p.title}</span>
              <span style={{ fontFamily: mono, fontSize: 12, color: "var(--bm-green)", flexShrink: 0 }}>+{delta}{base !== null && <span style={{ color: "var(--bm-text3)" }}> → {to}</span>}</span>
            </div>
            {base !== null && (
              <div style={{ position: "relative", height: 10, borderRadius: 99, background: "var(--bm-bg4)", overflow: "hidden" }} title={`Now ${from}, estimated ${to}`}>
                <div style={{ position: "absolute", inset: 0, width: `${from}%`, background: "var(--bm-text3)", opacity: 0.55 }} />
                <motion.div initial={{ width: 0 }} animate={{ width: `${delta}%` }} transition={{ duration: 0.6, delay: 0.1 * i }} style={{ position: "absolute", left: `${from}%`, top: 0, bottom: 0, background: "var(--bm-green)" }} />
              </div>
            )}
            {typeof p.style_fit === "number" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...smallText, fontSize: 11.5, width: 62, flexShrink: 0 }}>Fits you</span>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--bm-bg4)", overflow: "hidden" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${clamp(p.style_fit)}%` }} transition={{ duration: 0.6, delay: 0.1 * i }} style={{ height: "100%", background: fitColor(p.style_fit) }} />
                </div>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: fitColor(p.style_fit), width: 28, textAlign: "right" }}>{Math.round(p.style_fit)}</span>
              </div>
            )}
          </div>
        );
      })}
      <p style={{ ...smallText, fontSize: 11.5 }}>
        Grey is your score now, green is the estimated gain. These are estimates from the same signals as the verdict, not guarantees.
      </p>
    </div>
  );
}

// ── Roadmap timeline ─────────────────────────────────────────────────────

export function RoadmapTimeline({ plan }: { plan: NonNullable<BreakResult["executionPlan"]> }) {
  const phases = [
    { id: "first", when: "This week", title: "First actions", items: plan.first_10_actions, color: "var(--bm-accent)" },
    { id: "build", when: "Weeks 2 to 4", title: "Build", items: plan.mvp_roadmap, color: "var(--bm-blue)" },
    { id: "reach", when: "Alongside", title: "Reach customers", items: plan.gtm_plan, color: "var(--bm-green)" },
  ].filter((p) => p.items && p.items.length);
  if (phases.length === 0) return null;
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 0 }}>
      {phases.map((ph, pi) => (
        <div key={ph.id} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: 99, background: ph.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${ph.color} 22%, transparent)`, marginTop: 3 }} />
            {pi < phases.length - 1 && <span aria-hidden style={{ flex: 1, width: 2, background: "var(--bm-border)", marginTop: 4 }} />}
          </div>
          <div style={{ paddingBottom: pi < phases.length - 1 ? 18 : 0, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{ph.title}</span>
              <span style={{ fontFamily: mono, fontSize: 11.5, color: ph.color }}>{ph.when}</span>
            </div>
            <ol style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "decimal", display: "flex", flexDirection: "column", gap: 5 }}>
              {(ph.items ?? []).slice(0, 4).map((it) => <li key={it} style={{ ...bodyText, fontSize: 13.5 }}>{it}</li>)}
            </ol>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { EvidenceLayer, ClaimKind } from "@/lib/breakEvidence";

const KIND: Record<ClaimKind, { label: string; color: string; hint: string }> = {
  evidence:   { label: "Evidence",   color: "var(--bm-green)",  hint: "Backed by a source you can open" },
  inference:  { label: "Inference",  color: "var(--bm-amber)",  hint: "An agent's reasoning, not directly sourced" },
  hypothesis: { label: "Hypothesis", color: "var(--bm-accent)", hint: "Your belief, not yet tested on customers" },
  unknown:    { label: "Unknown",    color: "var(--bm-text3)",  hint: "Nobody has checked this" },
};
const QUALITY: Record<string, { label: string; color: string }> = {
  verified: { label: "Verified",  color: "var(--bm-green)" },
  inferred: { label: "Inferred",  color: "var(--bm-amber)" },
  adjacent: { label: "Adjacent",  color: "var(--bm-text3)" },
};
const mono = "'DM Mono', monospace";
const eyebrow: React.CSSProperties = { margin: 0, fontFamily: mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--bm-text3)" };
const box: React.CSSProperties = { border: "1px solid var(--bm-border)", borderRadius: 12, background: "var(--bm-bg2)", padding: "16px 18px" };

function Chip({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return <span title={title} style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color, border: `1px solid ${color}`, borderRadius: 99, padding: "2px 7px", flexShrink: 0 }}>{children}</span>;
}

export function EvidencePanel({ layer }: { layer: EvidenceLayer }) {
  const [showAllClaims, setShowAllClaims] = useState(false);
  const c = layer.confidence;
  const claims = showAllClaims ? layer.claims : layer.claims.slice(0, 6);
  const gradeColor = c.grade === "solid" ? "var(--bm-green)" : c.grade === "moderate" ? "var(--bm-amber)" : "var(--bm-red)";

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="Evidence and reasoning">
      {/* Calibrated range replaces a falsely precise number */}
      <div style={box}>
        <p style={eyebrow}>How sure is this?</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "8px 0 10px" }}>
          <span style={{ fontSize: 26, fontWeight: 600, color: "var(--bm-text)" }}>{c.low}–{c.high}</span>
          <span style={{ fontSize: 13, color: "var(--bm-text3)" }}>likely range, best estimate {c.score}</span>
          <Chip color={gradeColor}>{c.grade} evidence</Chip>
        </div>
        <div style={{ position: "relative", height: 8, borderRadius: 99, background: "var(--bm-bg4)" }} aria-hidden>
          <div style={{ position: "absolute", left: `${c.low}%`, width: `${Math.max(2, c.high - c.low)}%`, top: 0, bottom: 0, borderRadius: 99, background: gradeColor, opacity: 0.35 }} />
          <div style={{ position: "absolute", left: `${c.score}%`, top: -3, width: 3, height: 14, borderRadius: 2, background: "var(--bm-text)", transform: "translateX(-1px)" }} />
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.55 }}>{c.why}</p>
      </div>

      {layer.conflicts.length > 0 && (
        <div style={{ ...box, borderColor: "var(--bm-amber)" }}>
          <p style={{ ...eyebrow, color: "var(--bm-amber)" }}>Evidence conflicts ({layer.conflicts.length})</p>
          <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: "var(--bm-text3)" }}>These findings disagree. Settle them before trusting the verdict.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {layer.conflicts.map(cf => (
              <div key={cf.title}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)" }}>{cf.title}</p>
                <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>
                  <strong style={{ fontWeight: 600 }}>{cf.sideA.agent}:</strong> {cf.sideA.says}<br />
                  <strong style={{ fontWeight: 600 }}>{cf.sideB.agent}:</strong> {cf.sideB.says}
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>How to settle it: {cf.howToSettle}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={box}>
        <p style={eyebrow}>What the verdict rests on</p>
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
          {claims.map((cl, i) => {
            const k = KIND[cl.kind];
            return (
              <li key={`${i}-${cl.claim}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Chip color={k.color} title={k.hint}>{k.label}</Chip>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text)", lineHeight: 1.45 }}>{cl.claim}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--bm-text4)" }}>{cl.source}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {layer.claims.length > 6 && (
          <button type="button" onClick={() => setShowAllClaims(v => !v)} style={{ marginTop: 12, background: "none", border: 0, padding: 0, color: "var(--bm-accent)", fontSize: 12, cursor: "pointer" }}>
            {showAllClaims ? "Show fewer" : `Show all ${layer.claims.length}`}
          </button>
        )}
      </div>

      {layer.competitors.length > 0 && (
        <div style={box}>
          <p style={eyebrow}>Competitor evidence</p>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {layer.competitors.slice(0, 8).map(co => (
              <li key={co.name} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Chip color={QUALITY[co.quality].color}>{QUALITY[co.quality].label}</Chip>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text)" }}>
                    {co.url ? <a href={co.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecorationColor: "var(--bm-border2)" }}>{co.name}</a> : co.name}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--bm-text4)", lineHeight: 1.45 }}>{co.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={box}>
        <p style={eyebrow}>What would prove this wrong</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          {layer.falsifiers.map(f => (
            <div key={f.assumption}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.4 }}>{f.assumption}</p>
              <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>Test: {f.test}</p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--bm-red)", lineHeight: 1.5 }}>Wrong if: {f.provenWrongIf}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

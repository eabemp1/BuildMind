"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { EvidenceLayer, ClaimKind } from "@/lib/breakEvidence";
import type { TrackRecord, TestStatus } from "@/lib/breakCalibration";

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

const RESULT_LABEL: Record<Exclude<TestStatus, "open">, { label: string; color: string }> = {
  supported:    { label: "Held up",       color: "var(--bm-green)" },
  refuted:      { label: "Proved wrong",  color: "var(--bm-red)" },
  inconclusive: { label: "Could not tell", color: "var(--bm-text3)" },
};

/** Lets the founder record what happened when they ran a predicted test. */
function RecordResult({ predictionId, testId, hold, status, busy, onRecord }: {
  predictionId?: string; testId?: string; hold?: number; status?: TestStatus; busy: boolean;
  onRecord: (testId: string, status: TestStatus) => void;
}) {
  if (!predictionId || !testId) return null;
  const done = status && status !== "open" ? RESULT_LABEL[status] : null;
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {typeof hold === "number" && <span style={{ fontSize: 11.5, color: "var(--bm-text4)" }}>We expected this to hold {Math.round(hold * 100)}% of the time.</span>}
      {done ? (
        <>
          <Chip color={done.color}>{done.label}</Chip>
          <button type="button" disabled={busy} onClick={() => onRecord(testId, "open")} style={{ background: "none", border: 0, padding: 0, color: "var(--bm-text3)", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>Undo</button>
        </>
      ) : (
        (Object.keys(RESULT_LABEL) as Array<keyof typeof RESULT_LABEL>).map((k) => (
          <button key={k} type="button" disabled={busy} onClick={() => onRecord(testId, k)}
            style={{ border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", borderRadius: 99, padding: "3px 10px", fontSize: 11.5, cursor: busy ? "wait" : "pointer" }}>
            {RESULT_LABEL[k].label}
          </button>
        ))
      )}
    </div>
  );
}

const GRADE_COPY: Record<TrackRecord["grade"], { label: string; color: string }> = {
  no_data:       { label: "No results yet",   color: "var(--bm-text3)" },
  early:         { label: "Too early to tell", color: "var(--bm-amber)" },
  calibrated:    { label: "Well calibrated",  color: "var(--bm-green)" },
  overconfident: { label: "Ran optimistic",   color: "var(--bm-red)" },
  underconfident:{ label: "Ran cautious",     color: "var(--bm-amber)" },
};

function TrackRecordCard({ track }: { track: TrackRecord }) {
  const g = GRADE_COPY[track.grade];
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
  return (
    <div style={box}>
      <p style={eyebrow}>How these numbers have performed for you</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 6px", flexWrap: "wrap" }}>
        <Chip color={g.color}>{g.label}</Chip>
        {track.resolved > 0 && (
          <span style={{ fontSize: 12.5, color: "var(--bm-text2)" }}>Expected {pct(track.meanPredicted)} to hold, {pct(track.observed)} did ({track.resolved} tested)</span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{track.summary}</p>
      {track.adjustment.applied && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--bm-amber)", lineHeight: 1.5 }}>This analysis is already adjusted for that record.</p>
      )}
    </div>
  );
}

export function EvidencePanel({ layer }: { layer: EvidenceLayer }) {
  const [showAllClaims, setShowAllClaims] = useState(false);
  const [results, setResults] = useState<Record<string, TestStatus>>({});
  const [track, setTrack] = useState<TrackRecord | undefined>(layer.trackRecord);
  const [busy, setBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  async function record(testId: string, status: TestStatus) {
    if (!layer.predictionId) return;
    setBusy(true); setRecordError(null);
    try {
      const res = await fetch("/api/break-predictions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionId: layer.predictionId, testId, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Could not record that result");
      setResults((r) => ({ ...r, [testId]: status }));
      if (json.trackRecord) setTrack(json.trackRecord as TrackRecord);
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : "Could not record that result");
    } finally { setBusy(false); }
  }
  const c = layer.confidence;
  const claims = showAllClaims ? layer.claims : layer.claims.slice(0, 6);
  const gradeColor = c.grade === "solid" ? "var(--bm-green)" : c.grade === "moderate" ? "var(--bm-amber)" : "var(--bm-red)";

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="Evidence and reasoning">
      {/* Conclusion confidence leads: how far to trust the verdict, what is unknown, what would settle it */}
      {layer.conclusion && (
        <div style={{ ...box, borderColor: layer.conclusion.pct < 40 ? "var(--bm-amber)" : "var(--bm-border)" }}>
          <p style={eyebrow}>Confidence in this conclusion</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "8px 0 4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 30, fontWeight: 600, color: "var(--bm-text)" }}>{layer.conclusion.pct}%</span>
            <Chip color={layer.conclusion.label === "High" ? "var(--bm-green)" : layer.conclusion.label === "Moderate" ? "var(--bm-amber)" : "var(--bm-red)"}>{layer.conclusion.label}</Chip>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>Use this to decide what to investigate next. It is not enough to decide the idea is dead or alive.</p>
          <dl style={{ margin: 0, display: "grid", gap: 10 }}>
            <div><dt style={{ ...eyebrow, color: "var(--bm-text3)" }}>Biggest unknown</dt><dd style={{ margin: "3px 0 0", fontSize: 13.5, color: "var(--bm-text)", lineHeight: 1.45 }}>{layer.conclusion.primaryUncertainty}</dd></div>
            <div><dt style={eyebrow}>Next unknown</dt><dd style={{ margin: "3px 0 0", fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.45 }}>{layer.conclusion.secondaryUncertainty}</dd></div>
            {layer.conclusion.requiredEvidence.length > 0 && (
              <div><dt style={eyebrow}>Evidence that would settle it</dt>
                <dd style={{ margin: "3px 0 0" }}><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>{layer.conclusion.requiredEvidence.map(e => <li key={e}>{e}</li>)}</ul></dd></div>
            )}
          </dl>
        </div>
      )}

      {layer.nextMove && (
        <div style={{ ...box, borderColor: layer.nextMove.holdBuilding ? "var(--bm-accent)" : "var(--bm-border)" }}>
          <p style={eyebrow}>{layer.nextMove.holdBuilding ? "Do this before building anything" : "Best next test"}</p>
          <p style={{ margin: "10px 0 6px", fontSize: 14, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.5 }}>{layer.nextMove.action}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{layer.nextMove.why}</p>
          {layer.nextMove.doNotBuildYet.length > 0 && (
            <>
              <p style={{ ...eyebrow, marginTop: 12 }}>Not yet</p>
              <ul style={{ margin: "5px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>
                {layer.nextMove.doNotBuildYet.map(t => <li key={t}>{t}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {(layer.demandSplit || layer.riskExposure) && (
        <div style={box}>
          <p style={eyebrow}>Two numbers that are easy to confuse</p>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginTop: 12 }}>
            {layer.demandSplit && (
              <div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--bm-text3)" }}>Demand</p>
                <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--bm-text)" }}>
                  <strong style={{ fontSize: 22, fontWeight: 600 }}>{layer.demandSplit.market}</strong> in the market
                  {" · "}
                  <strong style={{ fontSize: 22, fontWeight: 600 }}>{layer.demandSplit.product}</strong> for your product
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{layer.demandSplit.basis}</p>
              </div>
            )}
            {layer.riskExposure && (
              <div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--bm-text3)" }}>Risk</p>
                <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--bm-text)" }}>
                  <strong style={{ fontSize: 22, fontWeight: 600 }}>{layer.riskExposure.exposure}</strong> exposure
                  {" · "}
                  <strong style={{ fontSize: 22, fontWeight: 600 }}>{layer.riskExposure.uncertainty}</strong> uncertainty
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>Main unresolved: {layer.riskExposure.primaryUnresolved}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{layer.riskExposure.note}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {track && (track.resolved > 0 || track.open > 0) && <TrackRecordCard track={track} />}

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
        {layer.scoreBasis && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
            <p style={eyebrow}>Where the score comes from · {layer.scoreBasis.label}</p>
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 9 }}>
              {layer.scoreBasis.components.map(comp => (
                <li key={comp.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "start" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text)" }}>{comp.label} <span style={{ color: "var(--bm-text4)", fontSize: 11.5 }}>weight {comp.weight}</span></p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--bm-text4)", lineHeight: 1.45 }}>{comp.basedOn}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>{comp.score}</div>
                    <Chip color={comp.kind === "inference" ? "var(--bm-amber)" : comp.kind === "mixed" ? "var(--bm-accent)" : "var(--bm-green)"}>{comp.kind}</Chip>
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55 }}>
              {layer.scoreBasis.inferenceSharePct}% of the score rests on model inference alone. {layer.scoreBasis.note}
            </p>
          </div>
        )}
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

      {layer.hypotheses && layer.hypotheses.length > 0 && (
        <div style={box}>
          <p style={eyebrow}>The idea as separate bets</p>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>The score is a summary of these. Each bet can be wrong on its own.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {layer.hypotheses.map(h => (
              <div key={h.id} style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)" }}>{h.label}</span>
                  <Chip color={h.status === "supported" ? "var(--bm-green)" : h.status === "contested" ? "var(--bm-red)" : h.status === "indirect_support" ? "var(--bm-amber)" : "var(--bm-text3)"}>
                    {h.status === "indirect_support" ? "indirect support only" : h.status}
                  </Chip>
                  <span style={{ fontSize: 11.5, color: "var(--bm-text4)" }}>confidence {Math.round(h.confidence * 100)}%</span>
                </div>
                <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>{h.statement}</p>
                {h.evidence.length > 0 && <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>For: {h.evidence.join(" ")}</p>}
                {h.counterevidence.length > 0 && <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--bm-red)", lineHeight: 1.5 }}>Against: {h.counterevidence.join(" ")}</p>}
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>Wrong if: {h.falsifier}</p>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>Next: {h.nextExperiment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {layer.evidenceHierarchy && (
        <div style={box}>
          <p style={eyebrow}>What kind of proof is behind this</p>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {layer.evidenceHierarchy.levels.map(l => (
              <li key={l.level} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontFamily: mono, fontSize: 12, color: l.count === 0 && l.level === 1 ? "var(--bm-red)" : "var(--bm-text)", minWidth: 22 }}>{l.count}</span>
                <span style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.45 }}><strong style={{ color: "var(--bm-text)", fontWeight: 600 }}>{l.label}.</strong> {l.note}</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{layer.evidenceHierarchy.statement}</p>
        </div>
      )}

      {layer.excludedCompetitors && layer.excludedCompetitors.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--bm-text4)", lineHeight: 1.5 }}>
          Left out of the competitor list: {layer.excludedCompetitors.map(e => `${e.name} (${e.reason.replace(/\.$/, "").toLowerCase()})`).join("; ")}.
        </p>
      )}

      <div style={box}>
        <p style={eyebrow}>What would prove this wrong</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          {layer.falsifiers.map(f => (
            <div key={f.id ?? f.assumption}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.4 }}>{f.assumption}</p>
              <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>Test: {f.test}</p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--bm-red)", lineHeight: 1.5 }}>Wrong if: {f.provenWrongIf}</p>
              <RecordResult predictionId={layer.predictionId} testId={f.id} hold={f.predictedHold} status={f.id ? results[f.id] : undefined} busy={busy} onRecord={record} />
            </div>
          ))}
        </div>
      </div>
      {layer.thesisTest && (
        <div style={box}>
          <p style={eyebrow}>The experiment that tests your actual idea</p>
          <p style={{ margin: "10px 0 0", fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.45 }}>Claim under test: {layer.thesisTest.thesis}</p>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--bm-amber)", lineHeight: 1.5 }}>{layer.thesisTest.notThisTest}</p>
          <RecordResult predictionId={layer.predictionId} testId={layer.thesisTest.id} hold={layer.thesisTest.predictedHold} status={layer.thesisTest.id ? results[layer.thesisTest.id] : undefined} busy={busy} onRecord={record} />
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{layer.thesisTest.setup}</p>
          <p style={{ ...eyebrow, marginTop: 12 }}>Measure</p>
          <ul style={{ margin: "5px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{layer.thesisTest.measure.map(m => <li key={m}>{m}</li>)}</ul>
          <dl style={{ margin: "12px 0 0", display: "grid", gap: 6, fontSize: 12.5, lineHeight: 1.5 }}>
            <div><dt style={{ display: "inline", color: "var(--bm-text3)" }}>Why this test: </dt><dd style={{ display: "inline", margin: 0, color: "var(--bm-text2)" }}>{layer.thesisTest.why}</dd></div>
            <div><dt style={{ display: "inline", color: "var(--bm-text3)" }}>Based on: </dt><dd style={{ display: "inline", margin: 0, color: "var(--bm-text2)" }}>{layer.thesisTest.basedOn}</dd></div>
            <div><dt style={{ display: "inline", color: "var(--bm-text3)" }}>You will learn: </dt><dd style={{ display: "inline", margin: 0, color: "var(--bm-text2)" }}>{layer.thesisTest.expectedLearning}</dd></div>
            <div><dt style={{ display: "inline", color: "var(--bm-text3)" }}>If it fails: </dt><dd style={{ display: "inline", margin: 0, color: "var(--bm-text2)" }}>{layer.thesisTest.ifItFails}</dd></div>
          </dl>
        </div>
      )}

      {recordError && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--bm-red)" }}>{recordError}</p>}

      {layer.changeMyMind && (
        <div style={box}>
          <p style={eyebrow}>What would change our mind</p>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--bm-red)" }}>Would count against the idea</p>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{layer.changeMyMind.kills.map(k => <li key={k}>{k}</li>)}</ul>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--bm-green)" }}>Would strengthen it</p>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{layer.changeMyMind.strengthens.map(k => <li key={k}>{k}</li>)}</ul>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
          }

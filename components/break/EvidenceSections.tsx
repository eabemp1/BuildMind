"use client";

/**
 * components/break/EvidenceSections.tsx
 *
 * The evidence layer (lib/breakEvidence.ts) split into parts the result view
 * places where they are read: confidence up front, proof in its own tab, and
 * the tests in "next steps". Same data and the same recording API as the old
 * all-in-one EvidencePanel. Recording state lives in one hook so a result
 * recorded in one tab updates the track record shown in another.
 */

import { useState } from "react";
import type { EvidenceLayer, ClaimKind } from "@/lib/breakEvidence";
import type { TrackRecord, TestStatus } from "@/lib/breakCalibration";
import { Chip, Disclosure, bodyText, smallText, labelText, mono, display, body } from "@/components/break-my-startup/ui";

const KIND: Record<ClaimKind, { label: string; color: string; hint: string }> = {
  evidence:   { label: "Evidence",   color: "var(--bm-green)",  hint: "Backed by a source you can open" },
  inference:  { label: "Inference",  color: "var(--bm-amber)",  hint: "An agent's reasoning, not directly sourced" },
  hypothesis: { label: "Hypothesis", color: "var(--bm-accent)", hint: "Your belief, not yet tested on customers" },
  unknown:    { label: "Unknown",    color: "var(--bm-text3)",  hint: "Nobody has checked this" },
};
const QUALITY: Record<string, { label: string; color: string }> = {
  verified: { label: "Verified", color: "var(--bm-green)" },
  inferred: { label: "Inferred", color: "var(--bm-amber)" },
  adjacent: { label: "Adjacent", color: "var(--bm-text3)" },
};
const RESULT_LABEL: Record<Exclude<TestStatus, "open">, { label: string; color: string }> = {
  supported:    { label: "Held up",        color: "var(--bm-green)" },
  refuted:      { label: "Proved wrong",   color: "var(--bm-red)" },
  inconclusive: { label: "Could not tell", color: "var(--bm-text3)" },
};
const GRADE_COPY: Record<TrackRecord["grade"], { label: string; color: string }> = {
  no_data:        { label: "No results yet",    color: "var(--bm-text3)" },
  early:          { label: "Too early to tell", color: "var(--bm-amber)" },
  calibrated:     { label: "Well calibrated",   color: "var(--bm-green)" },
  overconfident:  { label: "Ran optimistic",    color: "var(--bm-red)" },
  underconfident: { label: "Ran cautious",      color: "var(--bm-amber)" },
};

export interface EvidenceRecorder {
  results: Record<string, TestStatus>;
  track: TrackRecord | undefined;
  busy: boolean;
  error: string | null;
  record: (testId: string, status: TestStatus) => Promise<void>;
}

export function useEvidenceRecorder(layer: EvidenceLayer | undefined): EvidenceRecorder {
  const [results, setResults] = useState<Record<string, TestStatus>>({});
  const [track, setTrack] = useState<TrackRecord | undefined>(layer?.trackRecord);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(testId: string, status: TestStatus) {
    if (!layer?.predictionId) return;
    setBusy(true); setError(null);
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
      setError(e instanceof Error ? e.message : "Could not record that result");
    } finally { setBusy(false); }
  }
  return { results, track, busy, error, record };
}

function RecordResult({ layer, testId, hold, status, rec }: { layer: EvidenceLayer; testId?: string; hold?: number; status?: TestStatus; rec: EvidenceRecorder }) {
  if (!layer.predictionId || !testId) return null;
  const done = status && status !== "open" ? RESULT_LABEL[status] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {typeof hold === "number" && <span style={{ ...smallText, fontSize: 12 }}>We expected this to hold {Math.round(hold * 100)}% of the time.</span>}
      {done ? (
        <>
          <Chip color={done.color}>{done.label}</Chip>
          <button type="button" disabled={rec.busy} onClick={() => rec.record(testId, "open")} style={{ background: "none", border: 0, padding: 0, color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Undo</button>
        </>
      ) : (
        (Object.keys(RESULT_LABEL) as Array<keyof typeof RESULT_LABEL>).map((k) => (
          <button key={k} type="button" disabled={rec.busy} onClick={() => rec.record(testId, k)}
            style={{ border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: rec.busy ? "wait" : "pointer" }}>
            {RESULT_LABEL[k].label}
          </button>
        ))
      )}
    </div>
  );
}

/** One short block: how far to trust the verdict, and the one thing that would settle it. */
export function ConfidenceSummary({ layer }: { layer: EvidenceLayer }) {
  const c = layer.confidence;
  const gradeColor = c.grade === "solid" ? "var(--bm-green)" : c.grade === "moderate" ? "var(--bm-amber)" : "var(--bm-red)";
  const concl = layer.conclusion;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {concl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: display, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--bm-text)", lineHeight: 1 }}>{concl.pct}%</span>
            <span style={{ ...bodyText, color: "var(--bm-text)" }}>confident in this conclusion</span>
            <Chip color={concl.label === "High" ? "var(--bm-green)" : concl.label === "Moderate" ? "var(--bm-amber)" : "var(--bm-red)"}>{concl.label}</Chip>
          </div>
          <p style={smallText}>Use this to decide what to investigate next. It is not enough to call the idea dead or alive.</p>
          <div style={{ borderLeft: "3px solid var(--bm-accent)", paddingLeft: 12 }}>
            <p style={labelText}>Biggest unknown</p>
            <p style={{ ...bodyText, color: "var(--bm-text)", marginTop: 2 }}>{concl.primaryUncertainty}</p>
          </div>
          {concl.requiredEvidence.length > 0 && (
            <div>
              <p style={labelText}>Evidence that would settle it</p>
              <ul style={{ ...bodyText, margin: "4px 0 0", paddingLeft: 18, listStyle: "disc" }}>{concl.requiredEvidence.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontFamily: display, fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>{c.low} to {c.high}</span>
          <span style={smallText}>likely range, best estimate {c.score}</span>
          <Chip color={gradeColor}>{c.grade} evidence</Chip>
        </div>
        <div style={{ position: "relative", height: 8, borderRadius: 99, background: "var(--bm-bg4)" }} aria-hidden>
          <div style={{ position: "absolute", left: `${c.low}%`, width: `${Math.max(2, c.high - c.low)}%`, top: 0, bottom: 0, borderRadius: 99, background: gradeColor, opacity: 0.4 }} />
          <div style={{ position: "absolute", left: `${c.score}%`, top: -3, width: 3, height: 14, borderRadius: 2, background: "var(--bm-text)" }} />
        </div>
        <p style={{ ...smallText, marginTop: 8 }}>{c.why}</p>
      </div>
    </div>
  );
}

/** The proof tab: every section collapsed to a one-line summary until opened. */
export function ProofSections({ layer, rec }: { layer: EvidenceLayer; rec: EvidenceRecorder }) {
  const [showAll, setShowAll] = useState(false);
  const claims = showAll ? layer.claims : layer.claims.slice(0, 6);
  const kinds = layer.claims.reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {});
  const kindSummary = (Object.keys(KIND) as ClaimKind[]).filter((k) => kinds[k]).map((k) => `${kinds[k]} ${KIND[k].label.toLowerCase()}`).join(", ");
  const track = rec.track;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {layer.conflicts.length > 0 && (
        <Disclosure title={`Findings that disagree (${layer.conflicts.length})`} summary="Settle these before trusting the verdict." tone="var(--bm-amber)" defaultOpen>
          {layer.conflicts.map((cf) => (
            <div key={cf.title} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ ...bodyText, color: "var(--bm-text)", fontWeight: 600 }}>{cf.title}</p>
              <p style={bodyText}><strong style={{ color: "var(--bm-text)" }}>{cf.sideA.agent}:</strong> {cf.sideA.says}</p>
              <p style={bodyText}><strong style={{ color: "var(--bm-text)" }}>{cf.sideB.agent}:</strong> {cf.sideB.says}</p>
              <p style={smallText}>How to settle it: {cf.howToSettle}</p>
            </div>
          ))}
        </Disclosure>
      )}

      <Disclosure title="What the verdict rests on" summary={kindSummary || `${layer.claims.length} claims`} defaultOpen>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {claims.map((cl, i) => {
            const k = KIND[cl.kind];
            return (
              <li key={`${i}-${cl.claim}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Chip color={k.color} title={k.hint}>{k.label}</Chip>
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...bodyText, color: "var(--bm-text)", fontSize: 13.5 }}>{cl.claim}</p>
                  <p style={{ ...smallText, fontSize: 12 }}>{cl.source}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {layer.claims.length > 6 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, color: "var(--bm-accent)", fontSize: 13, cursor: "pointer" }}>
            {showAll ? "Show fewer" : `Show all ${layer.claims.length}`}
          </button>
        )}
      </Disclosure>

      {layer.scoreBasis && (
        <Disclosure title="Where the score comes from" summary={`${layer.scoreBasis.inferenceSharePct}% rests on model inference alone`}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {layer.scoreBasis.components.map((comp) => (
              <li key={comp.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>
                <div>
                  <p style={{ ...bodyText, color: "var(--bm-text)", fontSize: 13.5 }}>{comp.label} <span style={{ ...smallText, fontSize: 12 }}>weight {comp.weight}</span></p>
                  <p style={{ ...smallText, fontSize: 12 }}>{comp.basedOn}</p>
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)" }}>{comp.score}</span>
                  <Chip color={comp.kind === "inference" ? "var(--bm-amber)" : comp.kind === "mixed" ? "var(--bm-accent)" : "var(--bm-green)"}>{comp.kind}</Chip>
                </div>
              </li>
            ))}
          </ul>
          <p style={smallText}>{layer.scoreBasis.note}</p>
        </Disclosure>
      )}

      {layer.hypotheses && layer.hypotheses.length > 0 && (
        <Disclosure title="The idea as separate bets" summary={`${layer.hypotheses.length} bets. Each can be wrong on its own.`}>
          {layer.hypotheses.map((h) => (
            <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: display, fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>{h.label}</span>
                <Chip color={h.status === "supported" ? "var(--bm-green)" : h.status === "contested" ? "var(--bm-red)" : h.status === "indirect_support" ? "var(--bm-amber)" : "var(--bm-text3)"}>
                  {h.status === "indirect_support" ? "indirect support only" : h.status}
                </Chip>
                <span style={{ ...smallText, fontSize: 12 }}>confidence {Math.round(h.confidence * 100)}%</span>
              </div>
              <p style={bodyText}>{h.statement}</p>
              {h.evidence.length > 0 && <p style={smallText}>For: {h.evidence.join(" ")}</p>}
              {h.counterevidence.length > 0 && <p style={{ ...smallText, color: "var(--bm-red)" }}>Against: {h.counterevidence.join(" ")}</p>}
              <p style={smallText}>Wrong if: {h.falsifier}</p>
              <p style={smallText}>Next: {h.nextExperiment}</p>
            </div>
          ))}
        </Disclosure>
      )}

      {layer.evidenceHierarchy && (
        <Disclosure title="What kind of proof is behind this" summary={layer.evidenceHierarchy.statement}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {layer.evidenceHierarchy.levels.map((l) => (
              <li key={l.level} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontFamily: mono, fontSize: 13, color: l.count === 0 && l.level === 1 ? "var(--bm-red)" : "var(--bm-text)", minWidth: 20 }}>{l.count}</span>
                <span style={bodyText}><strong style={{ color: "var(--bm-text)", fontWeight: 600 }}>{l.label}.</strong> {l.note}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {(layer.demandSplit || layer.riskExposure) && (
        <Disclosure title="Two numbers that are easy to confuse" summary="Demand in the market versus demand for your product, and risk versus uncertainty.">
          {layer.demandSplit && (
            <div>
              <p style={labelText}>Demand</p>
              <p style={{ ...bodyText, color: "var(--bm-text)" }}><strong style={{ fontSize: 20 }}>{layer.demandSplit.market}</strong> in the market, <strong style={{ fontSize: 20 }}>{layer.demandSplit.product}</strong> for your product</p>
              <p style={smallText}>{layer.demandSplit.basis}</p>
            </div>
          )}
          {layer.riskExposure && (
            <div>
              <p style={labelText}>Risk</p>
              <p style={{ ...bodyText, color: "var(--bm-text)" }}><strong style={{ fontSize: 20 }}>{layer.riskExposure.exposure}</strong> exposure, <strong style={{ fontSize: 20 }}>{layer.riskExposure.uncertainty}</strong> uncertainty</p>
              <p style={smallText}>Main unresolved: {layer.riskExposure.primaryUnresolved}. {layer.riskExposure.note}</p>
            </div>
          )}
        </Disclosure>
      )}

      {layer.changeMyMind && (
        <Disclosure title="What would change our mind" summary="What would count against the idea, and what would strengthen it.">
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <div>
              <p style={{ ...labelText, color: "var(--bm-red)" }}>Would count against it</p>
              <ul style={{ ...bodyText, margin: "4px 0 0", paddingLeft: 18, listStyle: "disc" }}>{layer.changeMyMind.kills.map((k) => <li key={k}>{k}</li>)}</ul>
            </div>
            <div>
              <p style={{ ...labelText, color: "var(--bm-green)" }}>Would strengthen it</p>
              <ul style={{ ...bodyText, margin: "4px 0 0", paddingLeft: 18, listStyle: "disc" }}>{layer.changeMyMind.strengthens.map((k) => <li key={k}>{k}</li>)}</ul>
            </div>
          </div>
        </Disclosure>
      )}

      {track && (track.resolved > 0 || track.open > 0) && (
        <Disclosure title="How these numbers have performed for you" summary={GRADE_COPY[track.grade].label}>
          <p style={bodyText}>{track.summary}</p>
          {track.adjustment.applied && <p style={{ ...smallText, color: "var(--bm-amber)" }}>This analysis is already adjusted for that record.</p>}
        </Disclosure>
      )}

      {layer.excludedCompetitors && layer.excludedCompetitors.length > 0 && (
        <p style={{ ...smallText, fontSize: 12 }}>
          Left out of the competitor list: {layer.excludedCompetitors.map((e) => `${e.name} (${e.reason.replace(/\.$/, "").toLowerCase()})`).join("; ")}.
        </p>
      )}
    </div>
  );
}

/** Competitor evidence quality, keyed by lower-cased name, for the market tab. */
export function competitorQuality(layer: EvidenceLayer | undefined): Record<string, { label: string; color: string; note: string }> {
  const out: Record<string, { label: string; color: string; note: string }> = {};
  for (const co of layer?.competitors ?? []) out[co.name.toLowerCase()] = { ...QUALITY[co.quality], note: co.note };
  return out;
}

/** The tests: the experiment on your actual claim, and what would prove each assumption wrong. */
export function TestSections({ layer, rec }: { layer: EvidenceLayer; rec: EvidenceRecorder }) {
  const t = layer.thesisTest;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {t && (
        <Disclosure title="The experiment that tests your actual idea" summary={t.thesis} defaultOpen>
          <p style={{ ...bodyText, color: "var(--bm-amber)" }}>{t.notThisTest}</p>
          <p style={bodyText}>{t.setup}</p>
          <div>
            <p style={labelText}>Measure</p>
            <ul style={{ ...bodyText, margin: "4px 0 0", paddingLeft: 18, listStyle: "disc" }}>{t.measure.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <dl style={{ margin: 0, display: "grid", gap: 8 }}>
            {([["Why this test", t.why], ["Based on", t.basedOn], ["You will learn", t.expectedLearning], ["If it fails", t.ifItFails]] as const).map(([k, v]) => (
              <div key={k}><dt style={{ ...labelText, display: "inline" }}>{k}: </dt><dd style={{ ...bodyText, display: "inline" }}>{v}</dd></div>
            ))}
          </dl>
          <RecordResult layer={layer} testId={t.id} hold={t.predictedHold} status={t.id ? rec.results[t.id] : undefined} rec={rec} />
        </Disclosure>
      )}
      {layer.falsifiers.length > 0 && (
        <Disclosure title="What would prove this wrong" summary={`${layer.falsifiers.length} ${layer.falsifiers.length === 1 ? "assumption" : "assumptions"}, each with a test`}>
          {layer.falsifiers.map((f) => (
            <div key={f.id ?? f.assumption} style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
              <p style={{ ...bodyText, color: "var(--bm-text)", fontWeight: 600 }}>{f.assumption}</p>
              <p style={bodyText}>Test: {f.test}</p>
              <p style={{ ...bodyText, color: "var(--bm-red)" }}>Wrong if: {f.provenWrongIf}</p>
              <RecordResult layer={layer} testId={f.id} hold={f.predictedHold} status={f.id ? rec.results[f.id] : undefined} rec={rec} />
            </div>
          ))}
        </Disclosure>
      )}
      {rec.error && <p role="alert" style={{ ...smallText, color: "var(--bm-red)" }}>{rec.error}</p>}
    </div>
  );
}

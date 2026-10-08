"use client";

/**
 * components/break-my-startup/BreakResultView.tsx
 *
 * The Break My Startup result, restructured for reading.
 *
 * Before: about fourteen boxes open at once, every section the same size.
 * Now: a ten-second read on top (verdict, biggest threat, how sure, where to
 * start) and four tabs underneath. Inside a tab, detail stays one tap away.
 * Nothing was removed: every field the pipeline returns still has a home.
 *
 *   Risks      what breaks first, and what could still work
 *   Proof      what the verdict rests on, conflicts, confidence detail
 *   Market     the five signals, competitors, how each analysis lens read it
 *   Next steps what to do first, the test, the plan, pivots
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Plus, RefreshCw, Save } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { Button } from "@/components/ui/button";
import { RadialGauge } from "@/components/charts";
import { sanitizeMarkdown } from "@/lib/sanitizeOutput";
import {
  ConfidenceSummary, ProofSections, TestSections, competitorQuality, useEvidenceRecorder,
} from "@/components/break/EvidenceSections";
import { Chip, Disclosure, afterFirstSentence, bodyText, body, display, firstSentence, labelText, mono, smallText } from "@/components/break-my-startup/ui";
import type { BreakResult, PivotItem, RiskItem, RiskSeverity } from "@/components/break-my-startup/viewTypes";

type TabId = "risks" | "proof" | "market" | "next";

const SEV_COLOR: Record<RiskSeverity, string> = {
  Critical: "var(--bm-red)", High: "var(--bm-amber)", Medium: "var(--bm-blue)", Low: "var(--bm-green)",
};
const THREAT_COLOR = { high: "var(--bm-red)", medium: "var(--bm-amber)", low: "var(--bm-green)" } as const;

export interface BreakResultViewProps {
  result: BreakResult;
  /** Save onto the chosen project, or turn a custom idea into a project. */
  saveMode: "project" | "new" | "none";
  saving: boolean; saved: boolean; onSave: () => void;
  addingProject: boolean; addedProjectId: string | null; onAddAsProject: () => void; addProjectError: string | null;
  onReset: () => void;
  onExplorePivot: (p: PivotItem) => void;
  outcomeSaving: string | null; onOutcome: (o: "completed" | "partial" | "overridden") => void;
  onUnlock: () => void;
}

function Hero({ result, onJump, onUnlock }: { result: BreakResult; onJump: (t: TabId) => void; onUnlock: () => void }) {
  const [more, setMore] = useState(false);
  const color = SEV_COLOR[result.overallRisk];
  const lead = firstSentence(result.summary, 220);
  const rest = afterFirstSentence(result.summary);
  const top = result.risks[0];
  const conclusion = result.evidence?.conclusion;
  const start = result.evidence?.nextMove?.action ?? result.brutal_advice;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      style={{ background: "var(--bm-bg2)", border: `1px solid ${color}55`, borderRadius: 18, padding: "clamp(18px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        {result.survival_probability !== undefined && (
          <div style={{ flexShrink: 0, margin: "0 auto" }}>
            <RadialGauge value={result.survival_probability} size={128} label="survive"
              thresholds={[{ min: 60, color: "var(--bm-green)" }, { min: 40, color: "var(--bm-amber)" }, { min: 0, color: "var(--bm-red)" }]} />
          </div>
        )}
        <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Chip color={color}>{result.overallRisk} risk</Chip>
            <span style={{ ...smallText, fontSize: 12 }}>The uncomfortable answers are the useful ones.</span>
          </div>
          <p style={{ fontFamily: display, fontSize: "clamp(19px, 3.4vw, 24px)", fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.02em", color: "var(--bm-text)", margin: 0 }}>{lead}</p>
          {rest && (
            <>
              {more && <div style={{ maxWidth: "68ch" }}><Markdown textSize={14}>{sanitizeMarkdown(rest)}</Markdown></div>}
              <button type="button" onClick={() => setMore((v) => !v)} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--bm-accent)", fontSize: 13, fontFamily: body }}>
                {more ? "Show less" : "Read the full verdict"}
              </button>
            </>
          )}
          {result.gated && (
            <button type="button" onClick={onUnlock} style={{ alignSelf: "flex-start", marginTop: 4, fontSize: 13, fontWeight: 700, color: "var(--bm-text-inv)", background: "var(--bm-accent)", border: "none", borderRadius: 10, padding: "9px 16px", cursor: "pointer" }}>
              Unlock the full analysis
            </button>
          )}
          {result.score_note && <p style={{ ...smallText, fontSize: 12 }}>{result.score_note}</p>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {top && (
          <KeyFact label="Biggest threat" tone={SEV_COLOR[top.severity]} onClick={() => onJump("risks")} action="See all risks">
            <strong style={{ color: "var(--bm-text)" }}>{top.category}.</strong> {firstSentence(top.description, 110)}
          </KeyFact>
        )}
        {conclusion && (
          <KeyFact label="How sure we are" tone="var(--bm-text3)" onClick={() => onJump("proof")} action="See the proof">
            <strong style={{ color: "var(--bm-text)" }}>{conclusion.pct}%, {conclusion.label.toLowerCase()}.</strong> Biggest unknown: {firstSentence(conclusion.primaryUncertainty, 90)}
          </KeyFact>
        )}
        {start && (
          <KeyFact label="Start here" tone="var(--bm-accent)" onClick={() => onJump("next")} action="See next steps">
            {firstSentence(start, 130)}
          </KeyFact>
        )}
      </div>
    </motion.div>
  );
}

function KeyFact({ label, tone, onClick, action, children }: { label: string; tone: string; onClick: () => void; action: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: "left", cursor: "pointer", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderTop: `3px solid ${tone}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, color: "inherit" }}>
      <span style={labelText}>{label}</span>
      <span style={{ ...bodyText, fontSize: 13.5, color: "var(--bm-text2)", flex: 1 }}>{children}</span>
      <span style={{ fontFamily: body, fontSize: 12, color: "var(--bm-accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>{action} <ArrowRight size={12} /></span>
    </button>
  );
}

function RiskRow({ risk, index, defaultOpen }: { risk: RiskItem; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const color = SEV_COLOR[risk.severity];
  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderLeft: `4px solid ${color}`, borderRadius: 12 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", background: "none", border: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: "var(--bm-text3)", minWidth: 18 }}>{index + 1}</span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{risk.category}</span>
            <Chip color={color}>{risk.severity}</Chip>
          </span>
          {!open && <span style={{ ...smallText, fontSize: 13 }}>{firstSentence(risk.description, 130)}</span>}
        </span>
        <ChevronDown size={16} style={{ color: "var(--bm-text3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px 46px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <p style={labelText}>How it fails</p>
            <div style={{ maxWidth: "68ch", marginTop: 2 }}><Markdown textSize={14}>{sanitizeMarkdown(risk.description)}</Markdown></div>
          </div>
          <div style={{ background: "var(--bm-bg3)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10 }}>
            <CheckCircle2 size={15} style={{ color: "var(--bm-green)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <p style={labelText}>How to de-risk it</p>
              <div style={{ maxWidth: "68ch", marginTop: 2 }}><Markdown textSize={13.5}>{sanitizeMarkdown(risk.mitigation)}</Markdown></div>
            </div>
          </div>
          {risk.relatedFocusAreas && risk.relatedFocusAreas.length > 0 && <FocusTags areas={risk.relatedFocusAreas} />}
        </div>
      )}
    </div>
  );
}

function FocusTags({ areas }: { areas?: string[] }) {
  if (!areas?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {areas.map((a) => (
        <span key={a} style={{ fontFamily: body, fontSize: 11.5, fontWeight: 600, color: "var(--bm-intel)", background: "var(--bm-intel-dim)", border: "1px solid var(--bm-intel-bd)", borderRadius: 99, padding: "2px 9px" }}>{a}</span>
      ))}
    </div>
  );
}

function RisksTab({ result }: { result: BreakResult }) {
  const counts = (["Critical", "High", "Medium", "Low"] as RiskSeverity[]).map((s) => ({ s, n: result.risks.filter((r) => r.severity === s).length })).filter((x) => x.n > 0);
  const [allWork, setAllWork] = useState(false);
  const work = result.surviveReasons ?? [];
  const shown = allWork ? work : work.slice(0, 3);
  const cov = result.focusAreaCoverage;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: 0, letterSpacing: "-0.01em" }}>What breaks first</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {counts.map((c) => <Chip key={c.s} color={SEV_COLOR[c.s]}>{c.n} {c.s.toLowerCase()}</Chip>)}
          </div>
        </div>
        {result.risks.map((r, i) => <RiskRow key={i} risk={r} index={i} defaultOpen={i === 0} />)}
      </section>

      {work.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: 0, letterSpacing: "-0.01em" }}>What could still work</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((reason, i) => (
              <li key={i} style={{ display: "flex", gap: 10, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderLeft: "3px solid var(--bm-green)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ minWidth: 0, maxWidth: "68ch" }}>
                  <Markdown textSize={14}>{sanitizeMarkdown(reason)}</Markdown>
                  <div style={{ marginTop: result.surviveReasonTags?.[i]?.length ? 6 : 0 }}><FocusTags areas={result.surviveReasonTags?.[i]} /></div>
                </div>
              </li>
            ))}
          </ul>
          {work.length > 3 && (
            <button type="button" onClick={() => setAllWork((v) => !v)} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, color: "var(--bm-accent)", fontSize: 13, cursor: "pointer" }}>
              {allWork ? "Show fewer" : `Show all ${work.length}`}
            </button>
          )}
        </section>
      )}

      {cov && cov.selected.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={labelText}>Your focus areas: {cov.addressed.length} of {cov.selected.length} came up in this result</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cov.selected.map((a) => {
              const ok = cov.addressed.includes(a);
              return <Chip key={a} color={ok ? "var(--bm-green)" : "var(--bm-text3)"}>{ok ? "Covered" : "Not covered"}: {a}</Chip>;
            })}
          </div>
          {cov.unaddressed.length > 0 && <p style={smallText}>Nothing in this run touched {cov.unaddressed.join(", ")} specifically. Worth a closer look or a re-run.</p>}
        </section>
      )}
    </div>
  );
}

const SIGNALS: Array<{ key: keyof NonNullable<BreakResult["signalScores"]>; label: string; goodWhen: "high" | "low"; plain: string }> = [
  { key: "demand", label: "Demand", goodWhen: "high", plain: "Is anyone looking for this?" },
  { key: "uniqueness", label: "Uniqueness", goodWhen: "high", plain: "Is it different from what exists?" },
  { key: "timing", label: "Timing", goodWhen: "high", plain: "Is now a good time?" },
  { key: "competition", label: "Competition", goodWhen: "low", plain: "How crowded is the space?" },
  { key: "risk", label: "Risk", goodWhen: "low", plain: "How likely is it to go wrong?" },
];

function MarketTab({ result }: { result: BreakResult }) {
  const q = competitorQuality(result.evidence);
  const sc = result.signalScores;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {sc && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>Five signals</h3>
          <p style={smallText}>Scored 0 to 100. For demand, uniqueness and timing, higher is better. For competition and risk, lower is better.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {SIGNALS.map((s) => {
              const v = Math.min(100, Math.max(0, sc[s.key]));
              const good = s.goodWhen === "high" ? v >= 60 : v <= 40;
              const bad = s.goodWhen === "high" ? v < 35 : v > 65;
              const color = good ? "var(--bm-green)" : bad ? "var(--bm-red)" : "var(--bm-amber)";
              return (
                <div key={s.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "4px 12px", alignItems: "baseline" }}>
                  <span style={{ ...bodyText, color: "var(--bm-text)" }}>{s.label} <span style={{ ...smallText, fontSize: 12 }}>{s.plain}</span></span>
                  <span style={{ fontFamily: display, fontSize: 17, fontWeight: 700, color }}>{v}</span>
                  <div style={{ gridColumn: "1 / -1", height: 6, borderRadius: 99, background: "var(--bm-bg4)", overflow: "hidden" }}>
                    <div style={{ width: `${v}%`, height: "100%", borderRadius: 99, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {result.competitorTable && result.competitorTable.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>Who you are up against</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {result.competitorTable.map((c) => {
              const ev = q[c.name.toLowerCase()];
              return (
                <div key={c.name} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: "var(--bm-text)", minWidth: 0, overflowWrap: "anywhere" }}>
                      {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{c.name}</a> : c.name}
                    </span>
                    <Chip color={THREAT_COLOR[c.threat_level]}>{c.threat_level} threat</Chip>
                  </div>
                  <div>
                    <p style={labelText}>Where they are weak</p>
                    <p style={{ ...bodyText, fontSize: 13.5 }}>{c.weakness}</p>
                  </div>
                  {ev && <p style={{ ...smallText, fontSize: 12 }}><span style={{ color: ev.color }}>{ev.label}.</span> {ev.note}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {result.agents && result.agents.length > 0 && (
        <Disclosure title="How each analysis lens read it" summary={`${result.agents.length} lenses looked at your idea separately`}>
          {result.agents.map((a) => (
            <div key={a.name} style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: display, fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>{a.name}</span>
                <Chip color={a.status === "complete" ? "var(--bm-green)" : "var(--bm-amber)"}>{a.status}</Chip>
              </div>
              <div style={{ maxWidth: "68ch", marginTop: 4 }}><Markdown textSize={13.5}>{sanitizeMarkdown(a.summary)}</Markdown></div>
            </div>
          ))}
        </Disclosure>
      )}
    </div>
  );
}

function PivotCard({ pivot, result, onExplore }: { pivot: PivotItem; result: BreakResult; onExplore: () => void }) {
  const chk = result.evidence?.pivotChecks?.find((c) => c.title === pivot.title);
  return (
    <div style={{ flex: "0 0 min(300px, 82%)", scrollSnapAlign: "start", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: display, fontSize: 16, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.25 }}>{pivot.title}</span>
        {chk && <Chip color={chk.validatesOriginal ? "var(--bm-green)" : "var(--bm-amber)"}>{chk.relation === "same_problem" ? "Same problem" : chk.relation === "adjacent" ? "Adjacent problem" : "Different problem"}</Chip>}
      </div>
      <p style={{ ...bodyText, fontSize: 13.5 }}>{pivot.description}</p>
      <dl style={{ margin: 0, display: "grid", gap: 6 }}>
        <div><dt style={{ ...labelText, display: "inline" }}>For: </dt><dd style={{ ...bodyText, fontSize: 13, display: "inline" }}>{pivot.target_niche}</dd></div>
        <div><dt style={{ ...labelText, display: "inline" }}>Why: </dt><dd style={{ ...bodyText, fontSize: 13, display: "inline" }}>{pivot.why_better}</dd></div>
        {pivot.key_change && <div><dt style={{ ...labelText, display: "inline" }}>Change: </dt><dd style={{ ...bodyText, fontSize: 13, display: "inline" }}>{pivot.key_change}</dd></div>}
      </dl>
      {chk && <p style={{ ...smallText, fontSize: 12 }}>{chk.reason}</p>}
      <FocusTags areas={pivot.relatedFocusAreas} />
      <button type="button" onClick={onExplore} style={{ marginTop: "auto", border: "1px solid var(--bm-accent-bd)", background: "transparent", color: "var(--bm-accent)", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        Stress test this pivot <ArrowRight size={13} />
      </button>
    </div>
  );
}

function NextTab({ result, props, rec }: { result: BreakResult; props: BreakResultViewProps; rec: ReturnType<typeof useEvidenceRecorder> }) {
  const mv = result.evidence?.nextMove;
  const hold = Boolean(mv?.holdBuilding);
  const plan = result.executionPlan;
  const ra = result.reflexionAction;
  const cols: Array<[string, string[] | undefined]> = plan ? [["Build", plan.mvp_roadmap], ["First actions", plan.first_10_actions], ["Reach customers", plan.gtm_plan]] : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {(mv || result.brutal_advice) && (
        <section style={{ background: "var(--bm-bg2)", border: `1px solid ${hold ? "var(--bm-accent)" : "var(--bm-border)"}`, borderRadius: 16, padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={labelText}>{mv ? (hold ? "Do this before building anything" : "Best next test") : "The blunt version"}</span>
          {mv ? (
            <>
              <p style={{ fontFamily: display, fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: "var(--bm-text)", margin: 0, letterSpacing: "-0.01em", maxWidth: "46ch" }}>{mv.action}</p>
              <p style={{ ...bodyText, maxWidth: "68ch" }}>{mv.why}</p>
              {mv.doNotBuildYet.length > 0 && (
                <div><p style={labelText}>Not yet</p><ul style={{ ...bodyText, margin: "4px 0 0", paddingLeft: 18, listStyle: "disc" }}>{mv.doNotBuildYet.map((t) => <li key={t}>{t}</li>)}</ul></div>
              )}
            </>
          ) : (
            <div style={{ maxWidth: "68ch" }}><Markdown textSize={15}>{sanitizeMarkdown(result.brutal_advice ?? "")}</Markdown></div>
          )}
          {mv && result.brutal_advice && (
            <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 12, display: "flex", gap: 10 }}>
              <AlertTriangle size={15} style={{ color: "var(--bm-amber)", flexShrink: 0, marginTop: 3 }} />
              <div style={{ minWidth: 0, maxWidth: "68ch" }}><p style={labelText}>The blunt version</p><Markdown textSize={14}>{sanitizeMarkdown(result.brutal_advice)}</Markdown></div>
            </div>
          )}
        </section>
      )}

      {result.evidence && <TestSections layer={result.evidence} rec={rec} />}

      {plan && hold && (
        <Disclosure title="Build plan on hold" summary="Run the interviews first, then regenerate this plan with what you learn.">
          <p style={bodyText}>A build roadmap was generated, but the biggest unknown is whether the problem is real and painful enough to pay for. Do not build these things yet.</p>
        </Disclosure>
      )}
      {plan && !hold && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>Recovery plan</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {cols.map(([title, items]) => (
              <div key={title} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontFamily: display, fontSize: 14, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 8px" }}>{title}</p>
                <ol style={{ margin: 0, paddingLeft: 20, listStyle: "decimal", display: "flex", flexDirection: "column", gap: 8 }}>
                  {(items ?? []).slice(0, 4).map((it) => <li key={it} style={{ ...bodyText, fontSize: 13.5 }}>{it}</li>)}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      {ra && (
        <Disclosure title="Why this action" summary={typeof ra.confidence === "number" ? `${Math.round(ra.confidence * 100)}% confidence` : undefined}>
          {ra.rationale ? <div style={{ maxWidth: "68ch" }}><Markdown textSize={14}>{sanitizeMarkdown(ra.rationale)}</Markdown></div> : <p style={bodyText}>This is the action the Reflexion pipeline recommends.</p>}
          {ra.log_row_id && (
            <div>
              <p style={labelText}>Did you do it?</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {(["completed", "partial", "overridden"] as const).map((o) => (
                  <Button key={o} variant="ghost" size="sm" onClick={() => props.onOutcome(o)} loading={props.outcomeSaving === o}>Mark {o}</Button>
                ))}
              </div>
            </div>
          )}
        </Disclosure>
      )}

      {result.pivots && result.pivots.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={15} style={{ color: "var(--bm-accent)" }} />
            <h3 style={{ fontFamily: display, fontSize: 18, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>If you changed direction</h3>
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x proximity", paddingBottom: 6 }}>
            {result.pivots.map((p) => <PivotCard key={p.title} pivot={p} result={result} onExplore={() => props.onExplorePivot(p)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function BreakResultView(props: BreakResultViewProps) {
  const { result } = props;
  const rec = useEvidenceRecorder(result.evidence);
  const [tab, setTab] = useState<TabId>("risks");

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: "risks", label: "Risks", count: result.risks.length },
    ...(result.evidence ? [{ id: "proof" as TabId, label: "Proof" }] : []),
    { id: "market", label: "Market" },
    { id: "next", label: "Next steps" },
  ];
  const jump = (t: TabId) => {
    setTab(tabs.some((x) => x.id === t) ? t : "risks");
    if (typeof window !== "undefined") document.getElementById("break-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Hero result={result} onJump={jump} onUnlock={props.onUnlock} />

      {result.isSynthetic && (
        <div role="alert" style={{ display: "flex", gap: 10, background: "rgba(245,158,11,0.10)", border: "1px solid var(--bm-amber)", borderRadius: 12, padding: "12px 16px" }}>
          <AlertTriangle size={16} style={{ color: "var(--bm-amber)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ ...bodyText, color: "var(--bm-amber)", fontWeight: 600 }}>The analysis service was unreachable</p>
            <p style={smallText}>All five analysis lenses fell back to default values, so the score is an estimate, not a reading of your idea. Try again in a few minutes.</p>
          </div>
        </div>
      )}

      <div id="break-tabs" role="tablist" aria-label="Result sections" style={{ display: "flex", gap: 4, padding: 4, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, position: "sticky", top: 8, zIndex: 5, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            style={{ flex: "1 0 auto", padding: "9px 14px", borderRadius: 10, border: 0, cursor: "pointer", fontFamily: body, fontSize: 13.5, fontWeight: tab === t.id ? 700 : 500, background: tab === t.id ? "var(--bm-bg5)" : "transparent", color: tab === t.id ? "var(--bm-text)" : "var(--bm-text3)", whiteSpace: "nowrap" }}>
            {t.label}{t.count !== undefined && <span style={{ fontFamily: mono, fontSize: 11.5, marginLeft: 6, color: "var(--bm-text3)" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {tab === "risks" && <RisksTab result={result} />}
          {tab === "proof" && result.evidence && (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <section style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px" }}><ConfidenceSummary layer={result.evidence} /></section>
              <ProofSections layer={result.evidence} rec={rec} />
            </div>
          )}
          {tab === "market" && <MarketTab result={result} />}
          {tab === "next" && <NextTab result={result} props={props} rec={rec} />}
        </motion.div>
      </AnimatePresence>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--bm-border)", paddingTop: 16 }}>
        {props.saveMode === "project" && (
          <Button variant="secondary" size="sm" onClick={props.onSave} loading={props.saving} disabled={props.saved}>
            {props.saved ? <><CheckCircle2 size={13} style={{ color: "var(--bm-green)" }} />Saved to project</> : <><Save size={13} />Save to project</>}
          </Button>
        )}
        {props.saveMode === "new" && (
          <Button variant="secondary" size="sm" onClick={props.onAddAsProject} loading={props.addingProject} disabled={Boolean(props.addedProjectId)}>
            {props.addedProjectId ? <><CheckCircle2 size={13} style={{ color: "var(--bm-green)" }} />Added as project</> : <><Plus size={13} />Add as project</>}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={props.onReset}><RefreshCw size={13} />Run again</Button>
        {props.addProjectError && <span style={{ ...smallText, color: "var(--bm-red)" }}>{props.addProjectError}</span>}
        {props.addedProjectId && <span style={smallText}>Saved as a new project. You can find it in your projects list.</span>}
      </div>
    </div>
  );
}

"use client";

import React from "react";
import type { AgentKind, CrewStat, EvidenceMix, RunLite, Verdict } from "@/lib/agentWorkspace";
import { caseNumber } from "@/lib/agentWorkspace";

const MONO = "'DM Mono', ui-monospace, monospace";

export const AGENT_THEME: Record<AgentKind, { c: string; dim: string; bd: string; codename: string; role: string; looksFor: string[]; sla: string }> = {
  research: {
    c: "var(--bm-blue, #6aa8e8)", dim: "color-mix(in srgb, var(--bm-blue, #6aa8e8) 12%, transparent)", bd: "color-mix(in srgb, var(--bm-blue, #6aa8e8) 35%, transparent)",
    codename: "SCOUT", role: "Field researcher",
    looksFor: ["Is anyone searching for this?", "Is the market growing or shrinking?", "What are communities saying?", "Workarounds that prove the pain"], sla: "30–90s",
  },
  validation: {
    c: "var(--bm-green)", dim: "var(--bm-green-dim)", bd: "var(--bm-green-bd)",
    codename: "PROOF", role: "Assumption tester",
    looksFor: ["Which assumptions must be true", "Painkiller or vitamin", "Willingness-to-pay signals", "Where to pivot if it fails"], sla: "30–90s",
  },
  competitor: {
    c: "var(--bm-red)", dim: "var(--bm-red-dim)", bd: "rgba(224,82,82,0.30)",
    codename: "RIVAL", role: "Competitive analyst",
    looksFor: ["Who already exists", "What they do badly", "Barriers to entry", "The wedge that is left"], sla: "30–90s",
  },
};

export const VERDICT_THEME: Record<Verdict, { c: string; dim: string; bd: string; label: string }> = {
  proceed: { c: "var(--bm-green)", dim: "var(--bm-green-dim)", bd: "var(--bm-green-bd)", label: "PROCEED" },
  pivot: { c: "var(--bm-accent)", dim: "var(--bm-accent-dim)", bd: "var(--bm-accent-bd)", label: "PIVOT" },
  kill: { c: "var(--bm-red)", dim: "var(--bm-red-dim)", bd: "var(--bm-red-bd)", label: "KILL" },
  inconclusive: { c: "var(--bm-text3)", dim: "var(--bm-bg3)", bd: "var(--bm-border)", label: "INCONCLUSIVE" },
};

/** A drawn emblem per agent, not an emoji: radar sweep, shield, target grid. */
export function AgentEmblem({ agent, size = 34, active = false }: { agent: AgentKind; size?: number; active?: boolean }) {
  const t = AGENT_THEME[agent];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="46" height="46" rx="10" fill="none" stroke={t.bd} />
      {agent === "research" && (<g fill="none" stroke={t.c} strokeWidth="1.6" strokeLinecap="round">
        <circle cx="24" cy="24" r="14" opacity=".35" /><circle cx="24" cy="24" r="8" opacity=".6" />
        <path d="M24 24 L35 15" />{active && <circle cx="35" cy="15" r="2.2" fill={t.c} />}
        <circle cx="24" cy="24" r="1.8" fill={t.c} />
      </g>)}
      {agent === "validation" && (<g fill="none" stroke={t.c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 9 L36 14 V24 C36 31 31 36 24 39 C17 36 12 31 12 24 V14 Z" />
        <path d="M18.5 24.5 L22.5 28.5 L30 20" />
      </g>)}
      {agent === "competitor" && (<g fill="none" stroke={t.c} strokeWidth="1.6" strokeLinecap="round">
        <circle cx="24" cy="24" r="12" /><circle cx="24" cy="24" r="5.5" />
        <path d="M24 8 V15 M24 33 V40 M8 24 H15 M33 24 H40" /><circle cx="24" cy="24" r="1.6" fill={t.c} />
      </g>)}
    </svg>
  );
}

const label: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-text3)" };

/** Corner-bracketed dossier surface used across the workspace. */
export function Dossier({ children, accent, style }: { children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderLeft: accent ? `3px solid ${accent}` : "1px solid var(--bm-border)", borderRadius: 10, minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

/** Verdict trail: one dot per completed run, coloured by verdict, sized by confidence. */
export function VerdictTrail({ trail }: { trail: CrewStat["trail"] }) {
  if (!trail.length) return <span style={{ ...label, textTransform: "none", letterSpacing: 0 }}>No completed runs yet</span>;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 22 }} aria-label="Recent verdicts">
      {trail.map((t) => {
        const v = VERDICT_THEME[t.verdict ?? "inconclusive"];
        return <span key={t.id} title={`${v.label} · ${t.confidence}% confidence`} style={{ width: 8, height: Math.max(6, Math.round((t.confidence / 100) * 22)), borderRadius: 2, background: v.c }} />;
      })}
    </div>
  );
}

export function CrewCard({ agent, name, tagline, stat, onDeploy, deploying, locked, selected }: {
  agent: AgentKind; name: string; tagline: string; stat: CrewStat; onDeploy: () => void; deploying: boolean; locked: boolean; selected?: boolean;
}) {
  const t = AGENT_THEME[agent];
  const lv = stat.lastVerdict ? VERDICT_THEME[stat.lastVerdict] : null;
  return (
    <Dossier accent={t.c} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, borderColor: selected ? t.bd : undefined }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <AgentEmblem agent={agent} />
        <div style={{ minWidth: 0, flex: "1 1 120px", overflowWrap: "anywhere" }}>
          <div style={{ ...label, color: t.c }}>{t.codename} · {t.role}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)", marginTop: 2 }}>{name}</div>
        </div>
        {lv && <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: lv.c, background: "transparent", border: `1px solid ${lv.bd}`, borderRadius: 99, padding: "3px 8px", whiteSpace: "nowrap" }}>LAST: {lv.label}</span>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55, overflowWrap: "anywhere" }}>{tagline}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
        {t.looksFor.map((q) => (
          <li key={q} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--bm-text2)", minWidth: 0 }}>
            <span aria-hidden="true" style={{ color: t.c, fontFamily: MONO, flexShrink: 0 }}>›</span>
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{q}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, paddingTop: 12, borderTop: "1px dashed var(--bm-border)" }}>
        {[
          { k: "Runs", v: String(stat.completed) },
          { k: "Avg confidence", v: stat.avgConfidence === null ? "—" : `${stat.avgConfidence}%` },
          { k: "You confirmed", v: stat.confirmRate === null ? "—" : `${stat.confirmRate}%` },
        ].map((x) => (
          <div key={x.k} style={{ minWidth: 0 }}><div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>{x.v}</div><div style={{ ...label, overflowWrap: "anywhere" }}>{x.k}</div></div>
        ))}
      </div>
      <VerdictTrail trail={stat.trail} />
      <button onClick={onDeploy} disabled={deploying || locked}
        style={{ padding: "8px 10px", borderRadius: 8, maxWidth: "100%", overflowWrap: "anywhere", border: `1px solid ${locked ? "var(--bm-border)" : t.bd}`, background: "transparent", color: locked ? "var(--bm-text4)" : t.c, fontWeight: 600, fontSize: 12.5, cursor: deploying || locked ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {locked ? "Builder plan" : deploying ? "Deploying…" : `Deploy ${t.codename} · ~${t.sla}`}
      </button>
    </Dossier>
  );
}

/** Live operations console: cycle ticks, current action line, and a sweep bar. */
export function OpsConsole({ run, actions }: { run: RunLite & { mission: string; current_action: string | null }; actions: readonly string[] }) {
  const t = AGENT_THEME[run.agent_type];
  const max = Math.max(1, run.max_iterations ?? 4);
  const cur = run.iteration ?? 0;
  return (
    <Dossier accent={t.c} style={{ padding: 14 }}>
      <style>{`@keyframes bm-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@keyframes bm-blink{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <AgentEmblem agent={run.agent_type} active />
        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          <div style={{ ...label, color: t.c }}>{caseNumber(run.id)} · {t.codename} ON MISSION</div>
          <div style={{ fontSize: 13, color: "var(--bm-text)", marginTop: 3, lineHeight: 1.45 }}>{run.mission}</div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: t.c, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: t.c, animation: "bm-blink 1.2s infinite" }} />LIVE
        </span>
      </div>
      <div style={{ position: "relative", height: 4, background: "var(--bm-bg4)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, width: "30%", background: t.c, opacity: 0.8, animation: "bm-sweep 1.8s linear infinite" }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }} aria-label={`Research cycle ${cur} of ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ height: 6, borderRadius: 3, background: i < cur ? t.c : "var(--bm-bg4)" }} />
            <div style={{ ...label, marginTop: 4, textAlign: "center" }}>Cycle {i + 1}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, background: "var(--bm-bg)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 6, overflowWrap: "anywhere" }}>
        {actions.map((a, i) => {
          const live = run.current_action ? a === run.current_action : i === Math.min(actions.length - 1, cur);
          return <div key={a} style={{ color: live ? t.c : "var(--bm-text3)" }}>{live ? "▸" : "·"} {a}</div>;
        })}
        {run.current_action && !actions.includes(run.current_action) && <div style={{ color: t.c }}>▸ {run.current_action}</div>}
        <div style={{ color: "var(--bm-text3)" }}>{run.signals_found} signal{run.signals_found === 1 ? "" : "s"} logged so far</div>
      </div>
    </Dossier>
  );
}

/** Evidence ledger: for/against split, per-cycle stacked columns, review progress. */
export function EvidenceLedger({ mix }: { mix: EvidenceMix }) {
  if (!mix.total) return null;
  const maxCycle = Math.max(1, ...mix.byCycle.map((c) => c.positive + c.negative));
  const pPct = Math.round((mix.positive / mix.total) * 100);
  return (
    <Dossier style={{ padding: 14 }}>
      <div style={{ ...label, marginBottom: 12 }}>Evidence ledger</div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--bm-bg4)" }}>
        <div style={{ width: `${pPct}%`, background: "var(--bm-green)" }} />
        <div style={{ flex: 1, background: "var(--bm-red)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0 16px", fontSize: 12 }}>
        <span style={{ color: "var(--bm-green)" }}>{mix.positive} for</span>
        <span style={{ color: "var(--bm-red)" }}>{mix.negative} against</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 70, marginBottom: 6 }}>
        {mix.byCycle.map((c) => (
          <div key={c.cycle} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 2 }} title={`Cycle ${c.cycle}: ${c.positive} for, ${c.negative} against`}>
            <div style={{ height: `${(c.negative / maxCycle) * 100}%`, background: "var(--bm-red)", borderRadius: 3, opacity: 0.85 }} />
            <div style={{ height: `${(c.positive / maxCycle) * 100}%`, background: "var(--bm-green)", borderRadius: 3, opacity: 0.85 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>{mix.byCycle.map((c) => <div key={c.cycle} style={{ ...label, flex: 1, textAlign: "center" }}>C{c.cycle}</div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--bm-border)" }}>
        {[{ k: "Pending", v: mix.pending, c: "var(--bm-accent)" }, { k: "Confirmed", v: mix.confirmed, c: "var(--bm-green)" }, { k: "Rejected", v: mix.rejected, c: "var(--bm-red)" }].map((x) => (
          <div key={x.k} style={{ minWidth: 0 }}><div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: x.c }}>{x.v}</div><div style={{ ...label, overflowWrap: "anywhere" }}>{x.k}</div></div>
        ))}
      </div>
      {mix.avgConfidence !== null && <div style={{ ...label, marginTop: 10 }}>Average finding confidence {mix.avgConfidence}%</div>}
    </Dossier>
  );
}

export function VerdictStamp({ verdict, label }: { verdict: Verdict; label?: string }) {
  const v = VERDICT_THEME[verdict];
  return (
    <span style={{ display: "inline-block", fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em", fontSize: 11, color: v.c, border: `2px solid ${v.c}`, borderRadius: 6, padding: "2px 8px", background: "transparent" }}>{label ?? v.label}</span>
  );
}

export function CaseArchive({ runs, activeId, onOpen }: { runs: Array<RunLite & { mission: string }>; activeId?: string | null; onOpen: (id: string) => void }) {
  const done = runs.filter((r) => r.status === "complete");
  if (!done.length) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ ...label, marginBottom: 10 }}>Case archive · {done.length} on file</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8 }}>
        {done.slice(0, 12).map((r) => {
          const t = AGENT_THEME[r.agent_type]; const v = VERDICT_THEME[r.verdict ?? "inconclusive"];
          return (
            <button key={r.id} onClick={() => onOpen(r.id)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", minWidth: 0, maxWidth: "100%", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", background: activeId === r.id ? "var(--bm-bg3)" : "var(--bm-bg2)", border: `1px solid ${activeId === r.id ? t.bd : "var(--bm-border)"}` }}>
              <AgentEmblem agent={r.agent_type} size={30} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...label, color: t.c }}>{caseNumber(r.id)} · {new Date(r.started_at).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                <div style={{ fontSize: 12.5, color: "var(--bm-text2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.mission}</div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: v.c, flexShrink: 0, textAlign: "right" }}>{v.label} · {r.confidence_pct}%</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Page header: title, blurb and the three headline counts. Counts stay inside the page on phones. */
export function AgentsHeader({ stats }: { stats: Array<{ k: string; v: number }> }) {
  return (
    <header style={{ marginBottom: 24, display: "flex", gap: 20, justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", minWidth: 0 }}>
      <div style={{ flex: "1 1 280px", maxWidth: 560, minWidth: 0 }}>
        <div style={{ ...label, marginBottom: 8 }}>Agent Workforce · Mission control</div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 6px", letterSpacing: "-0.025em" }}>Your startup crew</h1>
        <p style={{ fontSize: 12.5, color: "var(--bm-text3)", margin: 0, lineHeight: 1.55 }}>
          Three specialists research, test and size up your idea. Each opens a case file. You review every finding, and your decision is saved with how well it is supported.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, flex: "0 1 330px", minWidth: 0 }}>
        {stats.map((x) => (
          <div key={x.k} style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1 }}>{x.v}</div>
            <div style={{ ...label, marginTop: 4, overflowWrap: "anywhere" }}>{x.k}</div>
          </div>
        ))}
      </div>
    </header>
  );
}

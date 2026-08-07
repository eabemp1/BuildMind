"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BrainCircuit, CheckCircle2, CircleHelp, Clock3, Eye, GitBranch, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

type Belief = { belief: string; why: string; evidence: string[]; confidence: number; trend: "strengthening" | "weakening" | "persistent" | "emerging"; last_updated: string; contradictory_evidence: string[] };
type MirrorResponse = { ok: boolean; data?: { mirror: { beliefs: Belief[]; recent_changes: string[]; strengthening_patterns: string[]; weakening_patterns: string[]; may_be_wrong_about: string[]; self_reported_accuracy: { sample_size: number; accuracy_pct: number | null; trend: string; summary: string }; generated_at: string }; relationship_chain: { narrative: string }; relationship_graph_summary: { nodes: number; edges: number } } };

const trendColor: Record<Belief["trend"], string> = { strengthening: "var(--bm-green)", weakening: "var(--bm-red)", persistent: "var(--bm-accent)", emerging: "var(--bm-text3)" };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'DM Mono', monospace", color: "var(--bm-text4)", fontSize: 10, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}

function Stat({ label, value, accent = "var(--bm-text)" }: { label: string; value: string | number; accent?: string }) {
  return <div style={{ minWidth: 110 }}><Eyebrow>{label}</Eyebrow><div style={{ fontSize: 19, fontWeight: 750, color: accent }}>{value}</div></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FounderMirrorPage() {
  const [data, setData] = useState<MirrorResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [correction, setCorrection] = useState("");
  const [correctionStatus, setCorrectionStatus] = useState("");

  useEffect(() => {
    fetch("/api/founder-context/mirror", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: MirrorResponse) => setData(json.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  async function submitCorrection() {
    const text = correction.trim();
    if (!text) return;
    setCorrectionStatus("Saving correction...");
    try {
      const response = await fetch("/api/founder-context/mirror/correction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ belief: "General Founder Mirror model", correction: text }) });
      if (!response.ok) throw new Error("Correction failed");
      setCorrection("");
      setCorrectionStatus("Saved. BuildMind will retain this as founder-provided evidence.");
    } catch {
      setCorrectionStatus("Could not save the correction. Please try again.");
    }
  }

  if (loading) return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "38px 20px", color: "var(--bm-text3)" }}>Building your founder model...</main>;
  if (!data) return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "38px 20px", color: "var(--bm-text3)" }}>Founder Mirror is waiting for enough observed activity to form a useful model.</main>;

  const { mirror, relationship_chain: chain, relationship_graph_summary: graph } = data;
  const accuracy = mirror.self_reported_accuracy.accuracy_pct;

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "30px 20px 52px", color: "var(--bm-text)" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 22, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ maxWidth: 650 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bm-accent)", marginBottom: 10 }}><BrainCircuit size={17} /><Eyebrow>Founder Mirror</Eyebrow></div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, lineHeight: 1.15, margin: "0 0 9px", color: "var(--bm-text)" }}>Your operating model, observed over time.</h1>
          <p style={{ margin: 0, color: "var(--bm-text2)", fontSize: 14, lineHeight: 1.65 }}>Not a personality profile. This is BuildMind's current, revisable view of the behavior shaping your startup decisions.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--bm-text3)", fontSize: 12 }}><RefreshCw size={13} />Updated {formatDate(mirror.generated_at)}</div>
      </header>

      <section style={{ border: "1px solid var(--bm-border2)", borderRadius: 8, background: "var(--bm-bg2)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 0 }}>
          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--bm-border)" }}>
            <Eyebrow>Model reliability</Eyebrow>
            <div style={{ display: "flex", gap: 9, alignItems: "center", color: "var(--bm-text)" }}><ShieldCheck size={18} color="var(--bm-accent)" /><span style={{ fontSize: 14, lineHeight: 1.45 }}>{mirror.self_reported_accuracy.summary}</span></div>
          </div>
          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--bm-border)" }}><Stat label="Match rate" value={accuracy == null ? "Learning" : `${accuracy}%`} accent="var(--bm-accent)" /></div>
          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--bm-border)" }}><Stat label="Outcomes" value={mirror.self_reported_accuracy.sample_size} /></div>
          <div style={{ padding: "18px 20px" }}><Stat label="Trend" value={mirror.self_reported_accuracy.trend} accent={mirror.self_reported_accuracy.trend === "down" ? "var(--bm-red)" : "var(--bm-green)"} /></div>
        </div>
      </section>

      <section style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}><div><Eyebrow>Behavior-derived beliefs</Eyebrow><div style={{ fontSize: 16, fontWeight: 700 }}>What BuildMind currently believes</div></div><span style={{ color: "var(--bm-text4)", fontSize: 12 }}>{mirror.beliefs.length} active beliefs</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 10 }}>
          {mirror.beliefs.map((belief, index) => <article key={`${belief.belief}-${index}`} style={{ border: "1px solid var(--bm-border)", borderRadius: 8, background: "var(--bm-bg2)", padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}><h2 style={{ margin: 0, color: "var(--bm-text)", fontSize: 14, lineHeight: 1.45 }}>{belief.belief}</h2><span style={{ color: trendColor[belief.trend], fontSize: 10, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", flex: "0 0 auto" }}>{belief.trend}</span></div>
            <p style={{ margin: 0, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.55 }}>{belief.why}</p>
            <div style={{ height: 4, background: "var(--bm-bg3)", overflow: "hidden", borderRadius: 2 }}><div style={{ height: "100%", width: `${Math.round(belief.confidence * 100)}%`, background: "var(--bm-accent)" }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--bm-text4)", fontSize: 11 }}><span>{Math.round(belief.confidence * 100)}% confidence</span><span>Updated {formatDate(belief.last_updated)}</span></div>
            {belief.evidence.length > 0 && <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 10 }}><Eyebrow>Evidence</Eyebrow>{belief.evidence.slice(0, 2).map((item, itemIndex) => <div key={`${item}-${itemIndex}`} style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.45, display: "flex", gap: 6 }}><CheckCircle2 size={12} color="var(--bm-accent)" style={{ flex: "0 0 auto", marginTop: 2 }} />{item}</div>)}</div>}
            {belief.contradictory_evidence.length > 0 && <div style={{ color: "var(--bm-text3)", fontSize: 11, lineHeight: 1.45, display: "flex", gap: 6 }}><CircleHelp size={12} color="var(--bm-text4)" style={{ flex: "0 0 auto", marginTop: 2 }} />Contradictory founder input: {belief.contradictory_evidence[0]}</div>}
          </article>)}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ borderTop: "1px solid var(--bm-border2)", paddingTop: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><Activity size={15} color="var(--bm-accent)" /><div><Eyebrow>Change detection</Eyebrow><div style={{ fontSize: 15, fontWeight: 700 }}>What moved in your model</div></div></div>
          <div style={{ display: "grid", gap: 8 }}>{(mirror.recent_changes.length ? mirror.recent_changes : ["No meaningful behavioral change detected yet."]).map((item, index) => <div key={`${item}-${index}`} style={{ borderLeft: "2px solid var(--bm-accent)", paddingLeft: 11, color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{item}</div>)}</div>
          {(mirror.strengthening_patterns.length > 0 || mirror.weakening_patterns.length > 0) && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 15 }}><div><Eyebrow>Strengthening</Eyebrow><div style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.5 }}>{mirror.strengthening_patterns[0] ?? "No pattern strengthening yet."}</div></div><div><Eyebrow>Weakening</Eyebrow><div style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.5 }}>{mirror.weakening_patterns[0] ?? "No pattern weakening yet."}</div></div></div>}
        </div>
        <div style={{ border: "1px solid var(--bm-border)", borderRadius: 8, background: "var(--bm-bg3)", padding: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><AlertTriangle size={15} color="var(--bm-accent)" /><div><Eyebrow>Model uncertainty</Eyebrow><div style={{ fontSize: 15, fontWeight: 700 }}>What may be wrong</div></div></div>
          <div style={{ display: "grid", gap: 8 }}>{mirror.may_be_wrong_about.map((item, index) => <div key={`${item}-${index}`} style={{ color: "var(--bm-text2)", fontSize: 12, lineHeight: 1.55 }}>{item}</div>)}</div>
          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 12, marginTop: 13 }}><label htmlFor="founder-mirror-correction" style={{ display: "block", color: "var(--bm-text2)", fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>Correct BuildMind when this model misses context.</label><textarea id="founder-mirror-correction" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="For example: I do customer research outside BuildMind." rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: "1px solid var(--bm-border2)", borderRadius: 6, padding: 10, background: "var(--bm-bg)", color: "var(--bm-text)", fontSize: 12, lineHeight: 1.5 }} /><div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}><button type="button" onClick={submitCorrection} disabled={!correction.trim()} style={{ display: "inline-flex", gap: 7, alignItems: "center", border: "1px solid var(--bm-accent-bd)", borderRadius: 6, padding: "8px 10px", background: "var(--bm-accent-dim)", color: "var(--bm-accent)", fontSize: 12, cursor: correction.trim() ? "pointer" : "not-allowed", opacity: correction.trim() ? 1 : .5 }}><Eye size={13} />Correct model</button>{correctionStatus && <span style={{ color: "var(--bm-text4)", fontSize: 11 }}>{correctionStatus}</span>}</div></div>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--bm-border2)", paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><GitBranch size={15} color="var(--bm-accent)" /><div><Eyebrow>Decision continuity</Eyebrow><div style={{ fontSize: 15, fontWeight: 700 }}>The evidence chain behind the current model</div></div></div>
        <p style={{ margin: "0 0 10px", color: "var(--bm-text3)", fontSize: 13, lineHeight: 1.6 }}>{chain.narrative || "No decision relationship chain is available yet."}</p>
        <div style={{ display: "flex", gap: 16, color: "var(--bm-text4)", fontSize: 12 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock3 size={13} />{graph.nodes} observed entities</span><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><ArrowUpRight size={13} />{graph.edges} connected relationships</span></div>
      </section>
    </main>
  );
}

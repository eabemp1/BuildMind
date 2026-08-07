"use client";

import { useEffect, useState } from "react";

type MirrorResponse = {
  ok: boolean;
  data?: {
    mirror: {
      beliefs: Array<{ belief: string; why: string; evidence: string[]; confidence: number }>;
      recent_changes: string[];
      strengthening_patterns: string[];
      weakening_patterns: string[];
      may_be_wrong_about: string[];
      self_reported_accuracy: {
        sample_size: number;
        accuracy_pct: number | null;
        trend: string;
        summary: string;
      };
    };
    relationship_chain: { narrative: string };
    relationship_graph_summary: { nodes: number; edges: number };
  };
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ border: "1px solid var(--bm-border)", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: "var(--bm-text3)" }}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--bm-border)", borderRadius: 10, padding: 16, background: "var(--bm-bg2)" }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 16, color: "var(--bm-text)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function FounderMirrorPage() {
  const [data, setData] = useState<MirrorResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/founder-context/mirror", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: MirrorResponse) => setData(json.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 40px" }}>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--bm-text3)", margin: "0 0 8px" }}>
        Founder Mirror
      </p>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, margin: "0 0 8px", color: "var(--bm-text)" }}>
        What BuildMind currently believes about you
      </h1>
      <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: "0 0 22px" }}>
        Behavior-derived beliefs, evidence trails, recent changes, and where the model may be wrong.
      </p>

      {loading ? (
        <div style={{ color: "var(--bm-text4)", fontSize: 13 }}>Loading founder model...</div>
      ) : !data ? (
        <div style={{ border: "1px solid var(--bm-border)", borderRadius: 10, padding: 18, color: "var(--bm-text3)" }}>
          No founder mirror data available yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <Section title="Model accuracy">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Pill>{data.mirror.self_reported_accuracy.sample_size} resolved predictions</Pill>
              <Pill>{data.mirror.self_reported_accuracy.accuracy_pct ?? "No"}% match</Pill>
              <Pill>Trend: {data.mirror.self_reported_accuracy.trend}</Pill>
            </div>
            <p style={{ margin: 0, color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.6 }}>
              {data.mirror.self_reported_accuracy.summary}
            </p>
          </Section>

          {data.mirror.beliefs.map((belief, i) => (
            <section key={i} style={{ border: "1px solid var(--bm-border)", borderRadius: 10, padding: 16, background: "var(--bm-bg2)" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--bm-text)" }}>{belief.belief}</h2>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6 }}>{belief.why}</p>
              <Pill>{Math.round(belief.confidence * 100)}% confidence</Pill>
              {belief.evidence.length > 0 && (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.6 }}>
                  {belief.evidence.map((e, idx) => <li key={idx}>{e}</li>)}
                </ul>
              )}
            </section>
          ))}

          <Section title="What changed recently">
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.7 }}>
              {(data.mirror.recent_changes.length ? data.mirror.recent_changes : ["No clear recent changes detected yet."]).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </Section>

          <Section title="What may be wrong">
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.7 }}>
              {data.mirror.may_be_wrong_about.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </Section>

          <Section title="Evidence chain">
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6 }}>
              {data.relationship_chain.narrative || "No relationship chain available yet."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill>{data.relationship_graph_summary.nodes} nodes</Pill>
              <Pill>{data.relationship_graph_summary.edges} edges</Pill>
            </div>
          </Section>
        </div>
      )}
    </main>
  );
}

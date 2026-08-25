"use client";

import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight,
  CircleHelp, Clock3, Eye, GitBranch, RefreshCw, ShieldCheck, TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { WhyReveal } from "@/components/ui/WhyReveal";
import { PageHeader } from "@/components/ui/PageHeader";

type Belief = {
  belief: string;
  why: string;
  evidence: string[];
  confidence: number;
  trend: "strengthening" | "weakening" | "persistent" | "emerging";
  last_updated: string;
  contradictory_evidence: string[];
};

type Skill = {
  id: string;
  label: string;
  description: string;
  level: number;
  xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress: number;
  attempts: number;
  successes: number;
  failures: number;
  trend: "up" | "down" | "steady" | "new";
  summary: string;
};

type MirrorResponse = {
  ok: boolean;
  data?: {
    mirror: {
      beliefs: Belief[];
      skills: Skill[];
      recent_changes: string[];
      strengthening_patterns: string[];
      weakening_patterns: string[];
      may_be_wrong_about: string[];
      self_reported_accuracy: { sample_size: number; accuracy_pct: number | null; trend: string; summary: string };
      generated_at: string;
    };
    relationship_chain: { narrative: string };
    relationship_graph_summary: { nodes: number; edges: number };
  };
};

const trendMeta: Record<Belief["trend"], { color: string; variant: BadgeVariant }> = {
  strengthening: { color: "var(--bm-green)", variant: "success" },
  weakening: { color: "var(--bm-red)", variant: "danger" },
  persistent: { color: "var(--bm-intel)", variant: "intel" },
  emerging: { color: "var(--bm-text3)", variant: "neutral" },
};

const skillTrendMeta: Record<Skill["trend"], { color: string; variant: BadgeVariant; text: string }> = {
  up: { color: "var(--bm-green)", variant: "success", text: "Trending up" },
  down: { color: "var(--bm-red)", variant: "danger", text: "Trending down" },
  steady: { color: "var(--bm-text3)", variant: "neutral", text: "Holding steady" },
  new: { color: "var(--bm-intel)", variant: "intel", text: "New" },
};

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: "'DM Mono', monospace", color: color ?? "var(--bm-text3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
      {children}
    </div>
  );
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
      const response = await fetch("/api/founder-context/mirror/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belief: "General Founder Mirror model", correction: text }),
      });
      if (!response.ok) throw new Error("Correction failed");
      setCorrection("");
      setCorrectionStatus("Saved. BuildMind will retain this as founder-provided evidence.");
    } catch {
      setCorrectionStatus("Could not save the correction. Please try again.");
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "38px 20px", color: "var(--bm-text3)" }}>
        Building your founder model...
      </main>
    );
  }
  if (!data) {
    return (
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "38px 20px", color: "var(--bm-text3)" }}>
        Founder Mirror is waiting for enough observed activity to form a useful model.
      </main>
    );
  }

  const { mirror, relationship_chain: chain, relationship_graph_summary: graph } = data;
  const accuracy = mirror.self_reported_accuracy.accuracy_pct;

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "30px 20px 60px", color: "var(--bm-text)", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        eyebrow="Founder Mirror"
        title="Your operating model, observed over time."
        subtitle="Not a personality profile. This is BuildMind's current, revisable view of the behavior shaping your startup decisions."
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--bm-text3)", fontSize: 12, whiteSpace: "nowrap" }}>
            <RefreshCw size={13} />Updated {formatDate(mirror.generated_at)}
          </div>
        }
      />

      {/* ── Hero: gradient confidence ring + reliability summary ──────────── */}
      <Card style={{ background: "linear-gradient(180deg, var(--bm-bg2), var(--bm-bg3))", borderColor: "var(--bm-intel-bd)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", padding: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <ScoreRing value={accuracy ?? 0} size={104} gradient showLabel />
            <div style={{ marginTop: 8 }}>
              <Badge variant="intel" size="sm" dot>Live</Badge>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "center", color: "var(--bm-text)" }}>
              <ShieldCheck size={17} color="var(--bm-intel)" />
              <span style={{ fontSize: 14.5, lineHeight: 1.5, fontWeight: 500 }}>{mirror.self_reported_accuracy.summary}</span>
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
              <div>
                <Eyebrow>Match rate</Eyebrow>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 19, fontWeight: 700, color: "var(--bm-intel)" }}>
                  {accuracy == null ? "Learning" : `${accuracy}%`}
                </div>
              </div>
              <div>
                <Eyebrow>Outcomes tracked</Eyebrow>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 19, fontWeight: 700 }}>{mirror.self_reported_accuracy.sample_size}</div>
              </div>
              <div>
                <Eyebrow>Trend</Eyebrow>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 19, fontWeight: 700, color: mirror.self_reported_accuracy.trend === "down" ? "var(--bm-red)" : "var(--bm-green)" }}>
                  {mirror.self_reported_accuracy.trend}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Skills — leveled up through real completed work, not logins ───── */}
      {mirror.skills.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <TrendingUp size={15} color="var(--bm-intel)" />
              <div>
                <Eyebrow color="var(--bm-intel)">Built through real work</Eyebrow>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700 }}>What you're getting better at</div>
              </div>
            </div>
            <span style={{ color: "var(--bm-text4)", fontSize: 12 }}>{mirror.skills.length} tracked</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {mirror.skills.map((skill) => {
              const meta = skillTrendMeta[skill.trend];
              return (
                <Card key={skill.id} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div>
                      <h2 style={{ margin: 0, color: "var(--bm-text)", fontSize: 14, fontWeight: 600 }}>{skill.label}</h2>
                      <div style={{ color: "var(--bm-text3)", fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>{skill.description}</div>
                    </div>
                    <Badge variant="intel" size="sm">Lv. {skill.level}</Badge>
                  </div>

                  <div>
                    <div style={{ height: 4, background: "var(--bm-bg3)", overflow: "hidden", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${Math.round(skill.progress * 100)}%`, background: "var(--bm-intel)" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--bm-text4)", fontSize: 11, marginTop: 6 }}>
                      <span className="bm-data">{skill.xp_into_level}/{skill.xp_for_next_level} to Lv. {skill.level + 1}</span>
                      <span className="bm-data">{skill.successes} completed</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: 10 }}>
                    <Badge variant={meta.variant} size="sm">{meta.text}</Badge>
                    <span style={{ color: "var(--bm-text4)", fontSize: 11 }}>{skill.attempts} attempted</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Beliefs — behavior-derived traits, each with Why? evidence ──────── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <Eyebrow>Behavior-derived beliefs</Eyebrow>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700 }}>What BuildMind currently believes</div>
          </div>
          <span style={{ color: "var(--bm-text4)", fontSize: 12 }}>{mirror.beliefs.length} active</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {mirror.beliefs.map((belief, index) => {
            const meta = trendMeta[belief.trend];
            return (
              <Card key={`${belief.belief}-${index}`} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <h2 style={{ margin: 0, color: "var(--bm-text)", fontSize: 14, lineHeight: 1.45, fontWeight: 600 }}>{belief.belief}</h2>
                  <Badge variant={meta.variant} size="sm">{belief.trend}</Badge>
                </div>
                <p style={{ margin: 0, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.55 }}>{belief.why}</p>
                <div>
                  <div style={{ height: 4, background: "var(--bm-bg3)", overflow: "hidden", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${Math.round(belief.confidence * 100)}%`, background: meta.color }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--bm-text4)", fontSize: 11, marginTop: 6 }}>
                    <span>{Math.round(belief.confidence * 100)}% confidence</span>
                    <span>Updated {formatDate(belief.last_updated)}</span>
                  </div>
                </div>

                {(belief.evidence.length > 0 || belief.contradictory_evidence.length > 0) && (
                  <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 10 }}>
                    <WhyReveal
                      items={[
                        ...belief.evidence.map((item) => ({ label: "Evidence", value: item })),
                        ...belief.contradictory_evidence.map((item) => ({ label: "You said", value: item })),
                      ]}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Changes + Uncertainty ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <Activity size={15} color="var(--bm-intel)" />
            <div>
              <Eyebrow color="var(--bm-intel)">Change detection</Eyebrow>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700 }}>What moved in your model</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            {(mirror.recent_changes.length ? mirror.recent_changes : ["No meaningful behavioral change detected yet."]).map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>
                <span className="bm-status-dot" style={{ background: "var(--bm-intel)" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
          {(mirror.strengthening_patterns.length > 0 || mirror.weakening_patterns.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--bm-border)" }}>
              <div>
                <Eyebrow color="var(--bm-green)">Strengthening</Eyebrow>
                <div style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.5 }}>{mirror.strengthening_patterns[0] ?? "No pattern strengthening yet."}</div>
              </div>
              <div>
                <Eyebrow color="var(--bm-red)">Weakening</Eyebrow>
                <div style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.5 }}>{mirror.weakening_patterns[0] ?? "No pattern weakening yet."}</div>
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: 18, background: "var(--bm-bg3)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <AlertTriangle size={15} color="var(--bm-text3)" />
            <div>
              <Eyebrow color="var(--bm-text3)">Model uncertainty</Eyebrow>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700 }}>What may be wrong</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {mirror.may_be_wrong_about.length ? mirror.may_be_wrong_about.map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: "flex", gap: 6, color: "var(--bm-text2)", fontSize: 12, lineHeight: 1.55 }}>
                <CircleHelp size={12} color="var(--bm-text4)" style={{ flexShrink: 0, marginTop: 2 }} />
                {item}
              </div>
            )) : (
              <div style={{ color: "var(--bm-text4)", fontSize: 12 }}>Nothing flagged as uncertain right now.</div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 13, marginTop: 14 }}>
            <label htmlFor="founder-mirror-correction" style={{ display: "block", color: "var(--bm-text2)", fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>
              Correct BuildMind when this model misses context.
            </label>
            <textarea
              id="founder-mirror-correction"
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              placeholder="For example: I do customer research outside BuildMind."
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                border: "1px solid var(--bm-border2)", borderRadius: 6, padding: 10,
                background: "var(--bm-bg)", color: "var(--bm-text)", fontSize: 12, lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={submitCorrection}
                disabled={!correction.trim()}
                style={{
                  display: "inline-flex", gap: 7, alignItems: "center",
                  border: "1px solid var(--bm-intel-bd)", borderRadius: 6, padding: "8px 12px",
                  background: "var(--bm-intel-dim)", color: "var(--bm-intel)", fontSize: 12,
                  cursor: correction.trim() ? "pointer" : "not-allowed", opacity: correction.trim() ? 1 : 0.5,
                }}
              >
                <Eye size={13} />Correct model
              </button>
              {correctionStatus && <span style={{ color: "var(--bm-text4)", fontSize: 11 }}>{correctionStatus}</span>}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Decision continuity footer ───────────────────────────────────── */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 9 }}>
          <GitBranch size={15} color="var(--bm-intel)" />
          <div>
            <Eyebrow color="var(--bm-intel)">Decision continuity</Eyebrow>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700 }}>The evidence chain behind the current model</div>
          </div>
        </div>
        <p style={{ margin: "0 0 10px", color: "var(--bm-text3)", fontSize: 13, lineHeight: 1.6 }}>
          {chain.narrative || "No decision relationship chain is available yet."}
        </p>
        <div style={{ display: "flex", gap: 18, color: "var(--bm-text4)", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock3 size={13} />{graph.nodes} observed entities</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><ArrowUpRight size={13} />{graph.edges} connected relationships</span>
        </div>
      </Card>
    </main>
  );
}

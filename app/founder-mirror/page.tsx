"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Activity, AlertTriangle, ArrowUpRight, Brain, ChevronDown,
  CircleHelp, Clock3, Download, Eye, GitBranch, History, Loader2, RefreshCw,
  ShieldCheck, TrendingUp, TrendingDown, Users, Calculator, Cpu,
  MessagesSquare, ListChecks, HeartHandshake, Sparkles, Pencil, X,
  Radar, Share2, ScrollText, Compass, AlertOctagon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { WhyReveal } from "@/components/ui/WhyReveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RelationshipGraph, type StartupRelationshipGraph } from "@/components/founder-mirror/RelationshipGraph";

type Belief = {
  belief: string;
  belief_key: string;
  why: string;
  evidence: string[];
  confidence: number;
  trend: "strengthening" | "weakening" | "persistent" | "emerging";
  last_updated: string;
  contradictory_evidence: string[];
  correction_effect: { corrections_applied: number; confidence_before: number; confidence_after: number } | null;
};

type MirrorSignal = {
  id: string;
  type: string;
  severity: string;
  title: string;
  summary: string;
  recommended_response: string;
  evidence: Array<{ source: string; detail: string }>;
  decayed_confidence: number;
  lifecycle: string;
};

type DecisionTop = { id: string; action: string; rationale: string; why_it_beats_alternatives: string; score: number };
type DecisionAlternative = { id: string; action: string; rationale: string; score: number; gap_to_top: number };

type FounderArchetype = { id: string; name: string; tagline: string; strength: string; blindSpot: string; shadowBehavior: string };
type SignatureCard = {
  founderName: string | null; dayCount: number; archetypeName: string; archetypeTagline: string;
  statLine: string; avoidanceZone: string | null; peakHour: string | null; shareText: string;
};
type PatternReportSection = { title: string; content: string };
type PatternReport = {
  founderName: string | null; archetype: FounderArchetype; executiveSummary: string;
  avoidanceZones: string[]; executionStrengths: string[]; peakExecutionWindow: string | null;
  confidenceCalibration: string | null; topBlocker: string | null; sentimentTrajectory: string;
  recommendedFocus: string; sections: PatternReportSection[];
};
type BehavioralData = {
  archetype: FounderArchetype | null;
  milestone: "first_insight" | "signature_card" | "pattern_report" | null;
  first_insight: { archetype: FounderArchetype; observation: string; prompt: string } | null;
  signature_card: SignatureCard | null;
  pattern_report: PatternReport | null;
  checkins_total: number;
  days_since_start: number;
};

type Skill = {
  id: string;
  label: string;
  description: string;
  level: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress: number;
  attempts: number;
  successes: number;
  trend: "up" | "down" | "steady" | "new";
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
      signals: MirrorSignal[];
      decision: { top: DecisionTop | null; alternatives: DecisionAlternative[] };
      suppressed_beliefs: Array<{ belief: string; reason: string }>;
      self_reported_accuracy: { sample_size: number; accuracy_pct: number | null; trend: string; summary: string };
      generated_at: string;
    };
    relationship_chain: { narrative: string };
    relationship_graph_summary: { nodes: number; edges: number };
    relationship_graph: StartupRelationshipGraph;
    behavioral: BehavioralData | null;
  };
};

type PastCorrection = { belief: string; belief_key?: string; correction: string; evidence?: string; created_at: string };

const signalSeverityColor: Record<string, string> = {
  critical: "var(--bm-red)", high: "var(--bm-red)", medium: "var(--bm-amber)", low: "var(--bm-text3)",
};

const trendMeta: Record<Belief["trend"], { color: string; variant: BadgeVariant; bar: string }> = {
  strengthening: { color: "var(--bm-green)", variant: "success", bar: "var(--bm-green)" },
  weakening: { color: "var(--bm-red)", variant: "danger", bar: "var(--bm-red)" },
  persistent: { color: "var(--bm-intel)", variant: "intel", bar: "var(--bm-intel)" },
  emerging: { color: "var(--bm-text3)", variant: "neutral", bar: "var(--bm-text3)" },
};

const skillTrendMeta: Record<Skill["trend"], { color: string; variant: BadgeVariant; text: string; icon: typeof TrendingUp }> = {
  up: { color: "var(--bm-green)", variant: "success", text: "Trending up", icon: TrendingUp },
  down: { color: "var(--bm-red)", variant: "danger", text: "Trending down", icon: TrendingDown },
  steady: { color: "var(--bm-text3)", variant: "neutral", text: "Holding steady", icon: Activity },
  new: { color: "var(--bm-intel)", variant: "intel", text: "New", icon: Sparkles },
};

// Purely decorative — a light-touch icon per skill title so the grid reads
// faster at a glance. Picked from the real label text; never changes what
// the skill actually is or invents a category that isn't there.
function skillIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes("customer") || l.includes("discovery")) return Users;
  if (l.includes("financ") || l.includes("model")) return Calculator;
  if (l.includes("technical") || l.includes("architect") || l.includes("engineer")) return Cpu;
  if (l.includes("investor") || l.includes("communicat")) return MessagesSquare;
  if (l.includes("sprint") || l.includes("planning")) return ListChecks;
  if (l.includes("team") || l.includes("feedback")) return HeartHandshake;
  return Brain;
}

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: "'DM Mono', monospace", color: color ?? "var(--bm-text3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] } }),
};

export default function FounderMirrorPage() {
  const [data, setData] = useState<MirrorResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [correction, setCorrection] = useState("");
  const [correctionStatus, setCorrectionStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pastCorrections, setPastCorrections] = useState<PastCorrection[] | null>(null);
  const [showPastCorrections, setShowPastCorrections] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  // When set, the correction textarea is targeting one specific belief
  // (via its belief_key) instead of applying generally at reduced weight —
  // see lib/founderMirror.ts's GENERAL_CORRECTION_WEIGHT.
  const [targetBelief, setTargetBelief] = useState<{ text: string; key: string } | null>(null);
  // Shown briefly after a correction lands, so the effect of "Correct the
  // model" is visible instead of the correction just being stored silently.
  const [correctionDelta, setCorrectionDelta] = useState<{ belief: string; before: number; after: number } | null>(null);

  async function loadMirror() {
    try {
      const response = await fetch("/api/founder-context/mirror", { cache: "no-store" });
      const json: MirrorResponse = await response.json();
      return json.data ?? null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    loadMirror()
      .then((next) => setData(next))
      .finally(() => setLoading(false));
  }, []);

  async function submitCorrection() {
    const text = correction.trim();
    if (!text) return;
    setCorrectionStatus("saving");
    const belief = targetBelief?.text ?? "General Founder Mirror model";
    const beliefKey = targetBelief?.key ?? "general";
    // Snapshot the targeted belief's current confidence so we can show the
    // before/after once the correction has actually been applied server-side.
    const before = targetBelief ? data?.mirror.beliefs.find((b) => b.belief_key === targetBelief.key)?.confidence ?? null : null;
    try {
      const response = await fetch("/api/founder-context/mirror/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belief, belief_key: beliefKey, correction: text }),
      });
      if (!response.ok) throw new Error("Correction failed");
      setCorrection("");
      setCorrectionStatus("saved");
      setPastCorrections(null);

      const refreshed = await loadMirror();
      if (refreshed) {
        setData(refreshed);
        if (targetBelief && before != null) {
          const after = refreshed.mirror.beliefs.find((b) => b.belief_key === targetBelief.key)?.confidence;
          if (after != null) {
            setCorrectionDelta({ belief: targetBelief.text, before, after });
            setTimeout(() => setCorrectionDelta(null), 7000);
          }
        }
      }
      setTargetBelief(null);
      setTimeout(() => setCorrectionStatus("idle"), 2800);
    } catch {
      setCorrectionStatus("error");
    }
  }

  function startCorrectingBelief(belief: Belief) {
    setTargetBelief({ text: belief.belief, key: belief.belief_key });
    setCorrection("");
    document.getElementById("correct-the-model")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function togglePastCorrections() {
    const next = !showPastCorrections;
    setShowPastCorrections(next);
    if (next && pastCorrections === null) {
      setLoadingPast(true);
      try {
        const res = await fetch("/api/founder-context/mirror/correction", { cache: "no-store" });
        const json: { ok?: boolean; corrections?: PastCorrection[] } = await res.json();
        setPastCorrections(json.ok && Array.isArray(json.corrections) ? json.corrections : []);
      } catch {
        setPastCorrections([]);
      } finally {
        setLoadingPast(false);
      }
    }
  }

  const accuracy = data?.mirror.self_reported_accuracy.accuracy_pct;
  const sampleSize = data?.mirror.self_reported_accuracy.sample_size ?? 0;
  const accuracyTrend = data?.mirror.self_reported_accuracy.trend;

  // Derived model-status pill — computed purely from real fields already on
  // the mirror (sample size + trend direction), never a separate invented
  // metric. Mirrors the "Active · Learning" framing from the reference
  // design without adding a program/cohort concept this platform doesn't have.
  const modelStatus = useMemo(() => {
    if (!data) return null;
    if (sampleSize < 10) return { label: "Learning", color: "var(--bm-text3)" };
    if (accuracyTrend === "up") return { label: "Active · Improving", color: "var(--bm-green)" };
    if (accuracyTrend === "down") return { label: "Active · Slipping", color: "var(--bm-red)" };
    return { label: "Active", color: "var(--bm-intel)" };
  }, [data, sampleSize, accuracyTrend]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[420px] max-w-[1120px] flex-col items-center justify-center gap-3 px-5 py-16 text-center">
        <Loader2 size={22} className="animate-spin text-[var(--bm-intel)]" />
        <div>
          <p className="text-[13px] font-semibold text-[var(--bm-text2)]">Building your founder model…</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--bm-text4)]">
            Reading observed behavior
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1120px] px-3 py-7 sm:px-6">
        <EmptyState
          icon={Eye}
          title="Founder Mirror is still calibrating"
          body="It's waiting for enough observed activity — tasks, reflections, and outcomes — to form a model worth trusting. Keep working in BuildMind and this page will fill in on its own."
        />
      </div>
    );
  }

  const { mirror, relationship_chain: chain, relationship_graph_summary: graphSummary, relationship_graph: graph, behavioral } = data;

  return (
    <div className="mx-auto max-w-[1120px] px-3 py-5 sm:px-6 sm:py-7">
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <PageHeader
          eyebrow="Founder Mirror"
          title="Your operating model, observed over time."
          subtitle="Not a personality profile. This is BuildMind's current, revisable view of the behavior shaping your startup decisions."
          action={
            <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--bm-text3)]">
              <RefreshCw size={13} />Updated {formatDate(mirror.generated_at)}
            </div>
          }
        />
      </motion.div>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={1} className="mt-5">
        <Card
          variant="insight"
          className="relative overflow-hidden"
          style={{ background: "radial-gradient(120% 140% at 12% 15%, var(--bm-intel-dim), var(--bm-bg2) 60%)" }}
        >
          <div className="flex flex-wrap items-center gap-6 p-5 sm:p-7">
            <div className="flex shrink-0 flex-col items-center gap-2.5">
              <ScoreRing value={accuracy ?? 0} size={104} gradient showLabel />
              {modelStatus && (
                <Badge variant="intel" size="sm" dot style={{ color: modelStatus.color }}>
                  {modelStatus.label}
                </Badge>
              )}
            </div>
            <div className="min-w-[240px] flex-1">
              <div className="flex items-center gap-2 text-[var(--bm-text)]">
                <ShieldCheck size={16} color="var(--bm-intel)" />
                <span className="text-[14px] font-medium leading-relaxed">{mirror.self_reported_accuracy.summary}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <Eyebrow>Match rate</Eyebrow>
                  <div className="mt-1 font-[Syne] text-[19px] font-bold text-[var(--bm-intel)]">
                    {accuracy == null ? "Learning" : `${accuracy}%`}
                  </div>
                </div>
                <div>
                  <Eyebrow>Outcomes tracked</Eyebrow>
                  <div className="mt-1 font-[Syne] text-[19px] font-bold text-[var(--bm-text)]">{sampleSize}</div>
                </div>
                <div>
                  <Eyebrow>Trend</Eyebrow>
                  <div
                    className="mt-1 font-[Syne] text-[19px] font-bold capitalize"
                    style={{ color: accuracyTrend === "down" ? "var(--bm-red)" : accuracyTrend === "up" ? "var(--bm-green)" : "var(--bm-text)" }}
                  >
                    {accuracyTrend ?? "unknown"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Behavioral archetype (Mirror Moment) ─────────────────────────────
           Surfaced from lib/mirrorMoment.ts via lib/behavioralLayers.ts — a
           separate founder-modeling pipeline from the beliefs above (see
           docs/known-issue-dual-founder-modeling-systems.md). Shown as its
           own clearly-labeled section rather than blended into the beliefs
           so the two are never mistaken for one unified claim. */}
      {behavioral?.archetype && (
        <motion.div initial="hidden" animate="show" variants={fadeUp} custom={1.5} className="mt-3.5">
          <Card
            variant="alert"
            className="relative overflow-hidden p-5 sm:p-6"
            style={{ background: "radial-gradient(120% 140% at 88% 10%, var(--bm-purple-dim, rgba(155,135,245,0.08)), var(--bm-bg2) 60%)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[240px] flex-1">
                <span className="inline-flex items-center gap-1.5">
                  <Radar size={13} color="var(--bm-purple)" />
                  <Eyebrow color="var(--bm-purple)">Behavioral signature · separate from the beliefs below</Eyebrow>
                </span>
                <div className="mt-1 font-[Syne] text-[20px] font-bold text-[var(--bm-text)]">{behavioral.archetype.name}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--bm-text2)]">{behavioral.archetype.tagline}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-2.5">
                    <Eyebrow color="var(--bm-green)">Strength</Eyebrow>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">{behavioral.archetype.strength}</p>
                  </div>
                  <div className="rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-2.5">
                    <Eyebrow color="var(--bm-amber)">Blind spot</Eyebrow>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">{behavioral.archetype.blindSpot}</p>
                  </div>
                </div>
              </div>
              {behavioral.signature_card && (
                <div className="flex min-w-[200px] flex-col gap-2 rounded-[var(--r-md)] border border-[var(--bm-purple-bd,var(--bm-border2))] bg-[var(--bm-bg3)] p-3.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--bm-text3)]">
                    <Share2 size={11} /> Day {behavioral.signature_card.dayCount} signature
                  </span>
                  {behavioral.signature_card.statLine && (
                    <p className="m-0 text-[12px] leading-relaxed text-[var(--bm-text2)]">{behavioral.signature_card.statLine}</p>
                  )}
                  {behavioral.signature_card.avoidanceZone && (
                    <p className="m-0 text-[11px] text-[var(--bm-text4)]">Avoidance zone: {behavioral.signature_card.avoidanceZone}</p>
                  )}
                </div>
              )}
            </div>

            {behavioral.pattern_report && (
              <div className="mt-4 border-t border-[var(--bm-border)] pt-3.5">
                <span className="inline-flex items-center gap-1.5">
                  <ScrollText size={12} color="var(--bm-purple)" />
                  <Eyebrow color="var(--bm-purple)">30-day pattern report</Eyebrow>
                </span>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--bm-text2)]">{behavioral.pattern_report.executiveSummary}</p>
                <div className="mt-2.5 flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-2.5">
                  <Compass size={13} color="var(--bm-intel)" className="mt-0.5 shrink-0" />
                  <p className="m-0 text-[12px] leading-relaxed text-[var(--bm-text2)]"><strong className="text-[var(--bm-text)]">The one change: </strong>{behavioral.pattern_report.recommendedFocus}</p>
                </div>
              </div>
            )}

            {!behavioral.signature_card && behavioral.first_insight && (
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--bm-text3)]">
                {behavioral.first_insight.observation} A signature card unlocks after 7 days, a full pattern report after 30.
              </p>
            )}
          </Card>
        </motion.div>
      )}

      {/* ── Skills ───────────────────────────────────────────────────────── */}
      {mirror.skills.length > 0 && (
        <motion.section initial="hidden" animate="show" variants={fadeUp} custom={2} className="mt-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} color="var(--bm-intel)" />
              <div>
                <Eyebrow color="var(--bm-intel)">Built through real work</Eyebrow>
                <div className="font-[Syne] text-[16px] font-bold text-[var(--bm-text)]">What you&apos;re getting better at</div>
              </div>
            </div>
            <span className="text-xs text-[var(--bm-text4)]">{mirror.skills.length} tracked</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mirror.skills.map((skill, i) => {
              const meta = skillTrendMeta[skill.trend];
              const TrendIcon = meta.icon;
              const SkillIcon = skillIcon(skill.label);
              return (
                <motion.div key={skill.id} initial="hidden" animate="show" variants={fadeUp} custom={i * 0.5 + 2}>
                  <Card hover className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: "var(--bm-intel-dim)", border: "1px solid var(--bm-intel-bd)" }}
                        >
                          <SkillIcon size={15} color="var(--bm-intel)" />
                        </div>
                        <div>
                          <h3 className="text-[14px] font-semibold text-[var(--bm-text)]">{skill.label}</h3>
                          <p className="mt-0.5 text-[11px] leading-snug text-[var(--bm-text3)]">{skill.description}</p>
                        </div>
                      </div>
                      <Badge variant="intel" size="sm">Lv. {skill.level}</Badge>
                    </div>
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bm-bg3)]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: "var(--grad-primary)" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round(skill.progress * 100)}%` }}
                          transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 }}
                        />
                      </div>
                      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[var(--bm-text4)]">
                        <span>{skill.xp_into_level}/{skill.xp_for_next_level} to Lv. {skill.level + 1}</span>
                        <span>{skill.successes} completed</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-[var(--bm-border)] pt-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <TrendIcon size={12} color={meta.color} />
                        <span className="text-[11px] font-medium" style={{ color: meta.color }}>{meta.text}</span>
                      </span>
                      <span className="text-[11px] text-[var(--bm-text4)]">{skill.attempts} attempted</span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Beliefs ──────────────────────────────────────────────────────── */}
      <motion.section initial="hidden" animate="show" variants={fadeUp} custom={3} className="mt-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <Eyebrow>Behavior-derived beliefs</Eyebrow>
            <div className="font-[Syne] text-[16px] font-bold text-[var(--bm-text)]">What BuildMind currently believes</div>
          </div>
          <span className="text-xs text-[var(--bm-text4)]">{mirror.beliefs.length} active</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {mirror.beliefs.map((belief, index) => {
            const meta = trendMeta[belief.trend];
            return (
              <Card
                key={`${belief.belief}-${index}`}
                className="flex flex-col gap-3 p-4"
                style={{ borderLeft: `2px solid ${meta.bar}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 text-[14px] font-semibold leading-snug text-[var(--bm-text)]">&ldquo;{belief.belief}&rdquo;</h3>
                  <Badge variant={meta.variant} size="sm">{belief.trend}</Badge>
                </div>
                <p className="m-0 text-[12px] leading-relaxed text-[var(--bm-text3)]">{belief.why}</p>
                <div>
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--bm-bg3)]">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(belief.confidence * 100)}%`, background: meta.color }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-[var(--bm-text4)]">
                    <span>{Math.round(belief.confidence * 100)}% confidence</span>
                    <span>Updated {formatDate(belief.last_updated)}</span>
                  </div>
                </div>

                {belief.correction_effect && (
                  <div className="flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--bm-amber-dim,rgba(181,131,58,0.08))] px-2 py-1 text-[10.5px] text-[var(--bm-amber)]">
                    <Pencil size={10} />
                    Softened by {belief.correction_effect.corrections_applied} correction{belief.correction_effect.corrections_applied === 1 ? "" : "s"}: {Math.round(belief.correction_effect.confidence_before * 100)}% → {Math.round(belief.correction_effect.confidence_after * 100)}%
                  </div>
                )}

                {(belief.evidence.length > 0 || belief.contradictory_evidence.length > 0) && (
                  <div className="border-t border-[var(--bm-border)] pt-2.5">
                    <WhyReveal
                      items={[
                        ...belief.evidence.map((item) => ({ label: "Evidence", value: item })),
                        ...belief.contradictory_evidence.map((item) => ({ label: "You said", value: item })),
                      ]}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => startCorrectingBelief(belief)}
                  className="mt-0.5 inline-flex w-fit items-center gap-1 border-none bg-transparent p-0 text-[11px] font-medium text-[var(--bm-text4)] hover:text-[var(--bm-intel)]"
                >
                  <Pencil size={11} /> Correct this
                </button>
              </Card>
            );
          })}
        </div>

        {mirror.suppressed_beliefs.length > 0 && (
          <div className="mt-3 rounded-[var(--r-md)] border border-dashed border-[var(--bm-border)] p-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--bm-text4)]">
              <AlertOctagon size={11} /> Softened out of the list above
            </span>
            <div className="mt-1.5 flex flex-col gap-1">
              {mirror.suppressed_beliefs.map((s, i) => (
                <p key={i} className="m-0 text-[11px] leading-relaxed text-[var(--bm-text4)]">
                  &ldquo;{s.belief}&rdquo; — {s.reason}
                </p>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {/* ── Signals ──────────────────────────────────────────────────────── */}
      {mirror.signals.length > 0 && (
        <motion.section initial="hidden" animate="show" variants={fadeUp} custom={3.3} className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} color="var(--bm-intel)" />
            <div>
              <Eyebrow color="var(--bm-intel)">Detected patterns</Eyebrow>
              <div className="font-[Syne] text-[16px] font-bold text-[var(--bm-text)]">Signals behind today&apos;s recommendation</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {mirror.signals.map((signal) => (
              <Card key={signal.id} className="flex flex-col gap-2 p-4" style={{ borderLeft: `2px solid ${signalSeverityColor[signal.severity] ?? "var(--bm-text3)"}` }}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="m-0 text-[13.5px] font-semibold leading-snug text-[var(--bm-text)]">{signal.title}</h3>
                  <Badge variant={signal.severity === "critical" || signal.severity === "high" ? "danger" : signal.severity === "medium" ? "warning" : "neutral"} size="sm">
                    {signal.severity}
                  </Badge>
                </div>
                <p className="m-0 text-[12px] leading-relaxed text-[var(--bm-text3)]">{signal.summary}</p>
                {signal.evidence.length > 0 && (
                  <WhyReveal items={signal.evidence.map((e) => ({ label: e.source, value: e.detail }))} />
                )}
                <div className="mt-1 flex items-center gap-2 border-t border-[var(--bm-border)] pt-2 text-[11px] text-[var(--bm-text3)]">
                  <ArrowUpRight size={11} color="var(--bm-intel)" />
                  {signal.recommended_response}
                </div>
              </Card>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Decision reasoning ──────────────────────────────────────────────
           state.decision.candidates isn't just the winning pick — showing
           what almost won, and why it didn't, is one of the clearer ways to
           demonstrate this is reasoning rather than a black-box choice. */}
      {mirror.decision.top && (
        <motion.section initial="hidden" animate="show" variants={fadeUp} custom={3.5} className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <Brain size={15} color="var(--bm-intel)" />
            <div>
              <Eyebrow color="var(--bm-intel)">How it decided</Eyebrow>
              <div className="font-[Syne] text-[16px] font-bold text-[var(--bm-text)]">Today&apos;s recommendation, and what it beat</div>
            </div>
          </div>
          <Card variant="insight" className="p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="m-0 text-[14px] font-semibold leading-snug text-[var(--bm-text)]">{mirror.decision.top.action}</h3>
              <Badge variant="intel" size="sm">{Math.round(mirror.decision.top.score)} score</Badge>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--bm-text3)]">{mirror.decision.top.rationale}</p>
            <p className="mt-1.5 text-[12px] italic leading-relaxed text-[var(--bm-intel)]">{mirror.decision.top.why_it_beats_alternatives}</p>
          </Card>
          {mirror.decision.alternatives.length > 0 && (
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {mirror.decision.alternatives.map((alt) => (
                <div key={alt.id} className="rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="m-0 text-[12.5px] font-medium leading-snug text-[var(--bm-text2)]">{alt.action}</p>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--bm-text4)]">−{alt.gap_to_top}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--bm-text4)]">{alt.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* ── Changes + Uncertainty ────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={4} className="mt-7 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity size={15} color="var(--bm-intel)" />
            <div>
              <Eyebrow color="var(--bm-intel)">Change detection</Eyebrow>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">What moved in your model</div>
            </div>
          </div>
          <div className="grid gap-2">
            {(mirror.recent_changes.length ? mirror.recent_changes : ["No meaningful behavioral change detected yet."]).map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-[var(--bm-text2)]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--bm-intel)" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
          {(mirror.strengthening_patterns.length > 0 || mirror.weakening_patterns.length > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--bm-border)] pt-3.5">
              <div>
                <span className="inline-flex items-center gap-1"><TrendingUp size={11} color="var(--bm-green)" /><Eyebrow color="var(--bm-green)">Strengthening</Eyebrow></span>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">{mirror.strengthening_patterns[0] ?? "No pattern strengthening yet."}</p>
              </div>
              <div>
                <span className="inline-flex items-center gap-1"><TrendingDown size={11} color="var(--bm-red)" /><Eyebrow color="var(--bm-red)">Weakening</Eyebrow></span>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">{mirror.weakening_patterns[0] ?? "No pattern weakening yet."}</p>
              </div>
            </div>
          )}
        </Card>

        <Card variant="data" className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} color="var(--bm-amber)" />
            <div>
              <Eyebrow color="var(--bm-amber)">Model uncertainty</Eyebrow>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">What may be wrong</div>
            </div>
          </div>
          <div className="grid gap-2">
            {mirror.may_be_wrong_about.length ? mirror.may_be_wrong_about.map((item, index) => (
              <div key={`${item}-${index}`} className="flex gap-2 text-[12px] leading-relaxed text-[var(--bm-text2)]">
                <CircleHelp size={12} color="var(--bm-text4)" className="mt-0.5 shrink-0" />
                {item}
              </div>
            )) : (
              <div className="text-[12px] text-[var(--bm-text4)]">Nothing flagged as uncertain right now.</div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* ── Correct the model ────────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={5} className="mt-3.5" id="correct-the-model">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <History size={15} color="var(--bm-text3)" />
            <div>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">Correct the model</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--bm-text3)]">
                {targetBelief
                  ? "Corrections are weighted heavily and decay over roughly three weeks — sustained fresh evidence can pull confidence back up, but repeated corrections push a belief off the list entirely."
                  : "Tell BuildMind what it's getting wrong generally, or use \"Correct this\" on a specific belief above to target just that one."}
              </p>
            </div>
          </div>

          {targetBelief && (
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--bm-intel-bd)] bg-[var(--bm-intel-dim)] px-3 py-2">
              <span className="text-[12px] leading-snug text-[var(--bm-intel)]">
                Correcting: &ldquo;{targetBelief.text}&rdquo;
              </span>
              <button type="button" onClick={() => setTargetBelief(null)} className="shrink-0 text-[var(--bm-intel)] hover:opacity-70">
                <X size={13} />
              </button>
            </div>
          )}

          {correctionDelta && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2.5 flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--bm-green-dim,rgba(56,137,106,0.1))] px-3 py-2 text-[12px] text-[var(--bm-green)]"
            >
              <CircleHelp size={12} />
              Applied — confidence on &ldquo;{correctionDelta.belief}&rdquo; moved {Math.round(correctionDelta.before * 100)}% → {Math.round(correctionDelta.after * 100)}%
            </motion.div>
          )}

          <Textarea
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            placeholder={targetBelief ? "e.g. I don't actually avoid this — what looks like avoidance is actually…" : "e.g. I don't actually avoid difficult conversations — I prepare extensively before having them, which looks like delay…"}
            rows={3}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <Button size="sm" onClick={submitCorrection} disabled={!correction.trim() || correctionStatus === "saving"} loading={correctionStatus === "saving"}>
                Save Correction
              </Button>
              <button
                type="button"
                onClick={togglePastCorrections}
                className="inline-flex items-center gap-1 border-none bg-transparent p-0 text-[12px] font-medium text-[var(--bm-text3)] hover:text-[var(--bm-text2)]"
              >
                View past corrections
                <ChevronDown size={13} className="transition-transform" style={{ transform: showPastCorrections ? "rotate(180deg)" : "none" }} />
              </button>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--bm-text4)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: correctionStatus === "saving" ? "var(--bm-amber)" : correctionStatus === "error" ? "var(--bm-red)" : "var(--bm-green)" }}
              />
              {correctionStatus === "saving" ? "Saving…" : correctionStatus === "saved" ? "Saved" : correctionStatus === "error" ? "Couldn't save — try again" : "Ready to sync"}
            </span>
          </div>

          <AnimatePresence>
            {showPastCorrections && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: "hidden" }}
              >
                <div className="mt-4 border-t border-[var(--bm-border)] pt-3.5">
                  {loadingPast ? (
                    <p className="text-[12px] text-[var(--bm-text4)]">Loading past corrections…</p>
                  ) : pastCorrections && pastCorrections.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      {pastCorrections.map((c, i) => (
                        <div key={`${c.created_at}-${i}`} className="rounded-[var(--r-md)] bg-[var(--bm-bg3)] p-3">
                          <p className="m-0 text-[12px] leading-relaxed text-[var(--bm-text2)]">{c.correction}</p>
                          <p className="mt-1.5 font-mono text-[10px] text-[var(--bm-text4)]">
                            {c.belief} · {formatDateTime(c.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--bm-text4)]">No corrections saved yet.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* ── Decision continuity / relationship graph ─────────────────────────
           Was: two counts and one text narrative for a single milestone.
           Now: the actual graph buildStartupRelationshipGraph() produces —
           pan, zoom, click any node to trace what feeds it and what it
           feeds. The narrative chain stays as a plain-language caption for
           the same data. */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={6} className="mt-3.5">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <GitBranch size={15} color="var(--bm-intel)" />
            <div>
              <Eyebrow color="var(--bm-intel)">Decision continuity</Eyebrow>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">The evidence chain behind the current model</div>
            </div>
          </div>
          <p className="m-0 mb-3 text-[13px] leading-relaxed text-[var(--bm-text3)]">
            {chain.narrative || "No decision relationship chain is available yet."}
          </p>
          <div className="mb-3 flex gap-4 text-[12px] text-[var(--bm-text4)]">
            <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{graphSummary.nodes} observed entities</span>
            <span className="inline-flex items-center gap-1.5"><ArrowUpRight size={13} />{graphSummary.edges} connected relationships</span>
          </div>
          <RelationshipGraph graph={graph} />
        </Card>
      </motion.div>

      {/* ── Your data ─────────────────────────────────────────────────────
           Everything above this line — beliefs, accuracy, archetype stats,
           decision continuity — is real, computed, and until now had no
           way out of this page. This is the actual export: the same
           report this page is built from, downloadable directly. Not a
           new synthesis, just a door to the one that already exists. */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={7} className="mt-3.5">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Download size={15} color="var(--bm-text3)" />
            <div>
              <Eyebrow color="var(--bm-text3)">Your data</Eyebrow>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">Export the intelligence built about your startup</div>
            </div>
          </div>
          <p className="m-0 mb-3 text-[12px] leading-relaxed text-[var(--bm-text3)]">
            The full report BuildMind has built — readiness, engagement, prediction accuracy, and the underlying intelligence state — as raw data you can keep, analyze, or move elsewhere.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/founder-context/intelligence-export"
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--bm-border)] px-3 py-1.5 text-[12px] text-[var(--bm-text2)] no-underline hover:text-[var(--bm-text)]"
            >
              <Download size={12} /> Full report (JSON)
            </a>
            <a
              href="/api/founder-context/intelligence-export?format=csv"
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--bm-border)] px-3 py-1.5 text-[12px] text-[var(--bm-text2)] no-underline hover:text-[var(--bm-text)]"
            >
              <Download size={12} /> Standing trend (CSV)
            </a>
          </div>
        </Card>
      </motion.div>
    </div>
  );
  }

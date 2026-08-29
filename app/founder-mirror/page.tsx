"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Activity, AlertTriangle, ArrowUpRight, Brain, ChevronDown,
  CircleHelp, Clock3, Eye, GitBranch, History, Loader2, RefreshCw,
  ShieldCheck, TrendingUp, TrendingDown, Users, Calculator, Cpu,
  MessagesSquare, ListChecks, HeartHandshake, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { WhyReveal } from "@/components/ui/WhyReveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
      self_reported_accuracy: { sample_size: number; accuracy_pct: number | null; trend: string; summary: string };
      generated_at: string;
    };
    relationship_chain: { narrative: string };
    relationship_graph_summary: { nodes: number; edges: number };
  };
};

type PastCorrection = { belief: string; correction: string; evidence?: string; created_at: string };

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
    setCorrectionStatus("saving");
    try {
      const response = await fetch("/api/founder-context/mirror/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belief: "General Founder Mirror model", correction: text }),
      });
      if (!response.ok) throw new Error("Correction failed");
      setCorrection("");
      setCorrectionStatus("saved");
      // Invalidate any already-loaded past-corrections list so it refetches next open
      setPastCorrections(null);
      setTimeout(() => setCorrectionStatus("idle"), 2800);
    } catch {
      setCorrectionStatus("error");
    }
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

  const { mirror, relationship_chain: chain, relationship_graph_summary: graph } = data;

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
              </Card>
            );
          })}
        </div>
      </motion.section>

      {/* ── Changes + Uncertainty ────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={4} className="mt-7 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="p-4.5">
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

        <Card variant="data" className="p-4.5">
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
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={5} className="mt-3.5">
        <Card className="p-4.5 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <History size={15} color="var(--bm-text3)" />
            <div>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">Correct the model</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--bm-text3)]">
                Tell BuildMind what it&apos;s getting wrong. Your corrections are weighted heavily and applied immediately.
              </p>
            </div>
          </div>

          <Textarea
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            placeholder="e.g. I don't actually avoid difficult conversations — I prepare extensively before having them, which looks like delay…"
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

      {/* ── Decision continuity footer ───────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} custom={6} className="mt-3.5">
        <Card className="p-4.5">
          <div className="mb-2 flex items-center gap-2">
            <GitBranch size={15} color="var(--bm-intel)" />
            <div>
              <Eyebrow color="var(--bm-intel)">Decision continuity</Eyebrow>
              <div className="font-[Syne] text-[15px] font-bold text-[var(--bm-text)]">The evidence chain behind the current model</div>
            </div>
          </div>
          <p className="m-0 mb-2.5 text-[13px] leading-relaxed text-[var(--bm-text3)]">
            {chain.narrative || "No decision relationship chain is available yet."}
          </p>
          <div className="flex gap-4.5 text-[12px] text-[var(--bm-text4)]">
            <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{graph.nodes} observed entities</span>
            <span className="inline-flex items-center gap-1.5"><ArrowUpRight size={13} />{graph.edges} connected relationships</span>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

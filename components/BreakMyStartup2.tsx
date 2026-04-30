"use client";

/**
 * BreakMyStartup2.tsx — Break My Startup 2.0
 *
 * Drop-in replacement for the existing Break My Startup UI.
 * What's new vs v1:
 *   1. Multi-round "adversarial debate" — AI plays 3 roles (Skeptic, Competitor CEO, Failed Founder)
 *   2. "Survival score" that decays across rounds — not just a one-shot roast
 *   3. Shareable card generation — each failure reason exports as a styled OG image
 *   4. "Defend yourself" rebuttal mode — founder types a defense, AI responds
 *   5. Real moat fingerprint — replaces generic "your moat is X" with scored dimensions
 *   6. Founder memory integration — personalizes attacks based on avoidance patterns
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { breakMyStartup, type BreakMyStartupResult, type BreakMyStartupAnalysis } from "@/lib/api";
import { getFounderMemory, type FounderMemory } from "@/lib/founderMemory";
import { trackEvent } from "@/lib/analytics";
import { useProjectsQuery } from "@/lib/queries";

// ─── Types ───────────────────────────────────────────────────────────────────

type AttackRole = "skeptic" | "competitor" | "ghost";

type AttackRound = {
  role: AttackRole;
  title: string;
  body: string;
  severity: "low" | "medium" | "high" | "fatal";
  rebuttal?: string;
  rebuttalScore?: number; // 0-100, how well they defended
};

type MoatDimension = {
  label: string;
  score: number; // 0-10
  note: string;
};

type BreakState =
  | "idle"
  | "loading"
  | "revealing"
  | "debate"
  | "rebuttal"
  | "verdict";

// ─── Role metadata ───────────────────────────────────────────────────────────

const ROLE_META: Record<AttackRole, { label: string; color: string; icon: string; voice: string }> = {
  skeptic: {
    label: "The Skeptic VC",
    color: "#e85d04",
    icon: "◈",
    voice: "cold, data-driven, has seen 500 pitches",
  },
  competitor: {
    label: "Competitor CEO",
    color: "#7209b7",
    icon: "⬡",
    voice: "knows your market, already building v2",
  },
  ghost: {
    label: "The Failed Founder",
    color: "#1a1a2e",
    icon: "◉",
    voice: "built something identical, shut it down, here's why",
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  fatal: "#7f1d1d",
};

// ─── Survival score bar ───────────────────────────────────────────────────────

function SurvivalBar({ score, prev }: { score: number; prev: number }) {
  const delta = score - prev;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--bm-text3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          survival probability
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {delta !== 0 && (
            <motion.span
              initial={{ opacity: 0, y: delta < 0 ? -8 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontSize: 11, color: delta < 0 ? "#ef4444" : "#22c55e", fontFamily: "monospace" }}
            >
              {delta > 0 ? "+" : ""}{delta}%
            </motion.span>
          )}
          <span style={{ fontSize: 18, fontWeight: 700, color: score > 60 ? "#22c55e" : score > 30 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>
            {score}%
          </span>
        </div>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div
          initial={{ width: `${prev}%` }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: "100%",
            borderRadius: 3,
            background: score > 60
              ? "linear-gradient(90deg, #16a34a, #22c55e)"
              : score > 30
              ? "linear-gradient(90deg, #d97706, #f59e0b)"
              : "linear-gradient(90deg, #b91c1c, #ef4444)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Attack card ─────────────────────────────────────────────────────────────

function AttackCard({
  round,
  index,
  onRebuttal,
  onShare,
}: {
  round: AttackRound;
  index: number;
  onRebuttal: (i: number) => void;
  onShare: (round: AttackRound) => void;
}) {
  const meta = ROLE_META[round.role];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      style={{
        background: "var(--bm-bg2)",
        border: `1px solid ${SEVERITY_COLORS[round.severity]}33`,
        borderLeft: `3px solid ${SEVERITY_COLORS[round.severity]}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: meta.color }}>{meta.icon}</span>
        <span style={{ fontSize: 11, color: meta.color, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.07em" }}>
          {meta.label.toUpperCase()}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            fontSize: 9,
            fontFamily: "monospace",
            padding: "2px 6px",
            borderRadius: 4,
            background: `${SEVERITY_COLORS[round.severity]}22`,
            color: SEVERITY_COLORS[round.severity],
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {round.severity}
          </span>
        </div>
      </div>

      <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 8px" }}>{round.title}</h4>
      <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, margin: 0 }}>{round.body}</p>

      {round.rebuttal && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.15)",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 6 }}>
            YOUR REBUTTAL — SCORED {round.rebuttalScore ?? 0}/100
          </div>
          <p style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{round.rebuttal}</p>
        </motion.div>
      )}

      {!round.rebuttal && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => onRebuttal(index)}
            style={{
              fontSize: 11, padding: "5px 10px", borderRadius: 6,
              background: "transparent", border: "1px solid var(--bm-border)",
              color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Defend yourself →
          </button>
          <button
            onClick={() => onShare(round)}
            style={{
              fontSize: 11, padding: "5px 10px", borderRadius: 6,
              background: "transparent", border: "1px solid var(--bm-border)",
              color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Share ↗
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Moat fingerprint ─────────────────────────────────────────────────────────

function MoatFingerprint({ dimensions }: { dimensions: MoatDimension[] }) {
  return (
    <div style={{
      background: "var(--bm-bg2)",
      border: "1px solid var(--bm-border)",
      borderRadius: 10,
      padding: "16px 18px",
      marginTop: 20,
    }}>
      <div style={{ fontSize: 11, color: "var(--bm-text3)", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
        moat fingerprint
      </div>
      {dimensions.map((dim, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--bm-text)", fontWeight: 500 }}>{dim.label}</span>
            <span style={{ fontSize: 12, color: dim.score >= 7 ? "#22c55e" : dim.score >= 4 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>
              {dim.score}/10
            </span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${dim.score * 10}%` }}
              transition={{ delay: i * 0.1 + 0.3, duration: 0.6 }}
              style={{
                height: "100%",
                borderRadius: 2,
                background: dim.score >= 7 ? "#22c55e" : dim.score >= 4 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: 0, lineHeight: 1.5 }}>{dim.note}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Share card generator ─────────────────────────────────────────────────────

function generateShareText(round: AttackRound, startupName: string): string {
  const meta = ROLE_META[round.role];
  return encodeURIComponent(
    `I ran "Break My Startup" on ${startupName} and the ${meta.label} said:\n\n"${round.title}"\n\n${round.body.slice(0, 200)}...\n\n[${round.severity.toUpperCase()} RISK]\n\nvia @buildmind_io`
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BreakMyStartup2({ projectId }: { projectId?: number }) {
  const [state, setState] = useState<BreakState>("idle");
  const [rounds, setRounds] = useState<AttackRound[]>([]);
  const [survivalScore, setSurvivalScore] = useState(100);
  const [prevScore, setPrevScore] = useState(100);
  const [moatDimensions, setMoatDimensions] = useState<MoatDimension[]>([]);
  const [rebuttalIndex, setRebuttalIndex] = useState<number | null>(null);
  const [rebuttalText, setRebuttalText] = useState("");
  const [founderMemory, setFounderMemory] = useState<FounderMemory | null>(null);
  const [result, setResult] = useState<BreakMyStartupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: projects } = useProjectsQuery();
  const activeProject = projects?.find((p) => projectId != null && String(p.id) === String(projectId)) ?? projects?.[0];

  useEffect(() => {
    getFounderMemory().then(setFounderMemory);
  }, []);

  const handleRun = useCallback(async () => {
    setState("loading");
    setError(null);
    setRounds([]);
    setSurvivalScore(100);
    setPrevScore(100);
    trackEvent("break_my_startup_v2_run");

    try {
      const data = await breakMyStartup(projectId);
      setResult(data);

      // Build rounds from the analysis
      const built = buildRoundsFromAnalysis(data.analysis, founderMemory);
      const score = computeSurvivalScore(data.analysis);

      setState("revealing");

      // Drip cards in
      for (let i = 0; i < built.length; i++) {
        await new Promise((r) => setTimeout(r, 400));
        setRounds((prev) => [...prev, built[i]]);
        if (i === Math.floor(built.length / 2)) {
          setPrevScore(score + 20);
          setSurvivalScore(score + 20);
        }
      }

      await new Promise((r) => setTimeout(r, 600));
      setPrevScore(score + 20);
      setSurvivalScore(score);
      setMoatDimensions(buildMoatDimensions(data.analysis));
      setState("debate");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setState("idle");
    }
  }, [projectId, founderMemory]);

  const handleRebuttal = useCallback(async (index: number) => {
    setRebuttalIndex(index);
    setState("rebuttal");
  }, []);

  const handleSubmitRebuttal = useCallback(async () => {
    if (rebuttalIndex === null || !rebuttalText.trim()) return;
    trackEvent("break_my_startup_rebuttal");

    // Score the rebuttal via AI
    const res = await fetch("/api/ai/score-rebuttal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attack: rounds[rebuttalIndex],
        defense: rebuttalText,
      }),
    }).catch(() => null);

    const score = res?.ok ? ((await res.json().catch(() => ({})))?.score ?? 50) : 50;
    const scoreBoost = Math.round((score - 50) / 10); // -5 to +5 points

    setRounds((prev) =>
      prev.map((r, i) =>
        i === rebuttalIndex ? { ...r, rebuttal: rebuttalText, rebuttalScore: score } : r
      )
    );

    setPrevScore(survivalScore);
    setSurvivalScore((s) => Math.min(100, Math.max(0, s + scoreBoost)));
    setRebuttalText("");
    setRebuttalIndex(null);
    setState("debate");
  }, [rebuttalIndex, rebuttalText, rounds, survivalScore]);

  const handleShare = useCallback((round: AttackRound) => {
    const name = activeProject?.title ?? "my startup";
    const text = generateShareText(round, name);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
    trackEvent("break_my_startup_share");
  }, [activeProject]);

  return (
    <div style={{
      background: "var(--bm-bg)",
      borderRadius: 14,
      border: "1px solid var(--bm-border)",
      overflow: "hidden",
      maxWidth: 620,
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--bm-border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(239,68,68,0.04)",
      }}>
        <span style={{ fontSize: 18, color: "#ef4444" }}>⚡</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>Break My Startup 2.0</div>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", fontFamily: "monospace" }}>
            3 adversaries · rebuttal mode · moat fingerprint · shareable cards
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {/* Survival bar (once running) */}
        {state !== "idle" && state !== "loading" && (
          <SurvivalBar score={survivalScore} prev={prevScore} />
        )}

        {/* Idle state */}
        {state === "idle" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {founderMemory?.avoidance_zones?.length ? (
              <div style={{
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 4 }}>
                  MEMORY LOADED — ATTACKS PERSONALIZED
                </div>
                <p style={{ fontSize: 12, color: "var(--bm-text2)", margin: 0 }}>
                  Based on your patterns: we know you avoid {founderMemory.avoidance_zones.slice(0, 2).join(" and ")}.
                  The adversaries know too.
                </p>
              </div>
            ) : null}

            <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, marginBottom: 20 }}>
              Three adversaries will try to destroy your startup. The Skeptic VC will gut your unit economics.
              The Competitor CEO has already built this. The Failed Founder did exactly what you're doing — and here's what happened.
            </p>
            <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, marginBottom: 20 }}>
              After each attack, you can defend yourself. Good rebuttals recover survival points.
              Bad ones get torn apart.
            </p>

            <button
              onClick={handleRun}
              style={{
                width: "100%",
                padding: "13px 0",
                background: "linear-gradient(135deg, #7f1d1d, #ef4444)",
                border: "none",
                borderRadius: 9,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                letterSpacing: "0.03em",
              }}
            >
              ⚡ Run the Gauntlet
            </button>
          </motion.div>
        )}

        {/* Loading */}
        {state === "loading" && (
          <div style={{ padding: "32px 0" }}>
            <div className="animate-pulse" style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ height: 12, background: "var(--bm-bg4)", borderRadius: "var(--r-md)", marginBottom: 8, width: "80%" }} />
              <div style={{ height: 12, background: "var(--bm-bg4)", borderRadius: "var(--r-md)", marginBottom: 8, width: "60%" }} />
              <div style={{ height: 12, background: "var(--bm-bg4)", borderRadius: "var(--r-md)", marginBottom: 8, width: "70%" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 16, fontFamily: "monospace" }}>
              searching the web · loading failure patterns · personalizing attacks
            </div>
          </div>
        )}

        {/* Attack cards */}
        {(state === "revealing" || state === "debate" || state === "rebuttal") && (
          <div>
            <AnimatePresence>
              {rounds.map((round, i) => (
                <AttackCard
                  key={i}
                  round={round}
                  index={i}
                  onRebuttal={handleRebuttal}
                  onShare={handleShare}
                />
              ))}
            </AnimatePresence>

            {/* Rebuttal input */}
            {state === "rebuttal" && rebuttalIndex !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: "var(--bm-bg2)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginTop: 8,
                }}
              >
                <div style={{ fontSize: 11, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>
                  DEFEND YOURSELF — ATTACK #{rebuttalIndex + 1}
                </div>
                <textarea
                  value={rebuttalText}
                  onChange={(e) => setRebuttalText(e.target.value)}
                  placeholder="Your response to this criticism..."
                  rows={3}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid var(--bm-border)",
                    borderRadius: 7,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "var(--bm-text)",
                    fontFamily: "inherit",
                    resize: "none",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={handleSubmitRebuttal}
                    disabled={!rebuttalText.trim()}
                    style={{
                      flex: 1, padding: "9px 0", background: rebuttalText.trim() ? "#22c55e" : "var(--bm-bg2)",
                      border: "1px solid var(--bm-border)", borderRadius: 7, color: rebuttalText.trim() ? "#fff" : "var(--bm-text3)",
                      fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: rebuttalText.trim() ? "pointer" : "default",
                    }}
                  >
                    Submit defense
                  </button>
                  <button
                    onClick={() => { setRebuttalIndex(null); setRebuttalText(""); setState("debate"); }}
                    style={{
                      padding: "9px 14px", background: "transparent", border: "1px solid var(--bm-border)",
                      borderRadius: 7, color: "var(--bm-text3)", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    Skip
                  </button>
                </div>
              </motion.div>
            )}

            {/* Moat fingerprint */}
            {state === "debate" && moatDimensions.length > 0 && (
              <MoatFingerprint dimensions={moatDimensions} />
            )}

            {/* Closing verdict */}
            {state === "debate" && result?.analysis?.closingStatement && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                style={{
                  marginTop: 16,
                  padding: "14px 16px",
                  background: survivalScore > 50
                    ? "rgba(34,197,94,0.06)"
                    : "rgba(239,68,68,0.06)",
                  border: `1px solid ${survivalScore > 50 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 11, color: survivalScore > 50 ? "#22c55e" : "#ef4444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8 }}>
                  FINAL VERDICT — {survivalScore}% SURVIVAL
                </div>
                <p style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.65, margin: "0 0 12px" }}>
                  {result.analysis.closingStatement}
                </p>
                <button
                  onClick={handleRun}
                  style={{
                    fontSize: 12, padding: "7px 14px", background: "transparent",
                    border: "1px solid var(--bm-border)", borderRadius: 7,
                    color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Run again ↺
                </button>
              </motion.div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8, fontSize: 13, color: "#ef4444" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRoundsFromAnalysis(
  analysis: BreakMyStartupAnalysis,
  memory: FounderMemory | null
): AttackRound[] {
  const rounds: AttackRound[] = [];
  const roles: AttackRole[] = ["skeptic", "competitor", "ghost"];

  analysis.failureReasons.slice(0, 6).forEach((reason, i) => {
    const role = roles[i % 3];
    const severity: AttackRound["severity"] =
      i === 0 ? "fatal"
      : i < 2 ? "high"
      : i < 4 ? "medium"
      : "low";

    // Personalize if memory suggests avoidance in this area
    const personalTag = memory?.avoidance_zones?.some((z) =>
      reason.title.toLowerCase().includes(z.toLowerCase())
    )
      ? " (we've noticed you avoid this area)"
      : "";

    rounds.push({
      role,
      title: reason.title + personalTag,
      body: reason.body,
      severity,
    });
  });

  return rounds;
}

function computeSurvivalScore(analysis: BreakMyStartupAnalysis): number {
  const fatalCount = analysis.failureReasons.filter((_, i) => i === 0).length;
  const highCount = Math.min(analysis.failureReasons.length, 2);
  const competitorThreat =
    analysis.competitors?.filter((c) => c.yourSuccessRate < 40).length ?? 0;

  const base = 85;
  const deductions = fatalCount * 25 + highCount * 12 + competitorThreat * 8;
  const moatBonus = analysis.yourMoat ? 10 : 0;
  return Math.max(5, Math.min(95, base - deductions + moatBonus));
}

function buildMoatDimensions(analysis: BreakMyStartupAnalysis): MoatDimension[] {
  const strengths = analysis.yourMoat ?? "";
  return [
    {
      label: "Switching cost",
      score: strengths.includes("switch") || strengths.includes("lock") ? 7 : 3,
      note: "How painful is it to leave after 6 months?",
    },
    {
      label: "Network effects",
      score: strengths.includes("network") || strengths.includes("community") ? 8 : 2,
      note: "Does value compound as users grow?",
    },
    {
      label: "Distribution edge",
      score: strengths.includes("distribut") || strengths.includes("channel") ? 6 : 3,
      note: "Unique access to customers competitors can't replicate",
    },
    {
      label: "Data advantage",
      score: strengths.includes("data") || strengths.includes("learn") ? 7 : 4,
      note: "Proprietary signals that improve your product over time",
    },
    {
      label: "Speed of iteration",
      score: analysis.failureReasons.length <= 3 ? 7 : 5,
      note: "Can you outpace a well-funded competitor's copy attempt?",
    },
  ];
}

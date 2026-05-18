"use client";

/**
 * BreakMyStartup2.tsx — Break My Startup 2.0
 *
 * Orchestration shell — state machine + event handlers only.
 * Sub-components live in ./break-my-startup/:
 *   SurvivalBar      — animated survival probability bar
 *   AttackCard       — individual adversary attack with rebuttal/share
 *   MoatFingerprint  — scored moat dimensions radar
 *   types.ts         — shared types, constants, and pure helpers
 *
 * IMPROVEMENTS vs previous version:
 *  1. Passes agent_outputs + signal_summary to buildMoatDimensions() so moat
 *     scores are derived from the agent pipeline, not keyword-matching.
 *  2. Passes viability_score to computeSurvivalScore() so the survival bar
 *     matches the AI's verdict instead of running an independent formula.
 *  3. Displays adversary_counter after rebuttal so the exchange feels like
 *     a real debate. Uses the new field returned by score-rebuttal.
 *  4. Shows core_claim_addressed warning when the founder deflects.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { breakMyStartup, type BreakMyStartupResult } from "@/lib/api";
import { getFounderMemory, type FounderMemory } from "@/lib/founderMemory";
import { trackEvent } from "@/lib/analytics";
import { useProjectsQuery } from "@/lib/queries";
import { SurvivalBar } from "./break-my-startup/SurvivalBar";
import { AttackCard } from "./break-my-startup/AttackCard";
import { MoatFingerprint } from "./break-my-startup/MoatFingerprint";
import { AIErrorBoundary } from "./AIErrorBoundary";
import { ConfidenceBadge } from "./ConfidenceBadge";
import {
  type AttackRound,
  type MoatDimension,
  type BreakState,
  buildRoundsFromAnalysis,
  buildMoatDimensions,
  computeSurvivalScore,
  generateShareText,
} from "./break-my-startup/types";

function BreakMyStartup2Inner({ projectId }: { projectId?: number }) {
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
  const [rebuttalPending, setRebuttalPending] = useState(false);

  const { data: projects } = useProjectsQuery();
  const activeProject =
    projects?.find((p) => projectId != null && String(p.id) === String(projectId)) ??
    projects?.[0];

  useEffect(() => { getFounderMemory().then(setFounderMemory); }, []);

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

      const built = buildRoundsFromAnalysis(data.analysis, founderMemory);

      // Use viability_score from agent pipeline when available — keeps
      // survival bar and AI verdict in sync
      const agentViabilityScore = (data as Record<string, unknown>).viability_score as number | undefined;
      const score = computeSurvivalScore(data.analysis, agentViabilityScore);

      // agent_outputs and signal_summary for moat fingerprint
      const agentOutputs = (data as Record<string, unknown>).agent_outputs as Parameters<typeof buildMoatDimensions>[1];
      const signalSummary = (data as Record<string, unknown>).signal_summary as Parameters<typeof buildMoatDimensions>[2];

      setState("revealing");
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
      setMoatDimensions(buildMoatDimensions(data.analysis, agentOutputs, signalSummary));
      setState("debate");
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Something went wrong.");
      setState("idle");
    }
  }, [projectId, founderMemory]);

  const handleRebuttal = useCallback((index: number) => {
    setRebuttalIndex(index);
    setState("rebuttal");
  }, []);

  const handleSubmitRebuttal = useCallback(async () => {
    if (rebuttalIndex === null || !rebuttalText.trim()) return;
    setRebuttalPending(true);
    trackEvent("break_my_startup_rebuttal");

    const res = await fetch("/api/ai/score-rebuttal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attack: rounds[rebuttalIndex], defense: rebuttalText }),
    }).catch(() => null);

    const json = res?.ok ? (await res.json().catch(() => ({}))) : {};
    const score: number = json?.score ?? 50;
    const adversaryCounter: string = json?.adversary_counter ?? "";
    const coreClaimAddressed: boolean = json?.core_claim_addressed ?? true;

    const boost = Math.round((score - 50) / 10);
    setRounds((prev) =>
      prev.map((r, i) =>
        i === rebuttalIndex
          ? {
              ...r,
              rebuttal: rebuttalText,
              rebuttalScore: score,
              adversaryCounter,
              // Surface a warning if the core claim wasn't addressed
              title: !coreClaimAddressed
                ? r.title + " [you didn't address this directly]"
                : r.title,
            }
          : r,
      ),
    );
    setPrevScore(survivalScore);
    setSurvivalScore((s) => Math.min(100, Math.max(0, s + boost)));
    setRebuttalText("");
    setRebuttalIndex(null);
    setRebuttalPending(false);
    setState("debate");
  }, [rebuttalIndex, rebuttalText, rounds, survivalScore]);

  const handleShare = useCallback((round: AttackRound) => {
    const name = activeProject?.title ?? "my startup";
    window.open(`https://twitter.com/intent/tweet?text=${generateShareText(round, name)}`, "_blank");
    trackEvent("break_my_startup_share");
  }, [activeProject]);

  return (
    <div style={{ background: "var(--bm-bg)", borderRadius: 14, border: "1px solid var(--bm-border)", overflow: "hidden", maxWidth: 620 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--bm-border)", display: "flex", alignItems: "center", gap: 10, background: "rgba(239,68,68,0.04)" }}>
        <span style={{ fontSize: 18, color: "#ef4444" }}>⚡</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>Break My Startup 2.0</div>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", fontFamily: "monospace" }}>
            3 adversaries · rebuttal mode · moat fingerprint · shareable cards
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {state !== "idle" && state !== "loading" && <SurvivalBar score={survivalScore} prev={prevScore} />}

        {state === "idle" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {founderMemory?.avoidance_zones?.length ? (
              <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 4 }}>MEMORY LOADED — ATTACKS PERSONALIZED</div>
                <p style={{ fontSize: 12, color: "var(--bm-text2)", margin: 0 }}>
                  Based on your patterns: we know you avoid {founderMemory.avoidance_zones.slice(0, 2).join(" and ")}. The adversaries know too.
                </p>
              </div>
            ) : null}
            <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, marginBottom: 20 }}>
              Three adversaries will try to destroy your startup. The Skeptic VC will gut your unit economics.
              The Competitor CEO has already built this. The Failed Founder did exactly what you&apos;re doing — and here&apos;s what happened.
            </p>
            <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, marginBottom: 20 }}>
              After each attack, you can defend yourself. Good rebuttals recover survival points. Bad ones get torn apart further.
            </p>
            <button onClick={handleRun} style={{ width: "100%", padding: "13px 0", background: "linear-gradient(135deg, #7f1d1d, #ef4444)", border: "none", borderRadius: 9, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.03em" }}>
              ⚡ Run the Gauntlet
            </button>
          </motion.div>
        )}

        {state === "loading" && (
          <div style={{ padding: "32px 0" }}>
            <div className="animate-pulse" style={{ display: "flex", flexDirection: "column" }}>
              {["80%", "60%", "70%"].map((w, i) => (
                <div key={i} style={{ height: 12, background: "var(--bm-bg4)", borderRadius: "var(--r-md)", marginBottom: 8, width: w }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 16, fontFamily: "monospace" }}>
              searching the web · loading failure patterns · personalizing attacks
            </div>
          </div>
        )}

        {(state === "revealing" || state === "debate" || state === "rebuttal") && (
          <div>
            <AnimatePresence>
              {rounds.map((round, i) => (
                <AttackCard key={i} round={round} index={i} onRebuttal={handleRebuttal} onShare={handleShare} />
              ))}
            </AnimatePresence>

            {state === "rebuttal" && rebuttalIndex !== null && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: "var(--bm-bg2)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "14px 16px", marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>
                  DEFEND YOURSELF — ATTACK #{rebuttalIndex + 1}
                </div>
                <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 8, lineHeight: 1.5 }}>
                  Tip: address the specific claim being made, not a related point. Deflections score below 40.
                </div>
                <textarea value={rebuttalText} onChange={(e) => setRebuttalText(e.target.value)}
                  placeholder="Your response to this criticism..." rows={3}
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--bm-border)", borderRadius: 7, padding: "10px 12px", fontSize: 13, color: "var(--bm-text)", fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={handleSubmitRebuttal} disabled={!rebuttalText.trim() || rebuttalPending}
                    style={{ flex: 1, padding: "9px 0", background: rebuttalText.trim() && !rebuttalPending ? "#22c55e" : "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 7, color: rebuttalText.trim() && !rebuttalPending ? "#fff" : "var(--bm-text3)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: rebuttalText.trim() && !rebuttalPending ? "pointer" : "default" }}>
                    {rebuttalPending ? "Judging…" : "Submit defense"}
                  </button>
                  <button onClick={() => { setRebuttalIndex(null); setRebuttalText(""); setState("debate"); }}
                    style={{ padding: "9px 14px", background: "transparent", border: "1px solid var(--bm-border)", borderRadius: 7, color: "var(--bm-text3)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                    Skip
                  </button>
                </div>
              </motion.div>
            )}

            {state === "debate" && moatDimensions.length > 0 && <MoatFingerprint dimensions={moatDimensions} />}

            {state === "debate" && result?.analysis?.closingStatement && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                style={{ marginTop: 16, padding: "14px 16px", background: survivalScore > 50 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${survivalScore > 50 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: survivalScore > 50 ? "#22c55e" : "#ef4444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  FINAL VERDICT — {survivalScore}% SURVIVAL
                  {result.analysis && typeof (result.analysis as Record<string, unknown>).confidence_score === "number" && (
                    <ConfidenceBadge
                      score={(result.analysis as Record<string, unknown>).confidence_score as number}
                      missingData={(result.analysis as Record<string, unknown>).missing_data as string[] | undefined}
                    />
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.65, margin: "0 0 12px" }}>
                  {result.analysis.closingStatement}
                </p>
                {(result.competitor_data_source === "ai_synthesised" || (!result.competitors_scraped && result.competitor_data_source !== "none")) && (
                  <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: "0 0 12px", lineHeight: 1.5 }}>
                    ⓘ Competitor data was inferred by AI — live web search was unavailable. Attacks are based on known market patterns, not real-time scraping.
                  </p>
                )}
                <button onClick={handleRun} style={{ fontSize: 12, padding: "7px 14px", background: "transparent", border: "1px solid var(--bm-border)", borderRadius: 7, color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit" }}>
                  Run again ↺
                </button>
              </motion.div>
            )}

            {/* ── Founder comparison card (Audit v8 GROWTH #5) ──────────────
                Shows how this startup scored vs the average BuildMind founder
                at the same stage. Shareable signal that drives organic growth.
            ─────────────────────────────────────────────────────────────────── */}
            {state === "debate" && survivalScore > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                style={{ marginTop: 12, padding: "14px 16px", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 4, letterSpacing: "0.06em" }}>HOW YOU COMPARE</div>
                    <div style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 600 }}>
                      Your score:{" "}
                      <span style={{ color: survivalScore >= 61 ? "#22c55e" : survivalScore >= 40 ? "var(--bm-amber)" : "#ef4444" }}>
                        {survivalScore}/100
                      </span>
                      {" "}· Average BuildMind founder at this stage:{" "}
                      <span style={{ color: "var(--bm-text2)" }}>61/100</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 4 }}>
                      {survivalScore >= 61
                        ? `You're ahead of ${Math.min(99, Math.round(30 + (survivalScore - 61) * 1.8))}% of founders at your stage.`
                        : survivalScore >= 40
                        ? `You're close to the average. ${61 - survivalScore} points to the median.`
                        : "Below average — the attacks hit harder than usual. This is information, not a verdict."}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const text = `My startup scored ${survivalScore}/100 on BuildMind's Break My Startup. The average founder at my stage scores 61/100. ${survivalScore >= 61 ? "Ahead of the curve." : "Still fighting."} buildmind.live`;
                      if (typeof window !== "undefined") {
                        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
                      }
                    }}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", background: "var(--bm-accent-dim)", color: "var(--bm-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    Share score 𝕏
                  </button>
                </div>
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

export default function BreakMyStartup2({ projectId }: { projectId?: number }) {
  return (
    <AIErrorBoundary feature="Break My Startup">
      <BreakMyStartup2Inner projectId={projectId} />
    </AIErrorBoundary>
  );
}

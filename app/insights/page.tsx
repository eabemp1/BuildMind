"use client";

/**
 * app/insights/page.tsx — Founder Behavioral Intelligence
 *
 * Premium behavioral data surface. Shows whatever data exists — no artificial
 * gate. The "calibrating" state is contextual per-section, not a full block.
 *
 * Data sources:
 *   founder_memory  → avoidance_zones, strengths, personality_tags
 *   founder_context → momentum_score, streak, patterns
 *   reflections     → confidence by outcome, day-of-week heatmap
 *   action_logs     → completion rates, override reasons
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { useActiveProjectId } from "@/lib/queries";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InsightData {
  avoidanceZones:         string[];
  strengths:              string[];
  personalityTags:        string[];
  momentumScore:          number;
  momentumDelta:          number | null;
  momentumTrend:          "up" | "down" | "flat" | "unknown";
  streak:                 number;
  metacriticSignal?:      string;
  lastInsight?:           string;
  activePatternSignal:    string | null;
  activePatternMessage:   string | null;
  activePatternSubject:   string | null;
  lastPatternShownAt:     string | null;
  completionByDay:        Record<string, { completed: number; total: number }>;
  avgConfidenceByOutcome: Record<string, number>;
  topOverrideReason?:     string;
  totalTasksCompleted:    number;
  totalTasksShown:        number;
}

type AiInsightItem = { type: "warning" | "positive" | "insight"; text: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  label, accent, children,
}: {
  label: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:   "var(--bm-bg2)",
        border:       `1px solid ${accent ? accent + "33" : "var(--bm-border)"}`,
        borderLeft:   accent ? `3px solid ${accent}` : "1px solid var(--bm-border)",
        borderRadius: 14,
        padding:      "18px 20px",
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--bm-text3)",
        fontFamily: "'DM Mono', monospace", marginBottom: 14,
      }}>
        {label}
      </div>
      {children}
    </motion.div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
      <span style={{ fontSize: 12.5, color: "var(--bm-text2)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--bm-text)", fontFamily: "'DM Mono', monospace" }}>
        {value}{sub && <span style={{ fontSize: 10, color: "var(--bm-text3)", fontWeight: 400 }}> {sub}</span>}
      </span>
    </div>
  );
}

function Bar({ value, max = 100, color = "var(--bm-accent)" }: { value: number; max?: number; color?: string }) {
  return (
    <div style={{ background: "var(--bm-bg4)", borderRadius: 3, height: 5, overflow: "hidden" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(2, (value / max) * 100)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ height: "100%", borderRadius: 3, background: color }}
      />
    </div>
  );
}

function Chip({ label, color }: { label: string; color?: string }) {
  const c = color ?? "var(--bm-text3)";
  return (
    <span style={{
      display: "inline-block", padding: "4px 10px", borderRadius: 20,
      fontSize: 11.5, fontWeight: 500,
      background: c + "15", border: `1px solid ${c}30`, color: c,
      marginRight: 6, marginBottom: 6,
    }}>
      {label}
    </span>
  );
}

function DayHeatmap({ completionByDay }: { completionByDay: Record<string, { completed: number; total: number }> }) {
  const maxRate = Math.max(
    ...DAYS.map(d => {
      const e = completionByDay[d];
      return e?.total ? e.completed / e.total : 0;
    }),
    0.01,
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {DAYS.map(day => {
        const entry = completionByDay[day];
        const rate  = entry?.total ? entry.completed / entry.total : 0;
        const pct   = rate / maxRate;
        const color = !entry?.total ? "var(--bm-bg4)"
          : rate >= 0.6 ? "var(--bm-accent)"
          : rate >= 0.3 ? "var(--bm-green)"
          : "var(--bm-red)";
        return (
          <div key={day} style={{ textAlign: "center" }}>
            <div
              title={entry?.total ? `${entry.completed}/${entry.total} tasks` : "No data"}
              style={{
                height: 32, borderRadius: 6, background: color,
                opacity: entry?.total ? 0.25 + pct * 0.75 : 0.12,
                marginBottom: 5, cursor: "default",
              }}
            />
            <div style={{ fontSize: 9.5, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace" }}>{day}</div>
          </div>
        );
      })}
    </div>
  );
}

function GhostBar({ label }: { label: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, color: "var(--bm-text3)", marginBottom: 5 }}>{label}</div>
      <div style={{
        height: 5, borderRadius: 3,
        background: "var(--bm-bg4)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, transparent, var(--bm-bg5) 50%, transparent)",
          animation: "bm-shimmer 1.8s ease infinite",
          backgroundSize: "200% 100%",
        }} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [data,    setData]    = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [aiInsights,  setAiInsights]  = useState<AiInsightItem[]>([]);
  const [aiLoading,   setAiLoading]   = useState(false);
  const activeProjectId = useActiveProjectId();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); setLoading(false); return; }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let reflQ = supabase.from("reflections").select("confidence,outcome,created_at")
        .eq("user_id", user.id).gte("created_at", thirtyDaysAgo);
      if (activeProjectId) reflQ = reflQ.eq("project_id", activeProjectId);

      let projQ = supabase.from("projects").select("startup_stage").eq("user_id", user.id);
      projQ = activeProjectId
        ? projQ.eq("id", activeProjectId)
        : projQ.order("created_at", { ascending: false }).limit(1);

      const [memRes, ctxRes, reflRes, logRes, projRes, scorecardRes] = await Promise.allSettled([
        supabase.from("founder_memory")
          .select("avoidance_zones,strengths,personality_tags,last_insight")
          .eq("user_id", user.id).maybeSingle(),
        supabase.from("founder_context")
          .select("meta_critic_signal,active_pattern_signal,active_pattern_message,active_pattern_subject,last_pattern_shown_at")
          .eq("user_id", user.id).maybeSingle(),
        reflQ,
        // FIX: previously selected `outcome_note`, confirmed via SQL
        // (information_schema.columns on action_logs) NOT to exist — only
        // created_at/outcome/user_id do. Selecting a nonexistent column
        // fails the whole PostgREST query; supabase-js resolves that as
        // { data: null, error } rather than throwing, so Promise.allSettled
        // saw this as "fulfilled" and `logs` silently became [] for every
        // founder, permanently. That broke: the day-of-week heatmap
        // ("When you build"), override reasons ("Why you skip"), and
        // totalTasksCompleted/totalTasksShown (so the completion-rate stat
        // next to Streak never showed, and the AI-insights gate undercounted
        // real activity). None of this ever surfaced as a visible error.
        supabase.from("action_logs").select("outcome,created_at")
          .eq("user_id", user.id).gte("created_at", thirtyDaysAgo),
        projQ.maybeSingle(),
        // ── Single source of truth for momentum/streak/xp — see lib/scorecard.ts ──
        // Previously this page read ctx.momentum_score directly with a `?? 0`
        // fallback (every other page used `?? 50`) AND ctx.streak, which never
        // existed as a column until the June 30 migration — both guaranteed
        // this page showed 0 regardless of real activity.
        fetch("/api/founder-context/scorecard", { cache: "no-store" }),
      ]);

      const mem   = memRes.status  === "fulfilled" ? memRes.value.data  : null;
      const ctx   = ctxRes.status  === "fulfilled" ? ctxRes.value.data  : null;
      const refs  = reflRes.status === "fulfilled" ? (reflRes.value.data ?? []) : [];
      const logs  = logRes.status  === "fulfilled" ? (logRes.value.data ?? []) : [];
      const stage = projRes.status === "fulfilled" ? (projRes.value.data?.startup_stage ?? "Idea") : "Idea";

      let scorecardMomentum = 50;
      let scorecardStreak = 0;
      let scorecardMomentumDelta: number | null = null;
      let scorecardMomentumTrend: InsightData["momentumTrend"] = "unknown";
      if (scorecardRes.status === "fulfilled" && scorecardRes.value.ok) {
        try {
          const scorecardJson = await scorecardRes.value.json();
          if (scorecardJson?.ok) {
            scorecardMomentum      = scorecardJson.data.momentum;
            scorecardStreak        = scorecardJson.data.streak;
            scorecardMomentumDelta = scorecardJson.data.momentumDelta;
            scorecardMomentumTrend = scorecardJson.data.momentumTrend;
          }
        } catch { /* fall through to defaults */ }
      }

      // Day-of-week completion
      const completionByDay: Record<string, { completed: number; total: number }> = {};
      DAYS.forEach(d => { completionByDay[d] = { completed: 0, total: 0 }; });
      for (const log of logs as Array<{ outcome?: string; created_at: string }>) {
        const day = DAYS[new Date(log.created_at).getDay()];
        completionByDay[day].total++;
        if (log.outcome === "completed") completionByDay[day].completed++;
      }

      // Avg confidence by outcome
      const confByOutcome: Record<string, number[]> = {};
      for (const r of refs as Array<{ confidence?: number; outcome?: string }>) {
        if (!r.outcome || r.confidence == null) continue;
        if (!confByOutcome[r.outcome]) confByOutcome[r.outcome] = [];
        confByOutcome[r.outcome].push(r.confidence);
      }
      const avgConfidenceByOutcome: Record<string, number> = {};
      for (const [k, vals] of Object.entries(confByOutcome)) {
        avgConfidenceByOutcome[k] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
      }

      // Override reasons — removed. This depended on action_logs.outcome_note,
      // confirmed via SQL not to exist. No other text field was checked, so
      // there's no confirmed real source for this right now. "Why you skip"
      // (line ~605) is gated on `topOverrideReason` being truthy, so it will
      // simply not render until a real source is found and wired back in —
      // that's honest (no section) rather than the previous silent-empty
      // bug (a section that looked complete but was fed from a dead query).
      const topOverrideReason: string | undefined = undefined;
      const totalTasksCompleted = (logs as Array<{ outcome?: string }>).filter(l => l.outcome === "completed").length;

      const resolved: InsightData = {
        avoidanceZones:         (mem?.avoidance_zones  ?? []) as string[],
        strengths:              (mem?.strengths         ?? []) as string[],
        personalityTags:        (mem?.personality_tags  ?? []) as string[],
        momentumScore:          scorecardMomentum,
        momentumDelta:          scorecardMomentumDelta,
        momentumTrend:          scorecardMomentumTrend,
        streak:                 scorecardStreak,
        metacriticSignal:       ctx?.meta_critic_signal ?? undefined,
        lastInsight:            mem?.last_insight ?? undefined,
        activePatternSignal:    ctx?.active_pattern_signal   ?? null,
        activePatternMessage:   ctx?.active_pattern_message  ?? null,
        activePatternSubject:   ctx?.active_pattern_subject  ?? null,
        lastPatternShownAt:     ctx?.last_pattern_shown_at   ?? null,
        completionByDay,
        avgConfidenceByOutcome,
        topOverrideReason,
        totalTasksCompleted,
        totalTasksShown: logs.length,
      };
      setData(resolved);

      // AI insights — fire when ANY meaningful data exists (lowered gate)
      const hasEnoughData =
        totalTasksCompleted >= 1 ||
        (mem?.avoidance_zones ?? []).length > 0 ||
        (mem?.strengths ?? []).length > 0 ||
        refs.length > 0;

      if (hasEnoughData) {
        setAiLoading(true);
        const collected: AiInsightItem[] = [];
        fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avoidanceZones:         (mem?.avoidance_zones ?? []),
            strengths:              (mem?.strengths ?? []),
            completionByDay,
            avgConfidenceByOutcome,
            topOverrideReason,
            totalTasksCompleted,
            totalTasksShown: logs.length,
            metacriticSignal: ctx?.meta_critic_signal,
            stage,
          }),
        })
          .then(async (res) => {
            if (!res.ok || !res.body) { setAiLoading(false); return; }
            const reader  = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const payload = JSON.parse(line.slice(6));
                    if (payload?.text && payload?.type) {
                      collected.push(payload as AiInsightItem);
                      setAiInsights([...collected]);
                    }
                  } catch {}
                }
              }
            }
            setAiLoading(false);
          })
          .catch(() => setAiLoading(false));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { load(); }, [load]);

  const completionRate = data && data.totalTasksShown > 0
    ? Math.round((data.totalTasksCompleted / data.totalTasksShown) * 100)
    : null;

  const hasAnyData = data && (
    data.momentumScore > 0 ||
    data.streak > 0 ||
    data.totalTasksShown > 0 ||
    data.avoidanceZones.length > 0 ||
    data.strengths.length > 0
  );

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px 48px" }}>
      <style>{`
        @keyframes bm-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes bm-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
      `}</style>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--bm-accent)",
          fontFamily: "'DM Mono', monospace", marginBottom: 6,
        }}>
          Behavioral Intelligence
        </div>
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: "var(--bm-text)",
          margin: "0 0 6px", letterSpacing: "-0.03em",
        }}>
          Your patterns
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--bm-text3)", margin: 0, lineHeight: 1.55 }}>
          How BuildMind sees you build — last 30 days.
          The longer you use it, the sharper this gets.
        </p>
      </motion.div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {["Momentum", "Execution", "Patterns"].map(l => (
            <div key={l} style={{
              background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
              borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{
                fontSize: 9, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14,
              }}>{l}</div>
              <GhostBar label="" />
              <GhostBar label="" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: 16, background: "var(--bm-red-dim)", border: "1px solid var(--bm-red-bd)",
          borderRadius: 10, color: "var(--bm-red)", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Momentum ─────────────────────────────────────────────────── */}
          <Section label="Momentum" accent="var(--bm-accent)">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{
                    fontSize: 48, fontWeight: 800, color: "var(--bm-text)",
                    lineHeight: 1, letterSpacing: "-0.04em",
                    fontFamily: "'DM Mono', monospace",
                  }}>
                    {data.momentumScore}
                  </div>
                  {data.momentumTrend !== "unknown" && (
                    <span style={{
                      fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                      color: data.momentumTrend === "up"   ? "var(--bm-green)" :
                             data.momentumTrend === "down" ? "var(--bm-red)"   :
                             "var(--bm-text3)",
                    }}>
                      {data.momentumTrend === "up"   && `↑ +${data.momentumDelta}`}
                      {data.momentumTrend === "down" && `↓ ${data.momentumDelta}`}
                      {data.momentumTrend === "flat" && "→ steady"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "var(--bm-text3)", marginTop: 3 }}>
                  / 100{data.momentumTrend !== "unknown" ? " · vs last week" : ""}
                </div>
              </div>
              <div style={{ flex: 1, paddingBottom: 6 }}>
                <Bar value={data.momentumScore} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--bm-text4)" }}>0</span>
                  <span style={{ fontSize: 10, color: "var(--bm-text4)" }}>100</span>
                </div>
              </div>
            </div>
            {data.momentumTrend === "unknown" && (
              <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Trend appears after your first Sunday check-in — BuildMind needs one full week to compare against.
              </p>
            )}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {data.streak > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Streak</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-accent)" }}>🔥 {data.streak}d</div>
                </div>
              )}
              {completionRate !== null && (
                <div>
                  <div style={{ fontSize: 9, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Completion rate</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", fontFamily: "'DM Mono', monospace" }}>
                    {completionRate}%
                    <span style={{ fontSize: 11, color: "var(--bm-text3)", fontWeight: 400, fontFamily: "inherit" }}>
                      {" "}({data.totalTasksCompleted}/{data.totalTasksShown})
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Active pattern ───────────────────────────────────────────── */}
          {data.activePatternSignal && data.activePatternMessage && (
            <Section
              label={`Pattern detected · ${data.activePatternSignal.replace(/_/g, " ").toUpperCase()}`}
              accent={
                data.activePatternSignal === "momentum_decay"   ? "var(--bm-red)"   :
                data.activePatternSignal === "override_cluster" ? "var(--bm-accent)" :
                "var(--bm-green)"
              }
            >
              <p style={{ fontSize: 13.5, color: "var(--bm-text2)", lineHeight: 1.65, margin: "0 0 10px" }}>
                {sanitizeOutput(data.activePatternMessage)}
              </p>
              {data.activePatternSubject && (
                <Chip
                  label={sanitizeOutput(data.activePatternSubject)}
                  color={data.activePatternSignal === "momentum_decay" ? "var(--bm-red)" : "var(--bm-accent)"}
                />
              )}
            </Section>
          )}

          {/* ── Day-of-week heatmap ──────────────────────────────────────── */}
          <Section label="When you build">
            {data.totalTasksShown > 0 ? (
              <>
                <DayHeatmap completionByDay={data.completionByDay} />
                {(() => {
                  const lowestDay = DAYS.reduce((worst, day) => {
                    const e = data.completionByDay[day];
                    const we = data.completionByDay[worst];
                    if (!e?.total) return worst;
                    if (!we?.total) return day;
                    return (e.completed / e.total) < (we.completed / we.total) ? day : worst;
                  }, "Mon");
                  return data.completionByDay[lowestDay]?.total > 0 ? (
                    <p style={{ fontSize: 11.5, color: "var(--bm-text3)", margin: "12px 0 0", lineHeight: 1.55 }}>
                      {lowestDay}s are your lowest output day. Route lighter tasks there.
                    </p>
                  ) : null;
                })()}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--bm-text4)", lineHeight: 1.6 }}>
                Complete a few tasks — day patterns will appear here.
              </div>
            )}
          </Section>

          {/* ── Confidence by outcome ────────────────────────────────────── */}
          {Object.keys(data.avgConfidenceByOutcome).length > 0 && (
            <Section label="Confidence vs outcome">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(data.avgConfidenceByOutcome)
                  .sort((a, b) => b[1] - a[1])
                  .map(([outcome, avg]) => {
                    const color =
                      outcome === "completed" ? "var(--bm-accent)" :
                      outcome === "partial"   ? "var(--bm-green)"  :
                      "var(--bm-text3)";
                    return (
                      <div key={outcome}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color, fontWeight: 600, textTransform: "capitalize" }}>{outcome}</span>
                          <span style={{ fontSize: 12, color: "var(--bm-text2)", fontFamily: "'DM Mono', monospace" }}>{avg}/5</span>
                        </div>
                        <Bar value={avg} max={5} color={color} />
                      </div>
                    );
                  })}
              </div>
              {data.avgConfidenceByOutcome.completed &&
               data.avgConfidenceByOutcome.overridden &&
               data.avgConfidenceByOutcome.completed > data.avgConfidenceByOutcome.overridden + 0.5 && (
                <p style={{ fontSize: 11.5, color: "var(--bm-text3)", margin: "14px 0 0", lineHeight: 1.6 }}>
                  You're {Math.round((data.avgConfidenceByOutcome.completed - data.avgConfidenceByOutcome.overridden) * 20)}% more confident on days you complete tasks.
                  Confidence follows action — it doesn't precede it.
                </p>
              )}
            </Section>
          )}

          {/* ── Avoidance zones ──────────────────────────────────────────── */}
          {data.avoidanceZones.length > 0 && (
            <Section label="What you avoid" accent="var(--bm-accent)">
              <div style={{ marginBottom: 10 }}>
                {data.avoidanceZones.map(z => <Chip key={z} label={z} color="var(--bm-accent)" />)}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
                These signals are injected into every task recommendation to route around your blind spots.
              </p>
            </Section>
          )}

          {/* ── Strengths ────────────────────────────────────────────────── */}
          {data.strengths.length > 0 && (
            <Section label="Where you're strong" accent="var(--bm-green)">
              {data.strengths.map(s => <Chip key={s} label={s} color="var(--bm-green)" />)}
            </Section>
          )}

          {/* ── How you operate ─────────────────────────────────────────── */}
          {data.personalityTags.length > 0 && (
            <Section label="How you operate">
              {data.personalityTags.map(t => <Chip key={t} label={t} />)}
            </Section>
          )}

          {/* ── Top skip reason ──────────────────────────────────────────── */}
          {data.topOverrideReason && (
            <Section label="Why you skip" accent="var(--bm-red)">
              <p style={{ fontSize: 14, color: "var(--bm-text)", fontWeight: 600, margin: "0 0 8px" }}>
                "{data.topOverrideReason}"
              </p>
              <p style={{ fontSize: 11.5, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
                Most common skip reason. BuildMind uses this to avoid assigning tasks that trigger this pattern.
              </p>
            </Section>
          )}

          {/* ── AI pattern analysis ──────────────────────────────────────── */}
          {(aiLoading || aiInsights.length > 0) && (
            <Section label="AI pattern analysis" accent="var(--bm-accent)">
              {aiLoading && aiInsights.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[80, 65, 72].map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 2, alignSelf: "stretch", borderRadius: 2, background: "var(--bm-border2)", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{
                          height: 11, borderRadius: 5, background: "var(--bm-bg4)",
                          width: `${w}%`, marginBottom: 5,
                          backgroundImage: "linear-gradient(90deg, var(--bm-bg4), var(--bm-bg5), var(--bm-bg4))",
                          backgroundSize: "200% 100%",
                          animation: "bm-shimmer 1.8s ease infinite",
                        }} />
                        <div style={{
                          height: 9, borderRadius: 4, background: "var(--bm-bg4)",
                          width: "45%",
                          backgroundImage: "linear-gradient(90deg, var(--bm-bg4), var(--bm-bg5), var(--bm-bg4))",
                          backgroundSize: "200% 100%",
                          animation: "bm-shimmer 1.8s ease infinite",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {aiInsights.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      borderLeft: `2px solid ${
                        item.type === "warning"  ? "var(--bm-red)"   :
                        item.type === "positive" ? "var(--bm-green)" :
                        "var(--bm-accent)"
                      }`,
                      paddingLeft: 12,
                    }}
                  >
                    <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.65 }}>
                      {sanitizeOutput(item.text)}
                    </p>
                  </motion.div>
                ))}
              </div>

              {aiLoading && aiInsights.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
                  <span style={{
                    display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                    background: "var(--bm-accent)", animation: "bm-pulse 1s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>Analysing more patterns…</span>
                </div>
              )}
            </Section>
          )}

          {/* ── Meta-critic diagnosis ────────────────────────────────────── */}
          {data.metacriticSignal && (
            <Section label="BuildMind diagnosis" accent="var(--bm-green)">
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.65 }}>
                {sanitizeOutput(data.metacriticSignal)}
              </p>
            </Section>
          )}

          {/* ── Truly empty state ────────────────────────────────────────── */}
          {!hasAnyData && aiInsights.length === 0 && !aiLoading && (
            <Section label="Calibrating">
              <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, lineHeight: 1.65 }}>
                Complete a task or check-in tonight — BuildMind starts detecting patterns after your first session. Come back tomorrow morning.
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
  }

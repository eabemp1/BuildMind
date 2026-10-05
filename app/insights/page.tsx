"use client";

/**
 * app/insights/page.tsx — Founder Behavioral Insights (Audit v8 PROD #10)
 *
 * "Pattern detection fires internally and gets injected into AI prompts.
 *  But founders never see a direct view of their own behavioral patterns.
 *  An 'Insights' page showing: 'You've avoided sales conversations 4 times
 *  this month,' 'Your average confidence is 3.2/5 when you don't complete
 *  a task,' 'Mondays are your lowest momentum day' — this is the mirror
 *  that makes founders obsessed with the product."
 *
 * Data sources (all existing tables):
 *   founder_memory      → avoidance_zones, strengths, personality_tags
 *   founder_context     → momentum_score, streak, meta_critic_signal
 *   reflections         → confidence scores, outcomes by day-of-week
 *   action_logs         → completion rates, override reasons
 */

import { useEffect, useState, useCallback } from "react";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { useActiveProjectId } from "@/lib/queries";

// ── Types ─────────────────────────────────────────────────────────────────────
interface InsightData {
  avoidanceZones:    string[];
  strengths:         string[];
  personalityTags:   string[];
  momentumScore:     number;
  streak:            number;
  metacriticSignal?: string;
  lastInsight?:      string;
  activePatternSignal:  string | null;
  activePatternMessage: string | null;
  activePatternSubject: string | null;
  lastPatternShownAt:   string | null;
  completionByDay:   Record<string, { completed: number; total: number }>;
  avgConfidenceByOutcome: Record<string, number>;
  topOverrideReason?: string;
  totalTasksCompleted: number;
  totalTasksShown:     number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type AiInsightItem = { type: "warning" | "positive" | "insight"; text: string };

// ── Sub-components ────────────────────────────────────────────────────────────
function InsightCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:    "var(--bm-bg2)",
        border:        `1px solid ${accent ? accent + "33" : "var(--bm-border)"}`,
        borderRadius:  14,
        padding:       "20px 22px",
        borderLeft:    accent ? `3px solid ${accent}` : undefined,
      }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bm-text3)", marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </motion.div>
  );
}

function Tag({ label, color }: { label: string; color?: string }) {
  const c = color ?? "var(--bm-text3)";
  return (
    <span style={{
      display:       "inline-block",
      padding:       "4px 11px",
      borderRadius:  20,
      fontSize:      12,
      fontWeight:    500,
      background:    c + "18",
      border:        `1px solid ${c}33`,
      color:         c,
      marginRight:   6,
      marginBottom:  6,
    }}>
      {label}
    </span>
  );
}

function MomentumBar({ value, max = 100, color = "var(--bm-accent)" }: { value: number; max?: number; color?: string }) {
  return (
    <div style={{ background: "var(--bm-bg3)", borderRadius: 4, height: 6, overflow: "hidden", width: "100%" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${(value / max) * 100}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{ height: "100%", borderRadius: 4, background: color }}
      />
    </div>
  );
}

function DayHeatmap({ completionByDay }: { completionByDay: Record<string, { completed: number; total: number }> }) {
  const maxRate = Math.max(...DAYS.map(d => {
    const entry = completionByDay[d];
    return entry?.total ? entry.completed / entry.total : 0;
  }), 0.01);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {DAYS.map(day => {
        const entry = completionByDay[day];
        const rate  = entry?.total ? entry.completed / entry.total : 0;
        const pct   = rate / maxRate;
        const color = rate === 0 ? "var(--bm-bg3)"
          : rate >= 0.6 ? "var(--bm-accent)"
          : rate >= 0.35 ? "var(--bm-amber)"
          : "var(--bm-red)";
        return (
          <div key={day} style={{ textAlign: "center" }}>
            <div
              title={entry ? `${entry.completed}/${entry.total} tasks completed` : "No data"}
              style={{
                height:       36,
                borderRadius: 6,
                background:   color,
                opacity:      entry?.total ? 0.3 + pct * 0.7 : 0.15,
                marginBottom: 5,
                transition:   "opacity 0.3s",
              }}
            />
            <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>{day}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [reflectionCount, setReflectionCount] = useState(0);
  const [data,    setData]    = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // AI streaming insights
  const [aiInsights, setAiInsights] = useState<AiInsightItem[]>([]);
  const [aiLoading,  setAiLoading]  = useState(false);
  const activeProjectId = useActiveProjectId();

  // Fetch reflection count for BuildMindCalibrating gate
  useEffect(() => {
    async function fetchCount() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        let countQuery = supabase.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        if (activeProjectId) countQuery = countQuery.eq("project_id", activeProjectId);
        const { count } = await countQuery;
        setReflectionCount(count ?? 0);
      } catch { /* non-fatal */ }
    }
    fetchCount();
  }, [activeProjectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); setLoading(false); return; }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let reflectionsQuery = supabase.from("reflections").select("confidence, outcome, created_at").eq("user_id", user.id).gte("created_at", thirtyDaysAgo);
      if (activeProjectId) reflectionsQuery = reflectionsQuery.eq("project_id", activeProjectId);
      let projectQuery = supabase.from("projects").select("startup_stage").eq("user_id", user.id);
      projectQuery = activeProjectId
        ? projectQuery.eq("id", activeProjectId)
        : projectQuery.order("created_at", { ascending: false }).limit(1);

      const [memRes, ctxRes, reflRes, logRes, projRes] = await Promise.allSettled([
        supabase.from("founder_memory").select("avoidance_zones, strengths, personality_tags, last_insight").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("founder_context")
          .select(
            "momentum_score, streak, meta_critic_signal, " +
            "active_pattern_signal, active_pattern_message, active_pattern_subject, " +
            "last_pattern_shown_at"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        reflectionsQuery,
        supabase.from("action_logs").select("outcome, outcome_note, created_at").eq("user_id", user.id).gte("created_at", thirtyDaysAgo),
        projectQuery.maybeSingle(),
      ]);

      const mem   = memRes.status  === "fulfilled" ? memRes.value.data  : null;
      const ctx   = ctxRes.status  === "fulfilled" ? ctxRes.value.data  : null;
      const refs  = reflRes.status === "fulfilled" ? (reflRes.value.data ?? []) : [];
      const logs  = logRes.status  === "fulfilled" ? (logRes.value.data ?? []) : [];
      const stage = projRes.status === "fulfilled" ? (projRes.value.data?.startup_stage ?? "Idea") : "Idea";

      // Completion by day of week
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

      // Top override reason
      const overrideReasons: Record<string, number> = {};
      for (const log of logs as Array<{ outcome?: string; outcome_note?: string }>) {
        if ((log.outcome === "overridden" || log.outcome === "partial") && log.outcome_note) {
          overrideReasons[log.outcome_note] = (overrideReasons[log.outcome_note] ?? 0) + 1;
        }
      }
      const topOverrideReason = Object.entries(overrideReasons).sort((a, b) => b[1] - a[1])[0]?.[0];

      const totalTasksCompleted = (logs as Array<{ outcome?: string }>).filter(l => l.outcome === "completed").length;

      setData({
        avoidanceZones:          (mem?.avoidance_zones   ?? []) as string[],
        strengths:               (mem?.strengths          ?? []) as string[],
        personalityTags:         (mem?.personality_tags   ?? []) as string[],
        momentumScore:           ctx?.momentum_score ?? 0,
        streak:                  ctx?.streak ?? 0,
        metacriticSignal:        ctx?.meta_critic_signal ?? undefined,
        lastInsight:             mem?.last_insight ?? undefined,
        activePatternSignal:     ctx?.active_pattern_signal ?? null,
        activePatternMessage:    ctx?.active_pattern_message ?? null,
        activePatternSubject:    ctx?.active_pattern_subject ?? null,
        lastPatternShownAt:      ctx?.last_pattern_shown_at ?? null,
        completionByDay,
        avgConfidenceByOutcome,
        topOverrideReason,
        totalTasksCompleted,
        totalTasksShown: logs.length,
      });

      // Fire AI insights stream — progressive rendering, non-blocking
      // Only if there's enough data to generate meaningful patterns
      if (totalTasksCompleted >= 3 || (mem?.avoidance_zones ?? []).length > 0) {
        setAiLoading(true);
        const collected: AiInsightItem[] = [];
        fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avoidanceZones:          (mem?.avoidance_zones ?? []),
            strengths:               (mem?.strengths ?? []),
            completionByDay,
            avgConfidenceByOutcome,
            topOverrideReason,
            totalTasksCompleted,
            totalTasksShown:         logs.length,
            metacriticSignal:        ctx?.meta_critic_signal,
            stage: stage,
          }),
        })
          .then(async (res) => {
            if (!res.ok || !res.body) { setAiLoading(false); return; }
            const reader = res.body.getReader();
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
                  } catch { /* skip */ }
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

  const lowestDay = data
    ? DAYS.reduce((worst, day) => {
        const e = data.completionByDay[day];
        const we = data.completionByDay[worst];
        if (!e?.total) return worst;
        if (!we?.total) return day;
        return (e.completed / e.total) < (we.completed / we.total) ? day : worst;
      }, "Mon")
    : null;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", margin: "0 0 6px", letterSpacing: "-0.03em" }}>
          Your behavioral patterns
        </h1>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0 }}>
          What BuildMind has learned about how you build — last 30 days.
        </p>
      </motion.div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--bm-text3)", fontSize: 13 }}>
          Reading your patterns…
        </div>
      )}

      {error && (
        <div style={{ padding: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, color: "#ef4444", fontSize: 13 }}>
          {error}
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Momentum + streak */}
          <InsightCard title="Momentum" accent="var(--bm-accent)">
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.04em", lineHeight: 1 }}>
                  {data.momentumScore}
                </div>
                <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 3 }}>/ 100</div>
              </div>
              {data.streak > 0 && (
                <div style={{ fontSize: 13, color: "var(--bm-amber)", fontWeight: 600 }}>
                  🔥 {data.streak}-day streak
                </div>
              )}
              {completionRate !== null && (
                <div style={{ fontSize: 13, color: "var(--bm-text2)" }}>
                  {completionRate}% completion rate
                  <span style={{ color: "var(--bm-text3)", fontWeight: 400 }}>
                    {" "}({data.totalTasksCompleted}/{data.totalTasksShown} tasks)
                  </span>
                </div>
              )}
            </div>
            <MomentumBar value={data.momentumScore} />
          </InsightCard>

          {data.activePatternSignal && data.activePatternMessage && (
            <InsightCard
              title={`Behavioural Pattern Detected · ${
                data.activePatternSignal?.replace(/_/g, " ").toUpperCase() ?? "SIGNAL"
              }`}
              accent={
                data.activePatternSignal === "momentum_decay" ? "var(--bm-red)" :
                data.activePatternSignal === "override_cluster" ? "var(--bm-amber)" :
                "var(--bm-accent)"
              }
            >
              <p style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.65, margin: 0 }}>
                {sanitizeOutput(data.activePatternMessage)}
              </p>
              {data.activePatternSubject && (
                <div style={{ marginTop: 10 }}>
                  <Tag
                    label={sanitizeOutput(data.activePatternSubject)}
                    color={
                      data.activePatternSignal === "momentum_decay" ? "var(--bm-red)" : "var(--bm-amber)"
                    }
                  />
                </div>
              )}
              {data.lastPatternShownAt && (
                <p style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 10, marginBottom: 0 }}>
                  First detected{" "}
                  {new Date(data.lastPatternShownAt).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short",
                  })}
                </p>
              )}
            </InsightCard>
          )}

          {/* Day-of-week heatmap */}
          {data.totalTasksShown > 0 && (
            <InsightCard title="When you actually build">
              <DayHeatmap completionByDay={data.completionByDay} />
              {lowestDay && data.completionByDay[lowestDay]?.total > 0 && (
                <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "12px 0 0" }}>
                  {lowestDay}s are your lowest completion day.
                  {" "}Consider avoiding hard tasks on {lowestDay}s.
                </p>
              )}
            </InsightCard>
          )}

          {/* Avoidance zones */}
          {data.avoidanceZones.length > 0 && (
            <InsightCard title="What you avoid" accent="var(--bm-amber)">
              <div style={{ marginBottom: 10 }}>
                {data.avoidanceZones.map(z => (
                  <Tag key={z} label={z} color="var(--bm-amber)" />
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
                BuildMind injects these signals into every task recommendation to route around your blind spots.
              </p>
            </InsightCard>
          )}

          {/* Confidence by outcome */}
          {Object.keys(data.avgConfidenceByOutcome).length > 0 && (
            <InsightCard title="Confidence when you complete vs skip">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(data.avgConfidenceByOutcome)
                  .sort((a, b) => b[1] - a[1])
                  .map(([outcome, avg]) => {
                    const color = outcome === "completed" ? "var(--bm-accent)"
                      : outcome === "partial"   ? "var(--bm-amber)"
                      : "var(--bm-text3)";
                    return (
                      <div key={outcome} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 80, fontSize: 12, color, fontWeight: 500, textTransform: "capitalize" }}>
                          {outcome}
                        </div>
                        <div style={{ flex: 1 }}>
                          <MomentumBar value={avg} max={5} color={color} />
                        </div>
                        <div style={{ fontSize: 12, color: "var(--bm-text2)", width: 32, textAlign: "right" }}>
                          {avg}/5
                        </div>
                      </div>
                    );
                  })}
              </div>
              {data.avgConfidenceByOutcome.completed && data.avgConfidenceByOutcome.overridden &&
                data.avgConfidenceByOutcome.completed > data.avgConfidenceByOutcome.overridden + 0.5 && (
                <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "12px 0 0", lineHeight: 1.6 }}>
                  You're significantly more confident on days you complete tasks. Confidence isn't a prerequisite — it's a byproduct of shipping.
                </p>
              )}
            </InsightCard>
          )}

          {/* Strengths */}
          {data.strengths.length > 0 && (
            <InsightCard title="Where you're strong" accent="var(--bm-accent)">
              <div>
                {data.strengths.map(s => (
                  <Tag key={s} label={s} color="var(--bm-accent)" />
                ))}
              </div>
            </InsightCard>
          )}

          {/* Personality tags */}
          {data.personalityTags.length > 0 && (
            <InsightCard title="How you operate">
              <div>
                {data.personalityTags.map(t => (
                  <Tag key={t} label={t} />
                ))}
              </div>
            </InsightCard>
          )}

          {/* Top skip reason */}
          {data.topOverrideReason && (
            <InsightCard title="Why you skip tasks" accent="var(--bm-red)">
              <p style={{ fontSize: 14, color: "var(--bm-text)", fontWeight: 500, margin: "0 0 8px" }}>
                "{data.topOverrideReason}"
              </p>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
                This is your most common skip reason. BuildMind uses this to avoid assigning tasks that trigger this pattern.
              </p>
            </InsightCard>
          )}

          {/* ══ AI PATTERN ANALYSIS — streams in progressively ══════════════════ */}
          {(aiLoading || aiInsights.length > 0) && (
            <InsightCard title="AI pattern analysis" accent="var(--bm-accent)">
              {/* Streaming skeleton — shown while loading */}
              {aiLoading && aiInsights.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 2, alignSelf: "stretch", borderRadius: 2, background: "var(--bm-border2)", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 12, borderRadius: 6, background: "var(--bm-bg3)", width: `${70 + i * 10}%`, animation: "pulse 1.4s ease-in-out infinite", marginBottom: 6 }} />
                        <div style={{ height: 10, borderRadius: 5, background: "var(--bm-bg3)", width: "50%", animation: "pulse 1.4s ease-in-out infinite" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Streamed insights */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {aiInsights.map((insight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      borderLeft: `2px solid ${
                        insight.type === "warning"
                          ? "var(--bm-amber)"
                          : insight.type === "positive"
                          ? "var(--bm-accent)"
                          : "var(--bm-text3)"
                      }`,
                      paddingLeft: 14,
                    }}
                  >
                    <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>
                      {sanitizeOutput(insight.text)}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Loading indicator alongside streamed items */}
              {aiLoading && aiInsights.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--bm-accent)", animation: "pulse 1s ease-in-out infinite" }} />
                  <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>Analysing more patterns…</span>
                </div>
              )}
            </InsightCard>
          )}

          {/* ── Existing data-driven insight cards ───────────────────────────── */}
          {data.metacriticSignal && (
            <InsightCard title="AI pattern diagnosis" accent="var(--bm-teal)">
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.65 }}>
                {sanitizeOutput(data.metacriticSignal)}
              </p>
            </InsightCard>
          )}

          {/* Last AI insight */}
          {data.lastInsight && (
            <InsightCard title="Last AI insight">
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>
                "{sanitizeOutput(data.lastInsight)}"
              </p>
            </InsightCard>
          )}

          {/* Empty state */}
          {data.avoidanceZones.length === 0 &&
           data.strengths.length === 0 &&
           data.totalTasksShown === 0 && (
            <InsightCard title="No patterns yet">
              <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, lineHeight: 1.65 }}>
                Complete a few daily tasks and check-ins — BuildMind needs at least 3 sessions to start detecting your behavioral patterns. Come back after a week.
              </p>
            </InsightCard>
          )}
        </div>
      )}
    </div>
  );
}

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
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";

// ── Types ─────────────────────────────────────────────────────────────────────
interface InsightData {
  avoidanceZones:    string[];
  strengths:         string[];
  personalityTags:   string[];
  momentumScore:     number;
  streak:            number;
  metacriticSignal?: string;
  lastInsight?:      string;
  completionByDay:   Record<string, { completed: number; total: number }>;
  avgConfidenceByOutcome: Record<string, number>;
  topOverrideReason?: string;
  totalTasksCompleted: number;
  totalTasksShown:     number;
}

type AiInsightItem = { type: "warning" | "positive" | "insight"; text: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const [data,    setData]    = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [reflectionCount, setReflectionCount] = useState(0);
  const [aiInsights, setAiInsights] = useState<AiInsightItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    async function fetchCount() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        setReflectionCount(count ?? 0);
      } catch { /* non-fatal */ }
    }
    fetchCount();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); setLoading(false); return; }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [memRes, ctxRes, reflRes, logRes] = await Promise.allSettled([
        supabase.from("founder_memory").select("avoidance_zones, strengths, personality_tags, last_insight").eq("user_id", user.id).maybeSingle(),
        supabase.from("founder_context").select("momentum_score, streak, meta_critic_signal").eq("user_id", user.id).maybeSingle(),
        supabase.from("reflections").select("confidence, outcome, created_at").eq("user_id", user.id).gte("created_at", thirtyDaysAgo),
        supabase.from("action_logs").select("outcome, outcome_note, created_at").eq("user_id", user.id).gte("created_at", thirtyDaysAgo),
      ]);

      const mem  = memRes.status  === "fulfilled" ? memRes.value.data  : null;
      const ctx  = ctxRes.status  === "fulfilled" ? ctxRes.value.data  : null;
      const refs = reflRes.status === "fulfilled" ? (reflRes.value.data ?? []) : [];
      const logs = logRes.status  === "fulfilled" ? (logRes.value.data ?? []) : [];

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
        completionByDay,
        avgConfidenceByOutcome,
        topOverrideReason,
        totalTasksCompleted,
        totalTasksShown: logs.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    if (data.totalTasksCompleted < 3 && data.avoidanceZones.length === 0) return;
    let cancelled = false;
    setAiLoading(true);
    setAiInsights([]);

    (async () => {
      try {
        const response = await fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: undefined }),
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const eventMatch = part.match(/^event:\s*(\S+)/m);
            const dataMatch = part.match(/^data:\s*(.+)/m);
            if (!eventMatch || !dataMatch) continue;
            if (eventMatch[1] === "insight") {
              try {
                const payload = JSON.parse(dataMatch[1]) as { item?: AiInsightItem };
                if (payload.item) setAiInsights((prev) => [...prev, payload.item]);
              } catch { /* ignore malformed chunk */ }
            }
            if (eventMatch[1] === "done") {
              cancelled = true;
            }
          }
        }
      } catch { /* non-fatal */ }
      if (!cancelled) setAiLoading(false);
    })();

    return () => { cancelled = true; };
  }, [data]);

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

  if (!loading && reflectionCount < 7) {
    return <BuildMindCalibrating count={reflectionCount} surface="patterns" />;
  }

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

          {(aiLoading || aiInsights.length > 0) && (
            <InsightCard title="AI behavioral read" accent="var(--bm-accent)">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {aiLoading && aiInsights.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>Reading your patterns…</p>
                )}
                {aiInsights.map((insight, index) => (
                  <div key={index} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: insight.type === "warning" ? "var(--bm-amber)" : insight.type === "positive" ? "var(--bm-accent)" : "var(--bm-text3)", flexShrink: 0, paddingTop: 1 }}>
                      {insight.type === "warning" ? "!" : insight.type === "positive" ? "+" : "i"}
                    </span>
                    <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>{insight.text}</p>
                  </div>
                ))}
              </div>
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

          {/* Meta-critic signal */}
          {data.metacriticSignal && (
            <InsightCard title="AI pattern diagnosis" accent="var(--bm-teal)">
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.65 }}>
                {data.metacriticSignal}
              </p>
            </InsightCard>
          )}

          {/* Last AI insight */}
          {data.lastInsight && (
            <InsightCard title="Last AI insight">
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>
                "{data.lastInsight}"
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

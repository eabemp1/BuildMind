
"use client";

/**
 * components/WeeklyPulseCard.tsx
 *
 * Replaces the previous `<ReportsPage />` passthrough in the "This Week" tab
 * (app/progress/page.tsx). /reports stays the separate export/reporting
 * surface — this is the fast, story-first weekly pulse: Story → Insights →
 * Evidence (sparkline) → Metrics → Grades → Share.
 *
 * Every number here is passed straight through from
 * app/api/ai/weekly-pulse/route.ts, which borrows from wherever each metric
 * is already computed (score_history, weekly_goals, scorecard, milestones,
 * founder_memory) rather than recomputing anything. This component only
 * visualizes — the "ghost vs real" sparkline is the literal implementation
 * of the founder's spec: a dotted line for the target pace, a solid line
 * for actual execution, on the same grid.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, Target, Flame, TrendingUp, TrendingDown, Ghost, Share2, Check, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProjectId } from "@/lib/queries";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

interface MilestonePacing {
  id: string; title: string; targetDate: string | null; projectedDate: string | null;
  deltaDays: number | null; risk: "low" | "medium" | "high" | "unknown"; reason: string;
}
interface GradedDimension { label: string; score: number | null; grade: "A" | "B" | "C" | "D" | "F" | "N/A"; basis: string; }
interface SparklinePoint { date: string; real: number | null; ghost: number | null; }

interface WeeklyPulseData {
  is_quiet_week: boolean;
  momentum_score: number; momentum_delta: number | null; streak: number;
  tasks_completed: number; tasks_total: number; completion_rate: number; active_days: number;
  un_ghosted: string[]; milestones: MilestonePacing[]; archetype: string | null;
  day_of_week: Record<string, { completed: number; total: number }>;
  confidence_by_outcome: Record<string, number>; top_override_reason: string | null;
  weekly_goal: { goal_text: string; target_score: number; current_score: number; target_tasks: number; tasks_done: number; status: string } | null;
  sparkline: SparklinePoint[]; grades: GradedDimension[]; story: string; generated_at: string;
}

const RISK_COLOR: Record<MilestonePacing["risk"], string> = {
  low: "var(--bm-green)", medium: "var(--bm-amber, #d9a441)", high: "var(--bm-red)", unknown: "var(--bm-text3)",
};
const GRADE_COLOR: Record<GradedDimension["grade"], string> = {
  A: "var(--bm-green)", B: "var(--bm-accent)", C: "var(--bm-amber, #d9a441)", D: "var(--bm-red)", F: "var(--bm-red)", "N/A": "var(--bm-text3)",
};

/** Ghost-vs-real sparkline: dotted line = target pace, solid line = actual
 *  execution — the literal chart the founder asked for. Pure SVG, no chart
 *  library needed for 7 points. */
function GhostSparkline({ points, size = { w: 280, h: 88 } }: { points: SparklinePoint[]; size?: { w: number; h: number } }) {
  if (points.length < 2) {
    return <div style={{ fontSize: 11, color: "var(--bm-text3)", padding: "20px 0", textAlign: "center" }}>Not enough days logged yet this week.</div>;
  }
  const { w, h } = size;
  const pad = 8;
  const allValues = points.flatMap((p) => [p.real, p.ghost]).filter((v): v is number => v !== null);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 100);
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - pad * 2);

  const realPath = points
    .map((p, i) => (p.real !== null ? `${i === 0 || points[i - 1]?.real === null ? "M" : "L"}${x(i)},${y(p.real)}` : ""))
    .filter(Boolean)
    .join(" ");
  const hasGhost = points.some((p) => p.ghost !== null);
  const ghostPath = hasGhost
    ? points.map((p, i) => (p.ghost !== null ? `${i === 0 || points[i - 1]?.ghost === null ? "M" : "L"}${x(i)},${y(p.ghost)}` : "")).filter(Boolean).join(" ")
    : "";

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {hasGhost && (
        <path d={ghostPath} fill="none" stroke="var(--bm-text3)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
      )}
      <path d={realPath} fill="none" stroke="var(--bm-accent)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.real !== null ? <circle key={i} cx={x(i)} cy={y(p.real)} r={2.5} fill="var(--bm-accent)" /> : null,
      )}
    </svg>
  );
}

function Ring({ value, size = 88 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, Math.max(0, value / 100)) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bm-accent)" strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

function GradeBadge({ g }: { g: GradedDimension }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px",
      background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>{g.label}</span>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: GRADE_COLOR[g.grade] }}>{g.grade}</span>
      </div>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text3)", lineHeight: 1.4 }}>{g.basis}</span>
    </div>
  );
}

export function WeeklyPulseCard() {
  const [data, setData] = useState<WeeklyPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const activeProjectId = useActiveProjectId();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Sign in to see your weekly pulse."); setLoading(false); return; }
      const res = await fetch("/api/ai/weekly-pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ projectId: activeProjectId || undefined }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok || !resBody?.ok) { setError("Couldn't load this week's pulse. Try again shortly."); setLoading(false); return; }
      setData(resBody.data);
    } catch {
      setError("Couldn't load this week's pulse. Try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { load(); }, [load]);

  const handleShare = useCallback(async () => {
    if (!data) return;
    const gradeLine = data.grades.filter((g) => g.grade !== "N/A").map((g) => `${g.label}: ${g.grade}`).join(" · ");
    const text = `${sanitizeOutput(data.story)}\n\n${data.completion_rate}% task completion · Momentum ${data.momentum_score}/100${gradeLine ? `\n${gradeLine}` : ""}\n#BuildInPublic`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* user cancelled share sheet */ }
  }, [data]);

  // X/Twitter intent link — carries over the retired /weekly-share page's
  // tweet format, now built from the same corrected, single-source data
  // This Week already renders (no separate fetch, no separate streak
  // fallback chain to drift from the rest of the app).
  const tweetIntentUrl = useMemo(() => {
    if (!data) return null;
    const bestMilestone = data.milestones[0];
    const text =
      `This week building with @buildmind_os\n\n` +
      `✓ ${data.tasks_completed}/${data.tasks_total} tasks done\n` +
      `🔥 ${data.streak}d streak\n` +
      `📈 Momentum: ${data.momentum_score}/100\n` +
      (bestMilestone ? `🎯 ${bestMilestone.title}: ${bestMilestone.reason}\n\n` : "\n") +
      `Track my build → buildmind.live\n#BuildInPublic #Startups`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }, [data]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--bm-border)", borderTopColor: "var(--bm-accent)", borderRadius: "50%" }} className="animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return <div style={{ padding: "24px", textAlign: "center", color: "var(--bm-text3)", fontSize: 13 }}>{error ?? "No data yet this week."}</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. STORY */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Sparkles size={14} style={{ color: "var(--bm-accent)" }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--bm-text3)" }}>
            Your week
          </span>
          {data.archetype && (
            <span style={{
              marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 10, padding: "3px 8px",
              borderRadius: 999, background: "var(--bm-bg3)", color: "var(--bm-text3)", border: "1px solid var(--bm-border)",
            }}>
              {data.archetype.replace(/-/g, " ")}
            </span>
          )}
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14.5, lineHeight: 1.6, color: "var(--bm-text)", margin: 0 }}>
          {sanitizeOutput(data.story)}
        </p>
      </div>

      {/* 2. EVIDENCE — ghost vs real sparkline, the founder's requested visual */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Ghost vs. real</span>
          <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--bm-text3)", fontFamily: "'Inter', sans-serif" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 2, background: "var(--bm-accent)", marginRight: 4, verticalAlign: "middle" }} />Actual</span>
            {data.weekly_goal && (
              <span><span style={{ display: "inline-block", width: 10, height: 2, borderTop: "1.5px dashed var(--bm-text3)", marginRight: 4, verticalAlign: "middle" }} />Target</span>
            )}
          </div>
        </div>
        <GhostSparkline points={data.sparkline} />
        {!data.weekly_goal && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text3)", margin: "4px 0 8px" }}>
            Set a weekly goal on an active project to see the target (ghost) line.
          </p>
        )}
      </div>

      {/* Un-ghosted */}
      {data.un_ghosted.length > 0 && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Ghost size={13} style={{ color: "var(--bm-accent)" }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Un-ghosted this week</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.un_ghosted.map((item) => (
              <span key={item} style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, padding: "4px 10px", borderRadius: 999, background: "var(--bm-bg3)", color: "var(--bm-text2)", border: "1px solid var(--bm-border)" }}>
                {sanitizeOutput(item)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: 18 }}>
        <div style={{ position: "relative", width: 88, height: 88 }}>
          <Ring value={data.completion_rate} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--bm-text)" }}>{data.completion_rate}%</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: "var(--bm-text3)" }}>done</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Target size={12} style={{ color: "var(--bm-text3)" }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Tasks</span>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>{data.tasks_completed}/{data.tasks_total}</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {data.momentum_delta !== null && data.momentum_delta < 0
                ? <TrendingDown size={12} style={{ color: "var(--bm-red)" }} />
                : <TrendingUp size={12} style={{ color: "var(--bm-accent)" }} />}
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Momentum</span>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>
              {data.momentum_score}
              {data.momentum_delta !== null && (
                <span style={{ fontSize: 11, marginLeft: 4, color: data.momentum_delta >= 0 ? "var(--bm-green)" : "var(--bm-red)" }}>
                  {data.momentum_delta >= 0 ? "+" : ""}{data.momentum_delta}
                </span>
              )}
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Flame size={12} style={{ color: "var(--bm-text3)" }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Streak</span>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>{data.streak}d</span>
          </div>
        </div>
      </div>

      {/* Grades */}
      {/* Grades — hidden entirely on a quiet week rather than showing a
          grid of N/A badges, which reads as broken rather than honest. */}
      {data.is_quiet_week ? (
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "var(--bm-text3)",
          textAlign: "center", padding: "4px 0",
        }}>
          Not enough activity yet to grade this week — check back after a few tasks.
        </p>
      ) : data.grades.some((g) => g.grade !== "N/A") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {data.grades.map((g) => <GradeBadge key={g.label} g={g} />)}
        </div>
      )}

      {/* Milestone pacing */}
      {data.milestones.length > 0 && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Milestone pacing</span>
          {data.milestones.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--bm-border)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: RISK_COLOR[m.risk], marginTop: 5, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--bm-text)" }}>{m.title}</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.4 }}>{m.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. SHARE */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleShare} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px",
          borderRadius: "var(--r-md, 10px)", border: "1px solid var(--bm-border)", background: "var(--bm-bg3)",
          color: "var(--bm-text2)", fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        }}>
          {copied ? <Check size={13} /> : <Share2 size={13} />}
          {copied ? "Copied" : "Share this week"}
        </button>
        {/* Real server-rendered PNG (app/api/card/weekly-pulse) — no
            html2canvas, no client-side DOM screenshot. The browser just
            navigates to the image URL with a download attribute; the route
            itself builds the PNG from the same data this card renders. */}
        <a
          href={`/api/card/weekly-pulse${activeProjectId ? `?projectId=${activeProjectId}` : ""}`}
          download="buildmind-weekly-pulse.png"
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px",
            borderRadius: "var(--r-md, 10px)", border: "1px solid var(--bm-accent-bd, var(--bm-border))",
            background: "rgba(93,169,224,0.08)", color: "var(--bm-accent)", fontFamily: "'Inter', sans-serif",
            fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none",
          }}
        >
          <Download size={13} />
          Download image
        </a>
      </div>

      {/* Carried over from the retired /weekly-share page — same tweet
          format, now built from correct, single-source data. */}
      {tweetIntentUrl && (
        <a
          href={tweetIntentUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px",
            borderRadius: "var(--r-md, 10px)", border: "1px solid var(--bm-border)", background: "transparent",
            color: "var(--bm-text2)", fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600,
            cursor: "pointer", textDecoration: "none",
          }}
        >
          𝕏 Share on X — #BuildInPublic
        </a>
      )}

      {/* Reports stays a separate surface for the exportable/historical
          view (4-week heatmap, CSV/PDF/PNG) — linked here, not merged in,
          so This Week stays a few-seconds read. */}
      <a
        href="/reports"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 16px",
          color: "var(--bm-text3)", fontFamily: "'Inter', sans-serif", fontSize: 12, textDecoration: "none",
        }}
      >
        View full report &amp; export →
      </a>
    </motion.div>
  );
  }

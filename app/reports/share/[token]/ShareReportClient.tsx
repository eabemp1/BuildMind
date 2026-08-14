"use client";

/**
 * app/reports/share/[token]/ShareReportClient.tsx
 *
 * Public shareable weekly report card. No auth required.
 * Now surfaces Pulse Score, Pulse Streak, Signal Ratio, and Execution Trend
 * alongside the existing task/milestone counts and AI narrative.
 *
 * Design: deep obsidian, indigo-blue accent (#5B6CF0), DM Mono labels,
 * Pulse ring for the score, timeline for the streak. Built to make founders
 * proud to share it and make visitors want to build with BuildMind.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { truncateChars } from "@/lib/textTruncate";

interface ReportData {
  week_start_date:     string;
  projects_count:      number;
  milestones_completed: number;
  tasks_completed:     number;
  ai_summary:          string;
  ai_risks:            string;
  ai_suggestions:      string;
  // Pulse fields
  pulse_score?:        number;
  pulse_streak?:       number;
  signal_ratio?:       number;
  execution_trend?:    "up" | "down" | "flat";
  velocity_7d?:        number;
  positive_events?:    number;
  negative_events?:    number;
}

interface Props {
  report: {
    share_token:      string;
    report_data:      ReportData;
    ai_summary:       string;
    created_at:       string;
    display_name?:    string;
    avatar_url?:      string;
    startup_summary?: string;
    // Top-level Pulse columns (written by weekly-report route)
    pulse_score?:     number;
    pulse_streak?:    number;
    signal_ratio?:    number;
    execution_trend?: "up" | "down" | "flat";
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PulseRing({ score }: { score: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 75 ? "#4ade80" :
    score >= 50 ? "#5b6cf0" :
    score >= 30 ? "#f59e0b" : "#f87171";

  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <svg width={88} height={88} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={44} cy={44} r={r} fill="none" stroke="#1e2235" strokeWidth={7} />
        <circle
          cx={44} cy={44} r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, color: "#555e7a", letterSpacing: "0.08em", marginTop: 2 }}>PULSE</span>
      </div>
    </div>
  );
}

function TrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up")   return <span style={{ color: "#4ade80", fontSize: 14 }}>↑</span>;
  if (trend === "down") return <span style={{ color: "#f87171", fontSize: 14 }}>↓</span>;
  return <span style={{ color: "#6b7280", fontSize: 14 }}>→</span>;
}

function StatBlock({
  value, label, sub, color,
}: {
  value: string | number;
  label: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      flex: 1,
      minWidth: 72,
      padding: "13px 10px",
      background: "rgba(91,108,240,0.06)",
      border: "1px solid rgba(91,108,240,0.14)",
      borderRadius: 12,
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: color ?? "#e4e8f8",
        lineHeight: 1,
        fontFamily: "'DM Mono', monospace",
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#555e7a", marginTop: 4, letterSpacing: "0.04em" }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: "#404560", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function SignalBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const color = pct >= 85 ? "#4ade80" : pct >= 60 ? "#f59e0b" : "#f87171";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: "#555e7a", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace" }}>
          Signal quality
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>
          {pct}%
        </span>
      </div>
      <div style={{
        height: 4, borderRadius: 2,
        background: "#1e2235", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 1s ease",
        }} />
      </div>
      <div style={{ fontSize: 9, color: "#404560", marginTop: 4 }}>
        {pct >= 85
          ? "Clean execution — overrides are rare"
          : pct >= 60
            ? "Some friction — a few tasks were blocked or overridden"
            : "High friction week — worth reviewing what you avoided"}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ShareReportClient({ report }: Props) {
  const [copied, setCopied] = useState(false);
  const rd = report.report_data;

  // Prefer top-level Pulse columns (written by latest report route).
  // Fall back to report_data fields for older reports.
  const pulseScore     = report.pulse_score     ?? rd.pulse_score     ?? 0;
  const pulseStreak    = report.pulse_streak    ?? rd.pulse_streak    ?? 0;
  const signalRatio    = report.signal_ratio    ?? rd.signal_ratio    ?? 1;
  const executionTrend = report.execution_trend ?? rd.execution_trend ?? "flat";

  const shareUrl = typeof window !== "undefined"
    ? window.location.href
    : `https://buildmind.live/reports/share/${report.share_token}`;

  const weekOf = report.created_at
    ? new Date(report.created_at).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : "this week";

  const name = report.display_name ?? "A founder";

  const tweetText = encodeURIComponent(
    `Week of ${weekOf} — Pulse Score: ${pulseScore}/100 · ${rd.tasks_completed} tasks shipped · ${pulseStreak}d streak\n\n` +
    `"${(report.ai_summary ?? "").slice(0, 100)}…"\n\n` +
    `Built with @buildmind_os 🚀\n${shareUrl}`,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const trendLabel =
    executionTrend === "up"   ? "Stronger than last week" :
    executionTrend === "down" ? "Slower than last week" :
    "Consistent with last week";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0b0d14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#111420",
          border: "1px solid #1e2235",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.65)",
        }}
      >

        {/* ── Header ── */}
        <div style={{
          padding: "24px 26px 18px",
          borderBottom: "1px solid #1a1d2e",
          background: "linear-gradient(135deg, #12152080 0%, #0b0d1480 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            {report.avatar_url && (
              <img
                src={report.avatar_url}
                alt={name}
                style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "#5b6cf0",
                fontFamily: "'DM Mono', monospace", marginBottom: 2,
              }}>
                Weekly build report
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e4e8f8", lineHeight: 1.2 }}>
                {name}
              </div>
              {report.startup_summary && (
                <div style={{
                  fontSize: 11, color: "#555e7a",
                  marginTop: 3, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {truncateChars(sanitizeOutput(report.startup_summary), 72)}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{
                fontSize: 10, padding: "3px 10px",
                background: "rgba(91,108,240,0.1)",
                border: "1px solid rgba(91,108,240,0.2)",
                borderRadius: 20, color: "#7c8cf0",
                fontFamily: "'DM Mono', monospace",
              }}>
                {weekOf}
              </span>
            </div>
          </div>
        </div>

        {/* ── Pulse Score + streak + trend ── */}
        <div style={{
          padding: "20px 26px 16px",
          borderBottom: "1px solid #1a1d2e",
          display: "flex", alignItems: "center", gap: 20,
        }}>
          <PulseRing score={pulseScore} />

          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: "#e4e8f8",
              marginBottom: 6, display: "flex", alignItems: "center", gap: 8,
            }}>
              Pulse Score
              <span style={{
                fontSize: 10, padding: "2px 8px",
                background: "rgba(91,108,240,0.1)",
                border: "1px solid rgba(91,108,240,0.2)",
                borderRadius: 20, color: "#7c8cf0",
                fontFamily: "'DM Mono', monospace",
              }}>
                14-day window
              </span>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
              <div>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: pulseStreak >= 7 ? "#f59e0b" : "#e4e8f8",
                  fontFamily: "'DM Mono', monospace", lineHeight: 1,
                }}>
                  {pulseStreak}d
                </div>
                <div style={{ fontSize: 9, color: "#555e7a", marginTop: 2, letterSpacing: "0.06em" }}>
                  PULSE STREAK
                </div>
              </div>
              <div>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: "#e4e8f8",
                  fontFamily: "'DM Mono', monospace", lineHeight: 1,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <TrendArrow trend={executionTrend} />
                  {trendLabel.split(" ")[0]}
                </div>
                <div style={{ fontSize: 9, color: "#555e7a", marginTop: 2, letterSpacing: "0.06em" }}>
                  TREND VS LAST WEEK
                </div>
              </div>
            </div>

            <SignalBar ratio={signalRatio} />
          </div>
        </div>

        {/* ── Stats row ── */}
        <div style={{ padding: "16px 26px", borderBottom: "1px solid #1a1d2e" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <StatBlock
              value={rd.tasks_completed ?? 0}
              label="tasks shipped"
              color="#5b6cf0"
            />
            <StatBlock
              value={rd.milestones_completed ?? 0}
              label="milestones closed"
              color="#4ade80"
            />
            <StatBlock
              value={rd.projects_count ?? 0}
              label="active projects"
            />
          </div>
        </div>

        {/* ── AI narrative ── */}
        <div style={{ padding: "18px 26px 16px", borderBottom: "1px solid #1a1d2e" }}>
          {report.ai_summary && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: "#5b6cf0",
                letterSpacing: "0.12em", textTransform: "uppercase",
                fontFamily: "'DM Mono', monospace", marginBottom: 8,
              }}>
                ⚡ This week
              </div>
              <p style={{
                fontSize: 13.5, color: "#c4cae8",
                lineHeight: 1.65, margin: 0,
              }}>
                {truncateChars(sanitizeOutput(report.ai_summary), 300)}
              </p>
            </div>
          )}

          {rd.ai_suggestions && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <span className="bm-status-dot" style={{ background: "rgba(91,108,240,0.8)" }} />
              <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 9, color: "#555e7a", marginBottom: 4,
                textTransform: "uppercase", letterSpacing: "0.06em",
                fontFamily: "'DM Mono', monospace",
              }}>
                Next week →
              </div>
              <p style={{ fontSize: 12.5, color: "#7880a8", margin: 0, lineHeight: 1.55 }}>
                {truncateChars(sanitizeOutput(rd.ai_suggestions), 160)}
              </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Share actions ── */}
        <div style={{ padding: "14px 26px", borderBottom: "1px solid #1a1d2e" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: "9px 0",
                background: copied ? "rgba(91,108,240,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${copied ? "rgba(91,108,240,0.4)" : "#2a2e45"}`,
                borderRadius: 9,
                color: copied ? "#7c8cf0" : "#6b738f",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
            >
              {copied ? "✓ Copied" : "Copy link"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${tweetText}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: "9px 0",
                background: "rgba(29,161,242,0.07)",
                border: "1px solid rgba(29,161,242,0.18)",
                borderRadius: 9,
                color: "#60a5fa",
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              Share on X
            </a>
          </div>
        </div>

        {/* ── CTA footer ── */}
        <div style={{
          padding: "14px 26px",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(91,108,240,0.03)",
        }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e4e8f8" }}>
              BuildMind
            </div>
            <div style={{ fontSize: 10.5, color: "#404560" }}>
              AI execution system for founders
            </div>
          </div>
          <a
            href="https://buildmind.live?ref=weekly-share"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 18px",
              background: "linear-gradient(135deg, #5b6cf0, #4a5ce0)",
              borderRadius: 9,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(91,108,240,0.35)",
            }}
          >
            Start building →
          </a>
        </div>
      </motion.div>

      <p style={{ marginTop: 20, fontSize: 11, color: "#2a2e45", textAlign: "center" }}>
        Built with{" "}
        <a href="https://buildmind.live" style={{ color: "#5b6cf0", textDecoration: "none" }}>
          BuildMind
        </a>
        {" "}— track your execution, not your effort
      </p>
    </div>
  );
                      }

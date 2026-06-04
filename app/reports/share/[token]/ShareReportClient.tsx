"use client";

/**
 * app/reports/share/[token]/ShareReportClient.tsx
 *
 * Client component for the public weekly report share page.
 * Renders a beautiful branded card with the founder's week stats,
 * AI summary, and a BuildMind CTA. Includes copy-link and tweet buttons.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

interface ReportData {
  week_start_date: string;
  projects_count: number;
  milestones_completed: number;
  tasks_completed: number;
  ai_summary: string;
  ai_risks: string;
  ai_suggestions: string;
}

interface Props {
  report: {
    share_token: string;
    report_data: ReportData;
    ai_summary: string;
    created_at: string;
    display_name?: string;
    avatar_url?: string;
    startup_summary?: string;
  };
}

function StatPill({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "14px 20px",
      background: "rgba(16,185,129,0.07)",
      border: "1px solid rgba(16,185,129,0.15)",
      borderRadius: "12px",
      minWidth: "80px",
    }}>
      <span style={{ fontSize: "24px", fontWeight: 600, color: "#10b981", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", textAlign: "center" }}>{label}</span>
    </div>
  );
}

export function ShareReportClient({ report }: Props) {
  const [copied, setCopied] = useState(false);
  const rd = report.report_data;

  const shareUrl = typeof window !== "undefined"
    ? window.location.href
    : `https://buildmind.live/reports/share/${report.share_token}`;

  const weekOf = report.created_at
    ? new Date(report.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "this week";

  const name = report.display_name ?? "A founder";

  const tweetText = encodeURIComponent(
    `Week ending ${weekOf} — shipped ${rd.tasks_completed} tasks building my startup.\n\n` +
    `"${(report.ai_summary ?? "").slice(0, 100)}…"\n\n` +
    `Tracked with @buildmind_os 🚀\n${shareUrl}`,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — select text
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0F0F10",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          width: "100%",
          maxWidth: "560px",
          background: "#141414",
          border: "1px solid var(--bm-border)",
          borderRadius: "20px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          background: "var(--bm-green-dim)",
          padding: "28px 28px 20px",
          borderBottom: "1px solid var(--bm-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
            {report.avatar_url && (
              <img
                src={report.avatar_url}
                alt={name}
                style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
              />
            )}
            <div>
              <div style={{ fontSize: "13px", color: "#6b7280" }}>Weekly build report</div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>{name}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <span style={{
                fontSize: "11px",
                padding: "3px 10px",
                background: "rgba(16,185,129,0.12)",
                border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: "20px",
                color: "#10b981",
              }}>
                {weekOf}
              </span>
            </div>
          </div>
          {report.startup_summary && (
            <p style={{ fontSize: "12px", color: "#4b5563", margin: "8px 0 0", lineHeight: 1.5 }}>
              {sanitizeOutput(report.startup_summary).slice(0, 80)}
            </p>
          )}
        </div>

        {/* Stats */}
        <div style={{ padding: "20px 28px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
            <StatPill value={rd.tasks_completed ?? 0}    label="tasks shipped" />
            <StatPill value={rd.milestones_completed ?? 0} label="milestones" />
            <StatPill value={rd.projects_count ?? 0}     label="projects" />
          </div>

          {/* AI Summary */}
          {report.ai_summary && (
            <div style={{
              background: "rgba(16,185,129,0.05)",
              border: "1px solid rgba(16,185,129,0.12)",
              borderRadius: "12px",
              padding: "14px 16px",
              marginBottom: "16px",
            }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "#10b981", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                AI weekly read
              </div>
              <p style={{ fontSize: "14px", color: "#d1d5db", lineHeight: 1.6, margin: 0 }}>
                {sanitizeOutput(report.ai_summary).slice(0, 280)}
              </p>
            </div>
          )}

          {/* Next week focus */}
          {rd.ai_suggestions && (
            <div style={{
              borderLeft: "2px solid rgba(16,185,129,0.4)",
              paddingLeft: "12px",
              marginBottom: "20px",
            }}>
              <div style={{ fontSize: "10px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Next week</div>
              <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
                {sanitizeOutput(rd.ai_suggestions).slice(0, 140)}
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={handleCopy}
              style={{
                padding: "9px 18px",
                background: copied ? "rgba(16,185,129,0.15)" : "var(--bm-border)",
                border: "1px solid var(--bm-border2)",
                borderRadius: "8px",
                color: copied ? "#10b981" : "#9ca3af",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {copied ? "✓ Copied" : "Copy link"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${tweetText}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "9px 18px",
                background: "rgba(29,161,242,0.1)",
                border: "1px solid rgba(29,161,242,0.2)",
                borderRadius: "8px",
                color: "#60a5fa",
                fontSize: "13px",
                fontWeight: 500,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s",
              }}
            >
              Share on X
            </a>
          </div>
        </div>

        {/* CTA footer */}
        <div style={{
          borderTop: "1px solid var(--bm-border)",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(16,185,129,0.03)",
        }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>BuildMind</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>AI Founder Operating System</div>
          </div>
          <a
            href="https://buildmind.live?ref=weekly-share"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "7px 16px",
              background: "#10b981",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 0.15s",
            }}
          >
            Start building →
          </a>
        </div>
      </motion.div>

      <p style={{ marginTop: "24px", fontSize: "12px", color: "#374151", textAlign: "center" }}>
        Generated by{" "}
        <a href="https://buildmind.live" style={{ color: "#10b981", textDecoration: "none" }}>
          BuildMind
        </a>
        {" "}— the AI operating system for founders
      </p>
    </div>
  );
}

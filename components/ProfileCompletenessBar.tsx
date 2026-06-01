"use client";

/**
 * components/ProfileCompletenessBar.tsx — Product Improvement #4
 *
 * Shows founders exactly how much better their AI advice could be with more context.
 * "Your advice quality is currently 60% — add your target users to improve it."
 *
 * Displayed on: /overview, /settings, and as a dismissible banner on /today
 * until completeness reaches 80%.
 *
 * Scoring weights (total 100 pts):
 *   startup_summary (non-empty, >20 chars)  → 25 pts  (most important)
 *   stage (non-default)                     → 15 pts
 *   target_users                            → 15 pts
 *   avoidance_zones (any)                   → 10 pts
 *   revenue_model / mrr                     → 10 pts
 *   location / timezone                     → 5 pts
 *   profile display_name                    → 10 pts
 *   at least 1 completed task               → 10 pts
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileFields {
  startupSummary?: string;
  problem?: string;
  stage?: string;
  targetUsers?: string;
  avoidanceZones?: string[];
  mrr?: number;
  revenueModel?: string;
  weeklyRevenueGoal?: number;
  personalityTags?: string[];
  displayName?: string;
  tasksCompleted?: number;
}

interface CompletenessItem {
  label: string;
  points: number;
  complete: boolean;
  action: string;   // where to go to fix it
  actionLabel: string;
}

export function computeCompleteness(fields: ProfileFields): {
  score: number;
  items: CompletenessItem[];
} {
  const items: CompletenessItem[] = [
    {
      label: "Startup description",
      points: 25,
      complete: (fields.startupSummary?.trim().length ?? 0) > 20,
      action: "/settings#startup",
      actionLabel: "Add description",
    },
    {
      label: "Display name",
      points: 10,
      complete: (fields.displayName?.trim().length ?? 0) > 1,
      action: "/settings#profile",
      actionLabel: "Add your name",
    },
    {
      label: "Startup stage",
      points: 15,
      complete: !!(fields.stage) && fields.stage !== "Idea",
      action: "/settings#startup",
      actionLabel: "Set your stage",
    },
    {
      label: "Target users",
      points: 15,
      complete: (fields.targetUsers?.trim().length ?? 0) > 5,
      action: "/settings#startup",
      actionLabel: "Describe your users",
    },
    {
      label: "Avoidance zones",
      points: 10,
      complete: (fields.avoidanceZones?.length ?? 0) > 0,
      action: "/today",
      actionLabel: "Complete a reflection",
    },
    {
      label: "Revenue or model",
      points: 10,
      complete: (fields.mrr ?? 0) > 0 || (fields.revenueModel?.length ?? 0) > 2,
      action: "/settings#startup",
      actionLabel: "Add revenue model",
    },
    {
      label: "First task completed",
      points: 10,
      complete: (fields.tasksCompleted ?? 0) > 0,
      action: "/today",
      actionLabel: "Complete a task",
    },
    {
      label: "Location / timezone",
      points: 5,
      complete: false, // will be populated from profile if available
      action: "/settings#profile",
      actionLabel: "Add location",
    },
  ];

  const score = items.reduce((sum, i) => sum + (i.complete ? i.points : 0), 0);
  return { score, items };
}

interface Props {
  fields: ProfileFields;
  /** If true, shows as a dismissible banner (for /today page) */
  asBanner?: boolean;
  className?: string;
}

export function ProfileCompletenessBar({ fields, asBanner = false, className }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const { score, items }          = computeCompleteness(fields);
  const incomplete                = items.filter(i => !i.complete).sort((a, b) => b.points - a.points);
  const topMissing                = incomplete[0];

  // Persist dismissal in session (resets each session intentionally — nudge is useful)
  useEffect(() => {
    const key = `bm_completeness_dismissed_${Math.floor(Date.now() / 86400000)}`;
    if (sessionStorage.getItem(key)) setDismissed(true);
  }, []);

  // Don't show if score is already great or user dismissed
  if (score >= 80 || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    const key = `bm_completeness_dismissed_${Math.floor(Date.now() / 86400000)}`;
    sessionStorage.setItem(key, "1");
  };

  const barColor = score >= 60 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

  if (asBanner) {
    return (
      <AnimatePresence>
        {!dismissed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: "rgba(16,185,129,0.05)",
              border: "1px solid rgba(16,185,129,0.15)",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}
            className={className}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", color: "#9ca3af" }}>AI advice quality</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: barColor }}>{score}%</span>
                </div>
                <div style={{ height: "4px", background: "var(--bm-border2)", borderRadius: "2px", overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ height: "100%", background: barColor, borderRadius: "2px" }}
                  />
                </div>
                {topMissing && (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#6b7280" }}>
                    Add{" "}
                    <a href={topMissing.action} style={{ color: "#10b981", textDecoration: "none" }}>
                      {topMissing.label.toLowerCase()}
                    </a>
                    {" "}to unlock {topMissing.points} more points
                  </div>
                )}
              </div>
              <button
                onClick={handleDismiss}
                style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "4px" }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Full card variant (for /overview, /settings)
  return (
    <div
      style={{
        background: "#141414",
        border: "1px solid var(--bm-border)",
        borderRadius: "12px",
        padding: "16px 20px",
      }}
      className={className}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span style={{ fontSize: "13px", fontWeight: 500, color: "#e5e7eb" }}>AI advice quality</span>
        <span style={{ fontSize: "20px", fontWeight: 600, color: barColor }}>{score}<span style={{ fontSize: "12px", color: "#6b7280" }}>/100</span></span>
      </div>

      <div style={{ height: "6px", background: "var(--bm-border)", borderRadius: "3px", overflow: "hidden", marginBottom: "12px" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: barColor, borderRadius: "3px" }}
        />
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "12px", padding: 0, marginBottom: "8px" }}
      >
        {expanded ? "Hide" : "What would improve this?"} {expanded ? "↑" : "↓"}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
              {incomplete.slice(0, 4).map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    {item.label}
                    <span style={{ marginLeft: "6px", color: "#374151" }}>+{item.points}</span>
                  </span>
                  <a
                    href={item.action}
                    style={{
                      fontSize: "11px",
                      color: "#10b981",
                      textDecoration: "none",
                      padding: "2px 8px",
                      background: "rgba(16,185,129,0.08)",
                      borderRadius: "4px",
                    }}
                  >
                    {item.actionLabel}
                  </a>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProfileCompletenessBar;

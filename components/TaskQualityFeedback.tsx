/**
 * components/TaskQualityFeedback.tsx
 *
 * Additional UX Improvement — Raises the task quality floor.
 *
 * The audit identified that task quality variance is too high — some days
 * the AI generates a perfectly calibrated task, other days something generic.
 * A founder who gets two generic tasks in a row loses faith in the system.
 *
 * This component renders a subtle "Was this specific to your situation?"
 * signal below the action card. The feedback is stored in action_logs
 * and fed back to the reflexion loop to bias future tasks toward higher
 * specificity.
 *
 * Usage:
 *   import { TaskQualityFeedback } from "@/components/TaskQualityFeedback";
 *   <TaskQualityFeedback logRowId={actionData.log_row_id} taskAction={actionData.action} />
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  logRowId?: string;
  taskAction?: string;
}

export function TaskQualityFeedback({ logRowId, taskAction }: Props) {
  const [response, setResponse] = useState<"specific" | "generic" | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(val: "specific" | "generic") {
    setResponse(val);
    setSent(true);
    try {
      await fetch("/api/task-quality-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logRowId, quality: val, action: taskAction }),
      });
    } catch {
      // Non-fatal
    }
  }

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          background: "var(--bm-bg3)",
          border: "1px solid var(--bm-border)",
          marginBottom: 10,
          fontSize: 11,
          color: "var(--bm-text4)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: "var(--bm-accent)" }}>✓</span>
        {response === "specific"
          ? "Good — specificity noted. More like this."
          : "Noted — tomorrow's task will be more targeted to your context."}
      </motion.div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        background: "transparent",
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--bm-text4)", flexShrink: 0 }}>
        Was this specific to your situation?
      </span>
      <button
        onClick={() => submit("specific")}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid var(--bm-border)",
          background: "var(--bm-bg3)",
          color: "var(--bm-text3)",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--bm-accent-bd)";
          e.currentTarget.style.color = "var(--bm-accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--bm-border)";
          e.currentTarget.style.color = "var(--bm-text3)";
        }}
      >
        Yes
      </button>
      <button
        onClick={() => submit("generic")}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid var(--bm-border)",
          background: "var(--bm-bg3)",
          color: "var(--bm-text3)",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(224,85,85,0.3)";
          e.currentTarget.style.color = "var(--bm-red)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--bm-border)";
          e.currentTarget.style.color = "var(--bm-text3)";
        }}
      >
        Too generic
      </button>
    </div>
  );
}

export default TaskQualityFeedback;

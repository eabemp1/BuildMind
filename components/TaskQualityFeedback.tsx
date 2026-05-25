"use client";

import { useState } from "react";
import { motion } from "framer-motion";

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logRowId, quality: val, action: taskAction }),
      });
    } catch { /* non-fatal */ }
  }

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ padding: "8px 14px", borderRadius: 8, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", marginBottom: 10, fontSize: 11, color: "var(--bm-text4)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--bm-accent)" }}>✓</span>
        {response === "specific" ? "Good — specificity noted. More like this." : "Noted — tomorrow's task will be more targeted to your context."}
      </motion.div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "transparent", marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: "var(--bm-text4)", flexShrink: 0 }}>Was this specific to your situation?</span>
      <button onClick={() => submit("specific")}
        style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
        Yes
      </button>
      <button onClick={() => submit("generic")}
        style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
        Too generic
      </button>
    </div>
  );
}

export default TaskQualityFeedback;
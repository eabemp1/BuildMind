"use client";

import React, { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DecisionBriefProps = {
  action: ReactNode;
  rationale?: ReactNode;
  time?: string;
  lowConfidence?: boolean;
  expectedEvidence?: string;
  onExecute?: () => void;
  executeLabel?: string;
  /** The kind of work today is ("Talk to customers"), from the mission planner. */
  kicker?: string;
  /** Colour for this kind of work. Falls back to the app accent. */
  accent?: string;
  /** Why this kind of work today, one short line each. */
  reasons?: string[];
};

/**
 * The one thing to do today, set large. The task is the page's focal point:
 * a coloured edge that draws down once, then the sentence rising into place.
 * Everything else is quiet text. Presentational only: callers keep the
 * recommendation and execution behaviour.
 */
export function DecisionBrief({
  action, rationale, time, lowConfidence = false, expectedEvidence, onExecute, executeLabel = "Execute",
  kicker, accent = "var(--bm-accent)", reasons,
}: DecisionBriefProps) {
  const reduce = useReducedMotion();
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <section aria-label="Today's task" style={{ position: "relative", padding: "6px 0 4px 20px" }}>
      <motion.span
        aria-hidden
        initial={reduce ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: reduce ? 0 : 0.8, ease }}
        style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 4, borderRadius: 2, background: accent, transformOrigin: "top" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: accent, fontWeight: 500 }}>
          {lowConfidence ? "Finding out first" : kicker ?? "Today"}
        </span>
        {time ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--bm-text4)" }}>
            <Clock size={12} />{time}
          </span>
        ) : null}
      </div>

      <motion.h2
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.7, ease, delay: reduce ? 0 : 0.15 }}
        style={{
          margin: 0, fontFamily: "var(--font-syne), 'Syne', sans-serif", fontWeight: 600, color: "var(--bm-text)",
          fontSize: "clamp(22px, 4.6vw, 32px)", lineHeight: 1.22, letterSpacing: "-0.02em", textWrap: "balance",
        }}
      >
        {action}
      </motion.h2>

      {lowConfidence ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--bm-text3)" }}>
          This is a question for the real world, not a guess. What you learn will shape the next recommendation.
        </p>
      ) : null}

      {rationale ? (
        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.5 }}
          style={{ margin: "16px 0 0", maxWidth: "62ch", fontSize: 15, lineHeight: 1.65, color: "var(--bm-text2)" }}
        >
          {rationale}
        </motion.p>
      ) : null}

      {reasons && reasons.length > 0 ? (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {reasons.slice(0, 2).map((r) => (
            <li key={r} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--bm-text3)" }}>{r}</li>
          ))}
        </ul>
      ) : null}

      {expectedEvidence ? (
        <p style={{ margin: "14px 0 0", maxWidth: "62ch", fontSize: 12.5, lineHeight: 1.55, color: "var(--bm-text3)" }}>
          You will know it worked when: {expectedEvidence}
        </p>
      ) : null}

      {onExecute ? (
        <div style={{ marginTop: 18 }}>
          <Button size="sm" onClick={onExecute}>
            {executeLabel} <ArrowRight size={13} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

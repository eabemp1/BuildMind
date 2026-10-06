"use client";

/**
 * DayRibbon — today as a horizontal span of daylight, 06:00 to 22:00.
 *
 * A glowing marker glides to the current time once when the page opens. Time
 * already lived is lit; a running focus block is drawn on the ribbon as a
 * brighter span, so the day and the block read as one picture. Nothing else on
 * it moves except the marker's soft pulse while a block is running.
 */

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const START_MIN = 6 * 60;
const END_MIN = 22 * 60;
const SPAN = END_MIN - START_MIN;
const TICKS = [6, 9, 12, 15, 18, 21];

export interface RibbonSpan { startMin: number; endMin: number }

export interface DayRibbonProps {
  now: Date;
  /** Accent for the part of the day, from the command centre palette. */
  color: string;
  dim: string;
  done: boolean;
  running: boolean;
  focusSpan?: RibbonSpan | null;
  narrow?: boolean;
}

const pct = (min: number) => Math.min(100, Math.max(0, ((min - START_MIN) / SPAN) * 100));

export function DayRibbon({ now, color, dim, done, running, focusSpan, narrow }: DayRibbonProps) {
  const reduce = useReducedMotion();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const at = pct(nowMin);
  const h = narrow ? 44 : 56;
  const trackY = narrow ? 20 : 26;

  return (
    <div aria-hidden style={{ position: "relative", height: h, margin: "2px 0 0", userSelect: "none" }}>
      {/* three zones of the day, faint, so the eye reads morning / afternoon / evening */}
      <div style={{ position: "absolute", left: 0, right: 0, top: trackY, height: 8, borderRadius: 4, overflow: "hidden", background: "var(--bm-border2)" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(232,197,71,0.20) 0%, rgba(232,197,71,0.20) 37.5%, rgba(74,184,176,0.20) 37.5%, rgba(74,184,176,0.20) 68.75%, rgba(155,135,245,0.22) 68.75%, rgba(155,135,245,0.22) 100%)" }} />
        {/* the part of the day already lived */}
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${at}%` }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: `linear-gradient(90deg, ${dim}, ${color})`, borderRadius: 4 }}
        />
      </div>

      {/* a running focus block, lit above the track */}
      {focusSpan && running && (
        <motion.div
          initial={reduce ? false : { opacity: 0, scaleX: 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            position: "absolute", top: trackY - 6, height: 20, borderRadius: 6, transformOrigin: "left center",
            left: `${pct(focusSpan.startMin)}%`, width: `${Math.max(1.2, pct(focusSpan.endMin) - pct(focusSpan.startMin))}%`,
            background: dim, border: `1px solid ${color}`, boxShadow: `0 0 14px ${dim}`,
          }}
        />
      )}

      {/* the marker */}
      <motion.div
        initial={reduce ? false : { left: "0%" }}
        animate={{ left: `${at}%` }}
        transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: "absolute", top: trackY - 8, width: 24, marginLeft: -12, height: 24 }}
      >
        <motion.span
          animate={running && !reduce ? { boxShadow: [`0 0 0 0 ${dim}`, `0 0 0 10px transparent`] } : { boxShadow: `0 0 0 4px ${dim}` }}
          transition={running && !reduce ? { duration: 1.8, repeat: Infinity, ease: "easeOut" } : { duration: 0.3 }}
          style={{ display: "block", width: 24, height: 24, borderRadius: "50%", background: done ? "var(--bm-green, #4ade80)" : color }}
        />
      </motion.div>

      {/* hour ticks */}
      {TICKS.map((hr) => (
        <span key={hr} style={{ position: "absolute", top: trackY + 16, left: `${pct(hr * 60)}%`, transform: "translateX(-50%)", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--bm-text4)" }}>
          {hr === 12 ? "noon" : hr > 12 ? `${hr - 12}p` : `${hr}a`}
        </span>
      ))}
    </div>
  );
}

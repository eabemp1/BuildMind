"use client";

import { motion } from "framer-motion";

export function ScoreRing({
  value,
  size = 52,
  color,
  showLabel = false,
  gradient = false,
}: {
  value: number;
  size?: number;
  color?: string;
  showLabel?: boolean;
  /** Use the purple→pink "intelligence" gradient stroke instead of a solid
   *  performance color. Reserved for BuildMind-native rings (Founder Mirror,
   *  overall confidence) — NOT for task/goal progress, which should keep
   *  using the solid green/amber/red semantics below. */
  gradient?: boolean;
}) {
  const resolvedColor = color ?? (value >= 60 ? "var(--bm-green)" : value >= 30 ? "var(--bm-amber)" : "var(--bm-red)");
  const stroke = Math.max(4, Math.round(size * 0.09));
  const r = (size - stroke - 2) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(value, 100));
  const gradId = "bm-intel-ring-grad";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
        {gradient && (
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--bm-intel)" />
              <stop offset="100%" stopColor="var(--bm-intel2)" />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bm-border)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={gradient ? `url(#${gradId})` : resolvedColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (clamped / 100) * circ }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
          style={{ filter: gradient ? "drop-shadow(0 0 4px var(--bm-intel-bd))" : `drop-shadow(0 0 4px ${resolvedColor}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size * 0.24, color: gradient ? "var(--bm-text)" : resolvedColor }}>
          {Math.round(value)}
        </span>
        {showLabel ? (
          <span className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--bm-text3)]">
            /100
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default ScoreRing;

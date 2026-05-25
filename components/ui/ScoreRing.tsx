"use client";

import { motion } from "framer-motion";

export function ScoreRing({
  value,
  size = 52,
  color,
  showLabel = false,
}: {
  value: number;
  size?: number;
  color?: string;
  showLabel?: boolean;
}) {
  const resolvedColor = color ?? (value >= 60 ? "var(--bm-green)" : value >= 30 ? "var(--bm-amber)" : "var(--bm-red)");
  const stroke = Math.max(4, Math.round(size * 0.09));
  const r = (size - stroke - 2) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(value, 100));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
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
          stroke={resolvedColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (clamped / 100) * circ }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
          style={{ filter: `drop-shadow(0 0 4px ${resolvedColor}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size * 0.24, color: resolvedColor }}>
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

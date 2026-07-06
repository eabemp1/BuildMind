"use client";

/**
 * components/charts/RadialGauge.tsx
 *
 * Shared radial progress gauge. Extracted from the two near-duplicate
 * implementations that had drifted apart:
 *   - WeeklyReportCard.tsx  → MomentumArc (score/100, "Strong/Building/Critical" label)
 *   - app/reports/page.tsx  → ScoreArc     (value/100, plain "score" label)
 *
 * Both are now thin wrappers around this component (see bottom of file),
 * so existing call sites don't need to change their JSX.
 */

import { motion } from "framer-motion";

export type GaugeThreshold = { min: number; color: string; label?: string };

export interface RadialGaugeProps {
  /** Current value, e.g. 0–max. */
  value: number;
  /** Maximum value the gauge represents. Default 100. */
  max?: number;
  /** Pixel size (square). Default 120. */
  size?: number;
  /** Stroke width as a fraction of size, or a fixed px number. Default 0.09 * size. */
  strokeWidth?: number;
  /**
   * Color thresholds, evaluated high-to-low against `value`.
   * Default: green >= 70%, amber >= 40%, red below.
   */
  thresholds?: GaugeThreshold[];
  /** Small caption under the number, e.g. "score" or "Strong". Omit to hide. */
  label?: string;
  /** Show the trailing label under the number derived from thresholds instead of a fixed string. */
  useThresholdLabel?: boolean;
  /** Animation duration in seconds. Default 1.2. */
  duration?: number;
  trackColor?: string;
}

const DEFAULT_THRESHOLDS: GaugeThreshold[] = [
  { min: 70, color: "#4ade80", label: "Strong" },
  { min: 40, color: "#fbbf24", label: "Building" },
  { min: 0, color: "#f87171", label: "Critical" },
];

function resolveThreshold(pct: number, thresholds: GaugeThreshold[]): GaugeThreshold {
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  return sorted.find(t => pct >= t.min) ?? sorted[sorted.length - 1];
}

export function RadialGauge({
  value,
  max = 100,
  size = 120,
  strokeWidth,
  thresholds = DEFAULT_THRESHOLDS,
  label,
  useThresholdLabel = false,
  duration = 1.2,
  trackColor = "var(--bm-bg3)",
}: RadialGaugeProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const stroke = strokeWidth ?? size * 0.09;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const active = resolveThreshold(pct, thresholds);
  const caption = useThresholdLabel ? active.label : label;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={active.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration, ease: "easeOut" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 ${size * 0.05}px ${active.color}88)` }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: size * 0.23,
            fontWeight: 800,
            color: active.color,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          {Math.round(value)}
        </span>
        {caption && (
          <span
            style={{
              fontSize: size * 0.1,
              color: "var(--bm-text3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: 2,
            }}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

/** Drop-in replacement for WeeklyReportCard's old MomentumArc. */
export function MomentumArc({ score, size = 130 }: { score: number; size?: number }) {
  return <RadialGauge value={score} size={size} useThresholdLabel />;
}

/** Drop-in replacement for app/reports/page.tsx's old ScoreArc. */
export function ScoreArc({ value, size = 120 }: { value: number; size?: number }) {
  return (
    <RadialGauge
      value={value}
      size={size}
      label="score"
      thresholds={[
        { min: 60, color: "var(--bm-green)" },
        { min: 30, color: "var(--bm-amber)" },
        { min: 0, color: "var(--bm-red)" },
      ]}
    />
  );
}

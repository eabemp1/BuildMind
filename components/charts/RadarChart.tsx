"use client";

/**
 * components/charts/RadarChart.tsx
 *
 * New component — there was no spider/radar chart anywhere in the codebase.
 * MoatFingerprint.tsx's docstring called itself "scored moat dimensions
 * radar" but it only ever rendered a stack of horizontal bars. This is the
 * real thing: a single glance at N scored dimensions instead of N
 * paragraphs or N bars stacked vertically.
 *
 * Primary use case: lib/scoring/index.ts's computeViabilityBreakdown()
 * (demand / competition / timing / uniqueness / monetization, each 0–100)
 * is already computed on the server for every Break My Startup run but is
 * currently never rendered anywhere in the UI — this component is built to
 * consume that shape directly.
 */

import { motion } from "framer-motion";

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  max?: number;
  /** Optional one-line tip shown in a native <title> tooltip on the vertex. */
  tip?: string;
}

export interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
  color?: string;
  /** Number of concentric grid rings. Default 4. */
  rings?: number;
  /** Overall score shown in the center, e.g. the weighted viability_score. */
  centerValue?: number;
  centerLabel?: string;
}

function pointOnAxis(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export function RadarChart({
  axes,
  size = 280,
  color = "var(--bm-accent)",
  rings = 4,
  centerValue,
  centerLabel = "overall",
}: RadarChartProps) {
  if (axes.length < 3) return null; // radar shape needs at least a triangle

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.32;
  const labelRadius = size * 0.42;
  const n = axes.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // first axis points straight up

  const angleFor = (i: number) => startAngle + i * angleStep;

  const dataPoints = axes.map((a, i) => {
    const pct = Math.min(1, Math.max(0, a.value / (a.max ?? 100)));
    return pointOnAxis(cx, cy, maxRadius * pct, angleFor(i));
  });
  const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(" ");

  const gridRings = Array.from({ length: rings }, (_, ringIdx) => {
    const frac = (ringIdx + 1) / rings;
    const ringPoints = axes.map((_, i) => pointOnAxis(cx, cy, maxRadius * frac, angleFor(i)));
    return ringPoints.map(p => `${p.x},${p.y}`).join(" ");
  });

  const avgPct =
    axes.reduce((sum, a) => sum + Math.min(1, Math.max(0, a.value / (a.max ?? 100))), 0) / n;
  const fillColor =
    avgPct >= 0.7 ? "var(--bm-green, #4ade80)" : avgPct >= 0.4 ? "var(--bm-amber, #fbbf24)" : "var(--bm-red, #f87171)";
  const strokeColor = color === "var(--bm-accent)" ? fillColor : color;

  return (
    <div style={{ width: size, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
        {/* grid rings */}
        {gridRings.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="var(--bm-border, #2a2a2e)"
            strokeWidth={1}
            opacity={0.5 + (i / rings) * 0.3}
          />
        ))}
        {/* spokes */}
        {axes.map((_, i) => {
          const p = pointOnAxis(cx, cy, maxRadius, angleFor(i));
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="var(--bm-border, #2a2a2e)"
              strokeWidth={1}
              opacity={0.5}
            />
          );
        })}
        {/* data shape */}
        <motion.polygon
          points={dataPath}
          fill={strokeColor}
          fillOpacity={0.22}
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px`, filter: `drop-shadow(0 0 6px ${strokeColor}55)` }}
        />
        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={strokeColor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.05, duration: 0.3 }}
          >
            <title>{`${axes[i].label}: ${axes[i].value}${axes[i].max ? `/${axes[i].max}` : ""}${axes[i].tip ? ` — ${axes[i].tip}` : ""}`}</title>
          </motion.circle>
        ))}
        {/* axis labels */}
        {axes.map((a, i) => {
          const p = pointOnAxis(cx, cy, labelRadius, angleFor(i));
          const anchor = Math.abs(Math.cos(angleFor(i))) < 0.15 ? "middle" : Math.cos(angleFor(i)) > 0 ? "start" : "end";
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              style={{ fontSize: size * 0.038, fontWeight: 600, fill: "var(--bm-text3)" }}
            >
              {a.label}
            </text>
          );
        })}
        {centerValue !== undefined && (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: size * 0.09, fontWeight: 800, fill: strokeColor }}>
              {Math.round(centerValue)}
            </text>
            <text
              x={cx}
              y={cy + size * 0.06}
              textAnchor="middle"
              style={{ fontSize: size * 0.032, fill: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              {centerLabel}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

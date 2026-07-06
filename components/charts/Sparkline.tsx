"use client";

/**
 * components/charts/Sparkline.tsx
 *
 * Extracted verbatim from app/reports/page.tsx so it can be reused in
 * Agent Workforce (verdict/confidence trend across historical runs) and
 * Break My Startup (viability score trend across re-runs) without
 * duplicating the SVG math a third time.
 */

export interface SparklineProps {
  data: number[];
  color: string;
  w?: number;
  h?: number;
}

export function Sparkline({ data, color, w = 100, h = 36 }: SparklineProps) {
  // Only plot non-zero points so gaps show as gaps
  const pts = data
    .map((v, i) => ({ x: (i / (data.length - 1)) * w, y: v, idx: i }))
    .filter(p => p.y > 0);
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map(p => p.y));
  const max = Math.max(...pts.map(p => p.y));
  const range = max - min || 1;
  const pointStr = pts.map(p => `${p.x},${h - ((p.y - min) / range) * (h - 6) - 3}`).join(" ");
  const id = "spk" + color.replace(/[^a-z0-9]/gi, "");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pointStr}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
      />
    </svg>
  );
}

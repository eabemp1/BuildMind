/**
 * components/charts/index.ts
 *
 * Shared, reusable visual primitives. Import from "@/components/charts"
 * instead of redefining SVG chart functions inline in page components —
 * that duplication (MomentumArc/ScoreArc, DotCalendar) is exactly what
 * this barrel exists to stop.
 */
export { RadialGauge, MomentumArc, ScoreArc } from "./RadialGauge";
export type { RadialGaugeProps, GaugeThreshold } from "./RadialGauge";

export { Sparkline } from "./Sparkline";
export type { SparklineProps } from "./Sparkline";

export { DotHeatmap, DotCalendar } from "./DotHeatmap";
export type { DotHeatmapProps } from "./DotHeatmap";

export { RadarChart } from "./RadarChart";
export type { RadarAxis, RadarChartProps } from "./RadarChart";

export { SeverityStack } from "./SeverityStack";
export type { Severity, SeverityItem } from "./SeverityStack";

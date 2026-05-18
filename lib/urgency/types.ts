/**
 * lib/urgency/types.ts — Shared types for the urgency system
 *
 * Extracted from lib/urgency.ts monolith.
 * Import from here rather than lib/urgency.ts directly in new code.
 */

export type UrgencyLevel = "none" | "low" | "medium" | "high" | "critical";

export type UrgencySignal = {
  level: UrgencyLevel;
  headline: string;
  subtext: string;
  cta: string;
  ctaHref: string;
  streak: number;
  daysMissed: number;
  taskDebt: number;
  momentumDelta: number;
};

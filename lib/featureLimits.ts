/**
 * lib/featureLimits.ts — daily caps for the costly Builder features, in one table.
 *
 * Today there is one paid tier ("builder"). When a higher tier arrives, add a column here and
 * map the plan to it in tierOf(); no route needs to change. Deep searches (Lead Finder, Demand
 * Check) have their own table in lib/heavyRuns.ts because they are also guarded for system load.
 */
export type LimitTier = "free" | "trial" | "builder";
export type LimitedFeature = "agents" | "radar";

export const FEATURE_DAILY_LIMITS: Record<LimitedFeature, Record<LimitTier, number>> = {
  agents: { free: 0, trial: 5, builder: 25 },
  radar:  { free: 0, trial: 2, builder: 4 },
};

export const FEATURE_LABEL: Record<LimitedFeature, string> = { agents: "agent runs", radar: "radar searches" };

export function featureLimit(feature: LimitedFeature, tier: LimitTier): number {
  return FEATURE_DAILY_LIMITS[feature][tier] ?? 0;
}

export function limitMessage(feature: LimitedFeature, limit: number): string {
  return `You have used your ${limit} ${FEATURE_LABEL[feature]} for today. They reset at midnight UTC. Today and Coach are not affected.`;
}

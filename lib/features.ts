function envEnabled(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(v)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(v)) return false;
  return fallback;
}

// NOTE: Some features are intentionally OFF by default. Enable explicitly via env.
export const FEATURES = {
  aiCoach:           true,
  aiUsageLimits:     true,
  ventures:          envEnabled("NEXT_PUBLIC_FEATURE_VENTURES", false),
  milestones:        true,
  founderScore:      true,
  startupTimeline:   true,
  notifications:     true,   // ✅ enabled — local notification engine
  publicProjects:    envEnabled("NEXT_PUBLIC_FEATURE_EXPLORE", false),
  adminPortal:       false,
  analytics:         true,
  startupCommunity:  false,
  breakMyStartup:    true,
  startupKit:        true,
  weeklyShare:       true,
};
export type FeatureKey = keyof typeof FEATURES;

export const FEATURES = {
  aiCoach:           true,
  aiUsageLimits:     true,
  ventures:          false,  // 🔒 Operator tier — not yet live
  milestones:        true,
  founderScore:      true,
  startupTimeline:   true,
  notifications:     true,   // ✅ enabled — local notification engine
  publicProjects:    false,
  adminPortal:       false,
  analytics:         true,
  startupCommunity:  false,
  breakMyStartup:    true,
  startupKit:        false,
  weeklyShare:       true,
};
export type FeatureKey = keyof typeof FEATURES;

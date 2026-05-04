export const FEATURES = {
  aiCoach:           true,
  aiUsageLimits:     true,
  ventures:          true,   // ✅ enabled
  milestones:        true,
  founderScore:      true,
  startupTimeline:   true,
  notifications:     true,   // ✅ enabled — local notification engine
  publicProjects:    false,  // 🔒 Month 6–7: requires 100 users with data (Playbook §5.3)
  adminPortal:       true,   // ✅ enabled
  analytics:         true,
  startupCommunity:  false,
  breakMyStartup:    true,
  startupKit:        false,
  weeklyShare:       true,
};
export type FeatureKey = keyof typeof FEATURES;

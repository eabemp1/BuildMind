export const FEATURES = {
  aiCoach:           true,
  aiUsageLimits:     true,
  ventures:          false,
  milestones:        true,
  founderScore:      true,
  startupTimeline:   true,
  notifications:     false,
  publicProjects:    false,
  adminPortal:       false,
  analytics:         true,
  startupCommunity:  false,
  breakMyStartup:    true,
  startupKit:        true,   // NEW: PDF — Idea Validation + Branding
  weeklyShare:       true,   // NEW: stickiness — build-in-public card
};
export type FeatureKey = keyof typeof FEATURES;

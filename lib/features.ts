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
  // Growth Improvement #2: public founder score (backend ready, toggle to enable)
  publicFounderScore: false, // 🔒 activate when ready — /founder/[username] is built
  // Growth Improvement #3: teams waitlist (UI built, captures demand before feature exists)
  teamsWaitlist:     true,   // ✅ waitlist capture is live
  // Growth Improvement #5: detailed onboarding funnel tracking
  onboardingFunnelTracking: true,
};
export type FeatureKey = keyof typeof FEATURES;

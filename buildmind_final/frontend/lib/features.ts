export const FEATURES = {
  aiCoach: true,
  milestones: true,
  founderScore: true,
  startupTimeline: true,
  notifications: false,
  publicProjects: false,
  adminPortal: false,
  analytics: true,        // Progress/Reports page enabled
  startupCommunity: false,
  breakMyStartup: true,   // Break My Startup enabled
};

export type FeatureKey = keyof typeof FEATURES;

export const FEATURES = {
  aiCoach: true,
  milestones: true,
  founderScore: true,
  startupTimeline: true,
  notifications: false,
  publicProjects: false,
  adminPortal: false,
  analytics: false,
  startupCommunity: false,
};

export type FeatureKey = keyof typeof FEATURES;

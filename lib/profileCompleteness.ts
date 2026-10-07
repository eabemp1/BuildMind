/**
 * lib/profileCompleteness.ts — the one definition of "AI advice quality".
 * Pure; shared by the API route that loads the inputs and the UI bar.
 */

export interface ProfileFields {
  startupSummary?: string;
  problem?: string;
  stage?: string;
  targetUsers?: string;
  avoidanceZones?: string[];
  mrr?: number;
  revenueModel?: string;
  weeklyRevenueGoal?: number;
  personalityTags?: string[];
  displayName?: string;
  tasksCompleted?: number;
}

export interface CompletenessItem {
  label: string;
  points: number;
  complete: boolean;
  action: string;   // where to go to fix it
  actionLabel: string;
}

export function computeCompleteness(fields: ProfileFields): {
  score: number;
  items: CompletenessItem[];
} {
  const items: CompletenessItem[] = [
    {
      label: "Startup description",
      points: 25,
      complete: (fields.startupSummary?.trim().length ?? 0) > 20,
      action: "/settings#startup",
      actionLabel: "Add description",
    },
    {
      label: "Display name",
      points: 10,
      complete: (fields.displayName?.trim().length ?? 0) > 1,
      action: "/settings#profile",
      actionLabel: "Add your name",
    },
    {
      label: "Startup stage",
      points: 15,
      complete: !!(fields.stage) && fields.stage !== "Idea",
      action: "/settings#startup",
      actionLabel: "Set your stage",
    },
    {
      label: "Target users",
      points: 15,
      complete: (fields.targetUsers?.trim().length ?? 0) > 5,
      action: "/settings#startup",
      actionLabel: "Describe your users",
    },
    {
      label: "Avoidance zones",
      points: 10,
      complete: (fields.avoidanceZones?.length ?? 0) > 0,
      action: "/today",
      actionLabel: "Complete a reflection",
    },
    {
      label: "Revenue or model",
      points: 10,
      complete: (fields.mrr ?? 0) > 0 || (fields.revenueModel?.length ?? 0) > 2,
      action: "/settings#startup",
      actionLabel: "Add revenue model",
    },
    {
      label: "First task completed",
      points: 10,
      complete: (fields.tasksCompleted ?? 0) > 0,
      action: "/today",
      actionLabel: "Complete a task",
    },
  ];

  const total = items.reduce((sum, i) => sum + i.points, 0);
  const score = Math.round((items.reduce((sum, i) => sum + (i.complete ? i.points : 0), 0) / total) * 100);
  return { score, items };
}

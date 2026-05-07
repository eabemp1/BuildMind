import { planFromUserMetadata } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;

export type GrowthMetricStatus = "on_track" | "watch" | "below_target" | "no_data";

export interface GrowthMetric {
  key: string;
  label: string;
  value: number | null;
  target: number;
  unit: "percent" | "count";
  status: GrowthMetricStatus;
  detail: string;
}

export interface GrowthMetricsPayload {
  generatedAt: string;
  summary: GrowthMetric[];
  weeklyActive: { founders: number; since: string };
  conversion: { activatedUsers: number; paidActivatedUsers: number };
  executionBehavior: {
    totalTasks: number;
    completedTasks: number;
    completedReflexionActions: number;
    resolvedReflexionActions: number;
    foundersWithThreeCompletedActions: number;
    averageCompletedActionsPerActivatedFounder: number | null;
  };
  cohorts: {
    d30: { cohortSize: number; retained: number; windowStart: string; windowEnd: string };
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function date(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function status(value: number | null, target: number): GrowthMetricStatus {
  if (value === null) return "no_data";
  if (value >= target) return "on_track";
  if (value >= target * 0.75) return "watch";
  return "below_target";
}

async function rows(table: string, select: string): Promise<Row[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from(table).select(select);
    if (error) return [];
    return ((data ?? []) as unknown) as Row[];
  } catch {
    return [];
  }
}

async function authUsers(): Promise<Row[]> {
  try {
    const admin = createAdminClient();
    const out: Row[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const batch = (data.users ?? []) as unknown as Row[];
      out.push(...batch);
      if (batch.length < 1000) break;
    }
    return out;
  } catch {
    return [];
  }
}

function record(map: Map<string, Date[]>, userId: string | null, rawDate: unknown) {
  if (!userId) return;
  const d = date(rawDate);
  if (!d) return;
  const existing = map.get(userId) ?? [];
  existing.push(d);
  map.set(userId, existing);
}

function increment(map: Map<string, number>, userId: string | null) {
  if (!userId) return;
  map.set(userId, (map.get(userId) ?? 0) + 1);
}

export async function getGrowthMetrics(): Promise<GrowthMetricsPayload> {
  const [
    users,
    profiles,
    contexts,
    projects,
    milestones,
    tasks,
    reflections,
    learning,
  ] = await Promise.all([
    authUsers(),
    rows("profiles", "id,created_at,plan"),
    rows("founder_context", "user_id,last_active,updated_at"),
    rows("projects", "id,user_id,created_at"),
    rows("milestones", "id,project_id,created_at,updated_at"),
    rows("tasks", "id,milestone_id,is_completed,created_at,updated_at"),
    rows("reflections", "user_id,outcome,created_at"),
    rows("reflexion_learning_log", "user_id,outcome,created_at,outcome_recorded_at"),
  ]);

  const profilesById = new Map(profiles.map((p) => [text(p.id), p]).filter(([id]) => Boolean(id)) as [string, Row][]);
  const knownUsers = new Map<string, { createdAt: Date | null; paid: boolean }>();

  for (const user of users) {
    const id = text(user.id);
    if (!id) continue;
    const profile = profilesById.get(id);
    const profilePlan = text(profile?.plan)?.toLowerCase();
    const plan = planFromUserMetadata({ user_metadata: (user.user_metadata as Record<string, unknown> | null) ?? null });
    knownUsers.set(id, {
      createdAt: date(user.created_at) ?? date(profile?.created_at),
      paid: plan === "builder" || profilePlan === "builder",
    });
  }

  for (const profile of profiles) {
    const id = text(profile.id);
    if (!id || knownUsers.has(id)) continue;
    knownUsers.set(id, {
      createdAt: date(profile.created_at),
      paid: text(profile.plan)?.toLowerCase() === "builder",
    });
  }

  const projectUser = new Map<string, string>();
  for (const project of projects) {
    const id = text(project.id);
    const userId = text(project.user_id);
    if (id && userId) projectUser.set(id, userId);
  }

  const milestoneUser = new Map<string, string>();
  for (const milestone of milestones) {
    const id = text(milestone.id);
    const projectId = text(milestone.project_id);
    const userId = projectId ? projectUser.get(projectId) : null;
    if (id && userId) milestoneUser.set(id, userId);
  }

  const activity = new Map<string, Date[]>();
  const completedActions = new Map<string, number>();

  for (const project of projects) record(activity, text(project.user_id), project.created_at);
  for (const ctx of contexts) {
    record(activity, text(ctx.user_id), ctx.updated_at);
    record(activity, text(ctx.user_id), ctx.last_active);
  }
  for (const reflection of reflections) {
    const userId = text(reflection.user_id);
    record(activity, userId, reflection.created_at);
    if (["completed", "partial", "learned"].includes(text(reflection.outcome) ?? "")) increment(completedActions, userId);
  }
  for (const row of learning) {
    const userId = text(row.user_id);
    record(activity, userId, row.outcome_recorded_at ?? row.created_at);
    if (["completed", "partial"].includes(text(row.outcome) ?? "")) increment(completedActions, userId);
  }

  let totalTasks = 0;
  let completedTasks = 0;
  for (const task of tasks) {
    const userId = milestoneUser.get(text(task.milestone_id) ?? "");
    record(activity, userId ?? null, task.updated_at ?? task.created_at);
    totalTasks += 1;
    if (task.is_completed === true) {
      completedTasks += 1;
      increment(completedActions, userId ?? null);
    }
  }

  const weeklySince = new Date(daysAgo(7));
  const weeklyActive = [...activity.entries()].filter(([, dates]) => dates.some((d) => d >= weeklySince)).length;

  const d30Start = new Date(daysAgo(60));
  const d30End = new Date(daysAgo(30));
  const d30Cohort = [...knownUsers.entries()].filter(([, user]) =>
    user.createdAt && user.createdAt >= d30Start && user.createdAt <= d30End
  );
  const d30Retained = d30Cohort.filter(([userId, user]) => {
    if (!user.createdAt) return false;
    const day30 = new Date(user.createdAt.getTime() + 30 * 86400000);
    const day37 = new Date(user.createdAt.getTime() + 37 * 86400000);
    return (activity.get(userId) ?? []).some((d) => d >= day30 && d <= day37);
  }).length;

  const projectCounts = new Map<string, number>();
  for (const project of projects) {
    const userId = text(project.user_id);
    if (userId) projectCounts.set(userId, (projectCounts.get(userId) ?? 0) + 1);
  }

  const activated = [...knownUsers.keys()].filter((userId) =>
    (projectCounts.get(userId) ?? 0) > 0 && (completedActions.get(userId) ?? 0) >= 3
  );
  const paidActivated = activated.filter((userId) => knownUsers.get(userId)?.paid).length;

  const resolvedReflexion = learning.filter((row) =>
    ["completed", "partial", "overridden", "ignored"].includes(text(row.outcome) ?? "")
  ).length;
  const completedReflexion = learning.filter((row) =>
    ["completed", "partial"].includes(text(row.outcome) ?? "")
  ).length;

  const d30 = percent(d30Retained, d30Cohort.length);
  const conversion = percent(paidActivated, activated.length);
  const taskCompletion = percent(completedTasks, totalTasks);
  const reflexionCompletion = percent(completedReflexion, resolvedReflexion);
  const behavior = reflexionCompletion ?? taskCompletion;
  const averageCompleted = activated.length
    ? Math.round((activated.reduce((sum, userId) => sum + (completedActions.get(userId) ?? 0), 0) / activated.length) * 10) / 10
    : null;

  return {
    generatedAt: new Date().toISOString(),
    summary: [
      {
        key: "d30_retention",
        label: "D30 retention",
        value: d30,
        target: 25,
        unit: "percent",
        status: status(d30, 25),
        detail: `${d30Retained}/${d30Cohort.length} founders were active again 30-37 days after signup.`,
      },
      {
        key: "weekly_active_founders",
        label: "Weekly active founders",
        value: weeklyActive,
        target: 100,
        unit: "count",
        status: status(weeklyActive, 100),
        detail: `Unique founders active since ${weeklySince.toISOString().slice(0, 10)}.`,
      },
      {
        key: "activated_to_paid",
        label: "Activated to paid",
        value: conversion,
        target: 10,
        unit: "percent",
        status: status(conversion, 10),
        detail: `${paidActivated}/${activated.length} activated founders are on Builder.`,
      },
      {
        key: "execution_behavior",
        label: "Execution behavior",
        value: behavior,
        target: 55,
        unit: "percent",
        status: status(behavior, 55),
        detail: reflexionCompletion !== null
          ? `${completedReflexion}/${resolvedReflexion} Reflexion actions completed or partially completed.`
          : `${completedTasks}/${totalTasks} roadmap tasks completed.`,
      },
    ],
    weeklyActive: { founders: weeklyActive, since: weeklySince.toISOString() },
    conversion: { activatedUsers: activated.length, paidActivatedUsers: paidActivated },
    executionBehavior: {
      totalTasks,
      completedTasks,
      completedReflexionActions: completedReflexion,
      resolvedReflexionActions: resolvedReflexion,
      foundersWithThreeCompletedActions: [...completedActions.values()].filter((count) => count >= 3).length,
      averageCompletedActionsPerActivatedFounder: averageCompleted,
    },
    cohorts: {
      d30: {
        cohortSize: d30Cohort.length,
        retained: d30Retained,
        windowStart: d30Start.toISOString(),
        windowEnd: d30End.toISOString(),
      },
    },
  };
}

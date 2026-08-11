/**
 * lib/journeyCalls.ts — video-call scheduling + auto-generated review agenda.
 *
 * Explicitly, entirely non-AI. The agenda is not a generated summary —
 * it's a direct pull of real rows (modules passed, skills still needing
 * reinforcement, streak, achievements, XP) filtered to "since the last
 * completed call." No model reads or writes anything here. If this ever
 * needs to feel more "written," that's a prompt-engineering decision for a
 * future turn — today it's plain aggregation, matching every other derived
 * value in this feature (streak, level, progress %).
 *
 * Scope decision: calls are scheduled against the student_id (token-link)
 * identity only, not user_id. The mentor UI already has a clean list of
 * named students via journey_students (built for the access-link feature);
 * building an equivalent picker for authenticated user_id accounts would
 * mean a second student-lookup UI for a single-student use case. If she
 * moves fully to the authenticated path, this is the piece to extend —
 * flagging it now rather than silently limiting scope.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { getModuleByOrder, JOURNEY_SKILLS } from "@/lib/journeyCurriculum";
import { JOURNEY_ACHIEVEMENTS } from "@/lib/journeyGamification";
import { getStreak } from "@/lib/journey";

export interface JourneyCall {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: "scheduled" | "completed" | "canceled";
  notes: string | null;
  created_at: string;
}

export async function scheduleCall(mentorId: string, studentId: string, scheduledAt: string): Promise<JourneyCall> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_calls")
    .insert({ student_id: studentId, scheduled_at: scheduledAt, status: "scheduled", created_by: mentorId })
    .select("*")
    .single();

  if (error || !data) {
    logError("journeyCalls.scheduleCall", error);
    throw new Error("Failed to schedule call");
  }
  return data as JourneyCall;
}

export async function listCallsForStudent(studentId: string): Promise<JourneyCall[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_calls")
    .select("*")
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: false });

  if (error) {
    logError("journeyCalls.listCallsForStudent", error);
    return [];
  }
  return (data ?? []) as JourneyCall[];
}

export async function completeCall(callId: string, notes: string | null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("journey_calls")
    .update({ status: "completed", notes })
    .eq("id", callId);

  if (error) {
    logError("journeyCalls.completeCall", error);
    throw new Error("Failed to complete call");
  }
}

export async function cancelCall(callId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("journey_calls").update({ status: "canceled" }).eq("id", callId);
  if (error) {
    logError("journeyCalls.cancelCall", error);
    throw new Error("Failed to cancel call");
  }
}

export interface CallAgenda {
  /** ISO timestamp the agenda is measured "since" — either the last completed call, or when she started. */
  sinceLabel: string;
  modulesPassedSince: { moduleOrder: number; title: string }[];
  skillsNeedingReinforcement: { skillId: string; skillName: string }[];
  currentStreak: number;
  achievementsSince: { name: string; unlockedAt: string }[];
  xpEarnedSince: number;
}

/**
 * Builds the review agenda for a student's next call. Pure aggregation:
 * every field here is a direct read of existing rows, filtered by a "since"
 * timestamp (the most recent completed call, or the path's start date if
 * there's never been one). No summarization, no generated text.
 */
export async function getCallAgenda(studentId: string): Promise<CallAgenda> {
  const admin = createAdminClient();

  const [{ data: lastCompletedCall }, { data: path }] = await Promise.all([
    admin
      .from("journey_calls")
      .select("scheduled_at")
      .eq("student_id", studentId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("journey_paths").select("started_at").eq("student_id", studentId).maybeSingle(),
  ]);

  const since = lastCompletedCall?.scheduled_at ?? path?.started_at ?? new Date(0).toISOString();

  const [{ data: passedProjects }, { data: evidence }, { data: achievements }, { data: xpEvents }] = await Promise.all([
    admin
      .from("journey_projects")
      .select("module_order, updated_at")
      .eq("student_id", studentId)
      .eq("status", "passed")
      .gte("updated_at", since),
    admin
      .from("journey_skill_evidence")
      .select("skill_id, level, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    admin
      .from("journey_achievements")
      .select("achievement_id, unlocked_at")
      .eq("student_id", studentId)
      .gte("unlocked_at", since),
    admin.from("journey_xp_events").select("xp, created_at").eq("student_id", studentId).gte("created_at", since),
  ]);

  const modulesPassedSince = (passedProjects ?? [])
    .map((p) => {
      const module_ = getModuleByOrder(p.module_order);
      return module_ ? { moduleOrder: p.module_order, title: module_.title } : null;
    })
    .filter((m): m is { moduleOrder: number; title: string } => m !== null);

  // Latest evidence row per skill, same "most recent wins" logic used everywhere else.
  const latestLevelBySkill = new Map<string, string>();
  for (const row of evidence ?? []) {
    if (!latestLevelBySkill.has(row.skill_id)) latestLevelBySkill.set(row.skill_id, row.level);
  }
  const skillsNeedingReinforcement = Array.from(latestLevelBySkill.entries())
    .filter(([, level]) => level === "needs_reinforcement")
    .map(([skillId]) => {
      const skill = JOURNEY_SKILLS.find((s) => s.id === skillId);
      return skill ? { skillId, skillName: skill.name } : null;
    })
    .filter((s): s is { skillId: string; skillName: string } => s !== null);

  const achievementsSince = (achievements ?? [])
    .map((a) => {
      const def = JOURNEY_ACHIEVEMENTS.find((ach) => ach.id === a.achievement_id);
      return def ? { name: def.name, unlockedAt: a.unlocked_at } : null;
    })
    .filter((a): a is { name: string; unlockedAt: string } => a !== null);

  const xpEarnedSince = (xpEvents ?? []).reduce((sum, row) => sum + (row.xp ?? 0), 0);

  const streak = await getStreak("student_id", studentId);

  return {
    sinceLabel: since,
    modulesPassedSince,
    skillsNeedingReinforcement,
    currentStreak: streak.currentStreak,
    achievementsSince,
    xpEarnedSince,
  };
  }

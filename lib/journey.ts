/**
 * lib/journey.ts — Developer Journey domain logic (Phase 1 vertical slice)
 *
 * SERVER-SIDE ONLY. Import only from app/api/journey/* routes.
 *
 * Deliberately deterministic (no LLM calls) per the master prompt's own
 * cost-control rule (§57): XP/progress/deadlines/streaks are arithmetic,
 * not AI. AI Tutor and AI-assisted feedback are out of scope for Phase 1
 * (see docs/developer-journey-phase0-audit.md, section M).
 *
 * Mentor writes (grading, skill evidence) go through gradeSubmission(),
 * which the caller MUST gate with isAdminUser() before invoking — this
 * module does not re-check admin status itself, to keep it a pure data
 * layer. The DB layer also enforces this independently: journey_grades and
 * journey_skill_evidence have no authenticated-role write policy at all,
 * so even a bug in the route-level check can't let a student write a grade.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import {
  JOURNEY_MODULES,
  getModuleByOrder,
  getSkill,
  TOTAL_MODULES,
  DEFAULT_RUBRIC_WEIGHTS,
  type RubricCategory,
} from "@/lib/journeyCurriculum";
import { xpForEvent, levelForXp, computeStreak, JOURNEY_ACHIEVEMENTS, type JourneyXpEventType, type LevelProgress, type StreakResult, type JourneyAchievementStats } from "@/lib/journeyGamification";

// ─── XP ledger (Phase 5) ─────────────────────────────────────────────────────
//
// Append-only writes to journey_xp_events. Both identity columns are
// supported for the same reason as everywhere else in this file — the
// authenticated (user_id) and token-link (student_id) paths are otherwise
// identical, so this one helper serves both rather than being duplicated.

type IdentityColumn = "user_id" | "student_id";

async function awardXp(
  identityColumn: IdentityColumn,
  identityValue: string,
  eventType: JourneyXpEventType,
  sourceId?: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("journey_xp_events").insert({
    [identityColumn]: identityValue,
    event_type: eventType,
    xp: xpForEvent(eventType),
    source_id: sourceId ?? null,
  });
  // XP is encouragement, not a system of record for grading — a failed
  // write here should never block or roll back the submission/grade it's
  // attached to. Log and move on.
  if (error) logError("journey.awardXp", error);
}

async function getTotalXp(identityColumn: IdentityColumn, identityValue: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_xp_events")
    .select("xp")
    .eq(identityColumn, identityValue);

  if (error) {
    logError("journey.getTotalXp", error);
    return 0;
  }
  return (data ?? []).reduce((sum, row) => sum + (row.xp ?? 0), 0);
}

function hydrateAchievements(unlocked: UnlockedAchievement[]) {
  return unlocked
    .map((u) => {
      const def = JOURNEY_ACHIEVEMENTS.find((a) => a.id === u.achievement_id);
      return def ? { id: def.id, name: def.name, description: def.description, unlockedAt: u.unlocked_at } : null;
    })
    .filter((a): a is { id: string; name: string; description: string; unlockedAt: string } => a !== null);
}

export async function getLevelProgress(identityColumn: IdentityColumn, identityValue: string): Promise<LevelProgress> {
  const totalXp = await getTotalXp(identityColumn, identityValue);
  return levelForXp(totalXp);
}

// ─── Streaks (derived) ───────────────────────────────────────────────────────

export async function getStreak(identityColumn: IdentityColumn, identityValue: string): Promise<StreakResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_xp_events")
    .select("created_at")
    .eq(identityColumn, identityValue);

  if (error) {
    logError("journey.getStreak", error);
    return { currentStreak: 0, longestStreak: 0 };
  }
  return computeStreak((data ?? []).map((row) => row.created_at));
}

// ─── Achievements ───────────────────────────────────────────────────────────

export interface UnlockedAchievement {
  achievement_id: string;
  unlocked_at: string;
}

async function getPassedModuleOrders(identityColumn: IdentityColumn, identityValue: string): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("journey_projects")
    .select("module_order")
    .eq(identityColumn, identityValue)
    .eq("status", "passed");
  return (data ?? []).map((row) => row.module_order);
}

/** True if any skill has ever gone needs_reinforcement -> demonstrated/strong. */
async function detectComeback(identityColumn: IdentityColumn, identityValue: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("journey_skill_evidence")
    .select("skill_id, level, created_at")
    .eq(identityColumn, identityValue)
    .order("created_at", { ascending: true });

  const seenReinforcement = new Set<string>();
  for (const row of data ?? []) {
    if (row.level === "needs_reinforcement") {
      seenReinforcement.add(row.skill_id);
    } else if ((row.level === "demonstrated" || row.level === "strong") && seenReinforcement.has(row.skill_id)) {
      return true;
    }
  }
  return false;
}

export async function getUnlockedAchievements(identityColumn: IdentityColumn, identityValue: string): Promise<UnlockedAchievement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_achievements")
    .select("achievement_id, unlocked_at")
    .eq(identityColumn, identityValue)
    .order("unlocked_at", { ascending: false });

  if (error) {
    logError("journey.getUnlockedAchievements", error);
    return [];
  }
  return (data ?? []) as UnlockedAchievement[];
}

/**
 * Evaluates every JOURNEY_ACHIEVEMENTS condition against current data and
 * inserts any newly-qualifying ones. Idempotent — re-running never
 * re-unlocks or duplicates (guarded by the unique index in the migration
 * AND by checking already-unlocked ids here first, so we don't even
 * attempt a redundant insert). Called once, at the end of gradeSubmission —
 * that's the only point where projectsPassed, skill evidence, or XP can
 * change, so it's the only point achievements need re-evaluating.
 */
export async function checkAndUnlockJourneyAchievements(
  identityColumn: IdentityColumn,
  identityValue: string,
): Promise<UnlockedAchievement[]> {
  const admin = createAdminClient();

  const [alreadyUnlocked, modulesPassed, streak, hasComeback, totalXp] = await Promise.all([
    getUnlockedAchievements(identityColumn, identityValue),
    getPassedModuleOrders(identityColumn, identityValue),
    getStreak(identityColumn, identityValue),
    detectComeback(identityColumn, identityValue),
    getTotalXp(identityColumn, identityValue),
  ]);

  void totalXp; // not currently used in any condition, kept for future achievements

  const alreadyUnlockedIds = new Set(alreadyUnlocked.map((a) => a.achievement_id));
  const stats: JourneyAchievementStats = {
    projectsPassed: modulesPassed.length,
    modulesPassed,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    hasComeback,
  };

  const newlyUnlocked: UnlockedAchievement[] = [];
  for (const achievement of JOURNEY_ACHIEVEMENTS) {
    if (alreadyUnlockedIds.has(achievement.id)) continue;
    if (!achievement.condition(stats)) continue;

    const { error } = await admin.from("journey_achievements").insert({
      [identityColumn]: identityValue,
      achievement_id: achievement.id,
    });
    if (error) {
      // Could be a genuine failure, or a race with another concurrent grade
      // hitting the unique index first — either way, don't report it as
      // unlocked if the write didn't actually land.
      logError("journey.checkAndUnlockJourneyAchievements", error);
      continue;
    }
    newlyUnlocked.push({ achievement_id: achievement.id, unlocked_at: new Date().toISOString() });
  }

  return newlyUnlocked;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JourneyPath {
  id: string;
  user_id: string;
  current_module_order: number;
  status: "active" | "paused" | "completed";
  started_at: string;
}

export interface JourneyProject {
  id: string;
  user_id: string;
  module_order: number;
  title: string;
  status: "not_started" | "in_progress" | "submitted" | "graded" | "passed";
}

export interface RemediationTip {
  skillId: string;
  skillName: string;
  tip: string;
}

export interface LatestGrade {
  score: number;
  feedback: string | null;
  weaknesses: string | null;
  required_fixes: string | null;
  created_at: string;
}

export interface TodayMission {
  moduleOrder: number;
  moduleTitle: string;
  topics: string[];
  projectTitle: string;
  project: JourneyProject | null;
  milestone: { id: string; title: string; deadline: string | null; status: string } | null;
  progressPct: number; // 0-100 across the whole 16-module path
  /**
   * Present only when project.status === "graded" (i.e. graded but scored
   * below the 70 pass threshold — see gradeSubmission). Master prompt §24:
   * don't make her repeat the whole module, point at the specific gap.
   */
  latestGrade: LatestGrade | null;
  remediation: RemediationTip[];
}

/** Fetches the most recent grade for a project, if any (used for remediation). */
async function getLatestGradeForProject(projectId: string): Promise<LatestGrade | null> {
  const admin = createAdminClient();
  const { data: submission } = await admin
    .from("journey_submissions")
    .select("id")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!submission) return null;

  const { data: grade } = await admin
    .from("journey_grades")
    .select("score, feedback, weaknesses, required_fixes, created_at")
    .eq("submission_id", submission.id)
    .maybeSingle();

  return (grade as LatestGrade) ?? null;
}

/** Builds remediation tips for a module's skills that came back needing reinforcement. */
async function getRemediationForProject(studentIdentityCol: "user_id" | "student_id", identityValue: string, moduleOrder: number): Promise<RemediationTip[]> {
  const module_ = getModuleByOrder(moduleOrder);
  if (!module_ || module_.primarySkillIds.length === 0) return [];

  const admin = createAdminClient();
  const { data: evidence } = await admin
    .from("journey_skill_evidence")
    .select("skill_id, level, created_at")
    .eq(studentIdentityCol, identityValue)
    .in("skill_id", module_.primarySkillIds)
    .order("created_at", { ascending: false });

  const latestLevelBySkill = new Map<string, string>();
  for (const row of evidence ?? []) {
    if (!latestLevelBySkill.has(row.skill_id)) latestLevelBySkill.set(row.skill_id, row.level);
  }

  const tips: RemediationTip[] = [];
  for (const skillId of module_.primarySkillIds) {
    if (latestLevelBySkill.get(skillId) === "needs_reinforcement") {
      const skill = getSkill(skillId);
      if (skill) tips.push({ skillId: skill.id, skillName: skill.name, tip: skill.remediationTip });
    }
  }
  return tips;
}

// ─── Path ───────────────────────────────────────────────────────────────────

/** Fetch the student's path, creating it (at module 1) on first access. */
export async function getOrCreatePath(userId: string): Promise<JourneyPath> {
  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("journey_paths")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    logError("journey.getOrCreatePath.fetch", fetchErr);
    throw new Error("Failed to load journey path");
  }
  if (existing) return existing as JourneyPath;

  const { data: created, error: insertErr } = await admin
    .from("journey_paths")
    .insert({ user_id: userId, current_module_order: 1, status: "active" })
    .select("*")
    .single();

  if (insertErr || !created) {
    logError("journey.getOrCreatePath.insert", insertErr);
    throw new Error("Failed to create journey path");
  }
  return created as JourneyPath;
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function getOrCreateProject(userId: string, moduleOrder: number): Promise<JourneyProject> {
  const module_ = getModuleByOrder(moduleOrder);
  if (!module_) throw new Error(`Invalid module_order: ${moduleOrder}`);

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("journey_projects")
    .select("*")
    .eq("user_id", userId)
    .eq("module_order", moduleOrder)
    .maybeSingle();

  if (fetchErr) {
    logError("journey.getOrCreateProject.fetch", fetchErr);
    throw new Error("Failed to load project");
  }
  if (existing) return existing as JourneyProject;

  const { data: created, error: insertErr } = await admin
    .from("journey_projects")
    .insert({
      user_id: userId,
      module_order: moduleOrder,
      title: module_.projectTitle,
      status: "not_started",
    })
    .select("*")
    .single();

  if (insertErr || !created) {
    logError("journey.getOrCreateProject.insert", insertErr);
    throw new Error("Failed to create project");
  }
  return created as JourneyProject;
}

export async function startProject(userId: string, moduleOrder: number, deadline?: string | null) {
  const admin = createAdminClient();
  const project = await getOrCreateProject(userId, moduleOrder);

  if (project.status === "not_started") {
    await admin.from("journey_projects").update({ status: "in_progress" }).eq("id", project.id);
  }

  const { data: existingMilestone } = await admin
    .from("journey_milestones")
    .select("id")
    .eq("project_id", project.id)
    .maybeSingle();

  if (!existingMilestone) {
    const module_ = getModuleByOrder(moduleOrder)!;
    await admin.from("journey_milestones").insert({
      project_id: project.id,
      user_id: userId,
      title: `Submit ${module_.projectTitle}`,
      deadline: deadline ?? null,
      status: "pending",
    });
  }

  return getOrCreateProject(userId, moduleOrder);
}

// ─── Student-identity variants (token-link access, no auth.uid()) ──────────
//
// Everything below mirrors the functions above exactly, but keys off
// journey_students.id (student_id column) instead of auth.users.id
// (user_id column) — see 20260809000000_developer_journey_student_access_links.sql
// for why these are separate columns rather than one. Kept as parallel
// functions rather than parameterizing the ones above with a generic
// "identity column" argument: duplication here is cheap and every call site
// stays simple and greppable, versus threading a column name through ~10
// query builders for a two-identity system that isn't likely to grow a third.

export async function getOrCreatePathForStudent(studentId: string): Promise<JourneyPath> {
  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("journey_paths")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();

  if (fetchErr) {
    logError("journey.getOrCreatePathForStudent.fetch", fetchErr);
    throw new Error("Failed to load journey path");
  }
  if (existing) return existing as JourneyPath;

  const { data: created, error: insertErr } = await admin
    .from("journey_paths")
    .insert({ student_id: studentId, current_module_order: 1, status: "active" })
    .select("*")
    .single();

  if (insertErr || !created) {
    logError("journey.getOrCreatePathForStudent.insert", insertErr);
    throw new Error("Failed to create journey path");
  }
  return created as JourneyPath;
}

export async function getOrCreateProjectForStudent(studentId: string, moduleOrder: number): Promise<JourneyProject> {
  const module_ = getModuleByOrder(moduleOrder);
  if (!module_) throw new Error(`Invalid module_order: ${moduleOrder}`);

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("journey_projects")
    .select("*")
    .eq("student_id", studentId)
    .eq("module_order", moduleOrder)
    .maybeSingle();

  if (fetchErr) {
    logError("journey.getOrCreateProjectForStudent.fetch", fetchErr);
    throw new Error("Failed to load project");
  }
  if (existing) return existing as JourneyProject;

  const { data: created, error: insertErr } = await admin
    .from("journey_projects")
    .insert({
      student_id: studentId,
      module_order: moduleOrder,
      title: module_.projectTitle,
      status: "not_started",
    })
    .select("*")
    .single();

  if (insertErr || !created) {
    logError("journey.getOrCreateProjectForStudent.insert", insertErr);
    throw new Error("Failed to create project");
  }
  return created as JourneyProject;
}

export async function startProjectForStudent(studentId: string, moduleOrder: number, deadline?: string | null) {
  const admin = createAdminClient();
  const project = await getOrCreateProjectForStudent(studentId, moduleOrder);

  if (project.status === "not_started") {
    await admin.from("journey_projects").update({ status: "in_progress" }).eq("id", project.id);
  }

  const { data: existingMilestone } = await admin
    .from("journey_milestones")
    .select("id")
    .eq("project_id", project.id)
    .maybeSingle();

  if (!existingMilestone) {
    const module_ = getModuleByOrder(moduleOrder)!;
    await admin.from("journey_milestones").insert({
      project_id: project.id,
      student_id: studentId,
      title: `Submit ${module_.projectTitle}`,
      deadline: deadline ?? null,
      status: "pending",
    });
  }

  return getOrCreateProjectForStudent(studentId, moduleOrder);
}

export async function submitProjectForStudent(
  studentId: string,
  projectId: string,
  input: { repository_url?: string; notes?: string },
) {
  const admin = createAdminClient();

  const { data: project, error: projErr } = await admin
    .from("journey_projects")
    .select("*")
    .eq("id", projectId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (projErr || !project) throw new Error("Project not found");

  const { count } = await admin
    .from("journey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const nextVersion = (count ?? 0) + 1;

  const { data: submission, error: subErr } = await admin
    .from("journey_submissions")
    .insert({
      project_id: projectId,
      student_id: studentId,
      version: nextVersion,
      repository_url: input.repository_url ?? null,
      notes: input.notes ?? null,
      status: "awaiting_review",
    })
    .select("*")
    .single();

  if (subErr || !submission) {
    logError("journey.submitProjectForStudent", subErr);
    throw new Error("Failed to record submission");
  }

  await admin.from("journey_projects").update({ status: "submitted" }).eq("id", projectId);
  await admin
    .from("journey_milestones")
    .update({ status: "completed" })
    .eq("project_id", projectId)
    .eq("status", "pending");

  await awardXp("student_id", studentId, "project_submitted", submission.id);
  if (nextVersion > 1) await awardXp("student_id", studentId, "revision_completed", submission.id);

  return submission;
}

export async function getTodayMissionForStudent(studentId: string): Promise<TodayMission> {
  const path = await getOrCreatePathForStudent(studentId);
  const module_ = getModuleByOrder(path.current_module_order);
  if (!module_) throw new Error("Invalid current_module_order on path");

  const project = await getOrCreateProjectForStudent(studentId, path.current_module_order);

  const admin = createAdminClient();
  const { data: milestone } = await admin
    .from("journey_milestones")
    .select("id, title, deadline, status")
    .eq("project_id", project.id)
    .maybeSingle();

  const completedModules = path.current_module_order - 1;
  const progressPct = Math.round((completedModules / TOTAL_MODULES) * 100);

  const needsRemediation = project.status === "graded";
  const latestGrade = needsRemediation ? await getLatestGradeForProject(project.id) : null;
  const remediation = needsRemediation
    ? await getRemediationForProject("student_id", studentId, path.current_module_order)
    : [];

  return {
    moduleOrder: module_.order,
    moduleTitle: module_.title,
    topics: module_.topics,
    projectTitle: module_.projectTitle,
    project,
    milestone: milestone ?? null,
    progressPct,
    latestGrade,
    remediation,
  };
}

export async function getProgressForStudent(studentId: string) {
  const admin = createAdminClient();
  const path = await getOrCreatePathForStudent(studentId);

  const { data: projects, error } = await admin
    .from("journey_projects")
    .select("id, module_order, title, status")
    .eq("student_id", studentId)
    .order("module_order", { ascending: true });

  if (error) {
    logError("journey.getProgressForStudent", error);
    throw new Error("Failed to load progress");
  }

  const { data: evidence } = await admin
    .from("journey_skill_evidence")
    .select("skill_id, level, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  const skillLevels = new Map<string, string>();
  for (const row of evidence ?? []) {
    if (!skillLevels.has(row.skill_id)) skillLevels.set(row.skill_id, row.level);
  }

  const projectsPassed = (projects ?? []).filter((p) => p.status === "passed").length;
  const levelProgress = await getLevelProgress("student_id", studentId);
  const streak = await getStreak("student_id", studentId);
  const unlockedAchievements = await getUnlockedAchievements("student_id", studentId);

  return {
    currentModuleOrder: path.current_module_order,
    totalModules: TOTAL_MODULES,
    progressPct: Math.round(((path.current_module_order - 1) / TOTAL_MODULES) * 100),
    projectsPassed,
    projects: projects ?? [],
    skillLevels: Object.fromEntries(skillLevels),
    modules: JOURNEY_MODULES.map((m) => ({ order: m.order, title: m.title, projectTitle: m.projectTitle })),
    ...levelProgress,
    ...streak,
    achievements: hydrateAchievements(unlockedAchievements),
  };
}

// ─── Submissions ────────────────────────────────────────────────────────────

export async function submitProject(
  userId: string,
  projectId: string,
  input: { repository_url?: string; notes?: string },
) {
  const admin = createAdminClient();

  const { data: project, error: projErr } = await admin
    .from("journey_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projErr || !project) throw new Error("Project not found");

  const { count } = await admin
    .from("journey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const nextVersion = (count ?? 0) + 1;

  const { data: submission, error: subErr } = await admin
    .from("journey_submissions")
    .insert({
      project_id: projectId,
      user_id: userId,
      version: nextVersion,
      repository_url: input.repository_url ?? null,
      notes: input.notes ?? null,
      status: "awaiting_review",
    })
    .select("*")
    .single();

  if (subErr || !submission) {
    logError("journey.submitProject", subErr);
    throw new Error("Failed to record submission");
  }

  await admin.from("journey_projects").update({ status: "submitted" }).eq("id", projectId);
  await admin
    .from("journey_milestones")
    .update({ status: "completed" })
    .eq("project_id", projectId)
    .eq("status", "pending");

  await awardXp("user_id", userId, "project_submitted", submission.id);
  if (nextVersion > 1) await awardXp("user_id", userId, "revision_completed", submission.id);

  return submission;
}

// ─── Grading (mentor-only — caller MUST have already verified isAdminUser) ──

export interface GradeInput {
  score: number; // 0-100 overall
  category_scores?: Partial<Record<RubricCategory, number>>;
  feedback?: string;
  strengths?: string;
  weaknesses?: string;
  required_fixes?: string;
}

export async function gradeSubmission(mentorId: string, submissionId: string, input: GradeInput) {
  const admin = createAdminClient();

  const { data: submission, error: subErr } = await admin
    .from("journey_submissions")
    .select("*, journey_projects(id, user_id, student_id, module_order)")
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr || !submission) throw new Error("Submission not found");

  // A submission carries EITHER user_id (authenticated path, Phase 1) OR
  // student_id (token-link path, Phase 2) — never neither, per the
  // identity_check constraints on every journey_* table. Branch once here
  // rather than duplicating this whole function per identity.
  const identityColumn: "user_id" | "student_id" = submission.student_id ? "student_id" : "user_id";
  const identityValue: string = submission.student_id ?? submission.user_id;
  const projectId: string = submission.project_id;
  const moduleOrder: number = submission.journey_projects?.module_order;

  const { data: grade, error: gradeErr } = await admin
    .from("journey_grades")
    .insert({
      submission_id: submissionId,
      [identityColumn]: identityValue,
      graded_by: mentorId,
      score: input.score,
      category_scores: input.category_scores ?? {},
      feedback: input.feedback ?? null,
      strengths: input.strengths ?? null,
      weaknesses: input.weaknesses ?? null,
      required_fixes: input.required_fixes ?? null,
    })
    .select("*")
    .single();

  if (gradeErr || !grade) {
    logError("journey.gradeSubmission.insert", gradeErr);
    throw new Error("Failed to record grade");
  }

  await admin.from("journey_submissions").update({ status: "graded" }).eq("id", submissionId);

  const passed = input.score >= 70; // simple default threshold; mentor can regrade
  await admin
    .from("journey_projects")
    .update({ status: passed ? "passed" : "graded" })
    .eq("id", projectId);

  if (passed) await awardXp(identityColumn, identityValue, "project_passed", grade.id);

  // Write skill evidence — deterministic, derived from the module's primary
  // skills and the grade outcome. This is the one place skill mastery is
  // ever written (see journey_skill_evidence RLS: no client write path).
  const module_ = getModuleByOrder(moduleOrder);
  if (module_) {
    const level = passed ? "demonstrated" : "needs_reinforcement";
    const rows = module_.primarySkillIds.map((skillId) => ({
      [identityColumn]: identityValue,
      skill_id: skillId,
      source_type: "grade" as const,
      source_id: grade.id,
      level,
      note: `From grading of "${module_.projectTitle}" (score ${input.score})`,
    }));
    if (rows.length > 0) {
      const { error: evErr } = await admin.from("journey_skill_evidence").insert(rows);
      if (evErr) logError("journey.gradeSubmission.skillEvidence", evErr);
    }
  }

  // Advance the path if this was the current module and the student passed.
  if (passed && moduleOrder) {
    const { data: path } = await admin
      .from("journey_paths")
      .select("*")
      .eq(identityColumn, identityValue)
      .maybeSingle();
    if (path && path.current_module_order === moduleOrder) {
      const nextOrder = Math.min(moduleOrder + 1, TOTAL_MODULES);
      const nowComplete = moduleOrder >= TOTAL_MODULES;
      await admin
        .from("journey_paths")
        .update({
          current_module_order: nextOrder,
          status: nowComplete ? "completed" : "active",
        })
        .eq(identityColumn, identityValue);
    }
  }

  // Achievements can only change as a result of a grade (projects passed,
  // skill evidence, streak) — this is the one place they're re-evaluated.
  await checkAndUnlockJourneyAchievements(identityColumn, identityValue);

  return grade;
}

// ─── Today mission (deterministic) ──────────────────────────────────────────

export async function getTodayMission(userId: string): Promise<TodayMission> {
  const path = await getOrCreatePath(userId);
  const module_ = getModuleByOrder(path.current_module_order);
  if (!module_) throw new Error("Invalid current_module_order on path");

  const project = await getOrCreateProject(userId, path.current_module_order);

  const admin = createAdminClient();
  const { data: milestone } = await admin
    .from("journey_milestones")
    .select("id, title, deadline, status")
    .eq("project_id", project.id)
    .maybeSingle();

  const completedModules = path.current_module_order - 1;
  const progressPct = Math.round((completedModules / TOTAL_MODULES) * 100);

  const needsRemediation = project.status === "graded"; // graded but not passed
  const latestGrade = needsRemediation ? await getLatestGradeForProject(project.id) : null;
  const remediation = needsRemediation
    ? await getRemediationForProject("user_id", userId, path.current_module_order)
    : [];

  return {
    moduleOrder: module_.order,
    moduleTitle: module_.title,
    topics: module_.topics,
    projectTitle: module_.projectTitle,
    project,
    milestone: milestone ?? null,
    progressPct,
    latestGrade,
    remediation,
  };
}

// ─── Progress ───────────────────────────────────────────────────────────────

export async function getProgress(userId: string) {
  const admin = createAdminClient();
  const path = await getOrCreatePath(userId);

  const { data: projects, error } = await admin
    .from("journey_projects")
    .select("id, module_order, title, status")
    .eq("user_id", userId)
    .order("module_order", { ascending: true });

  if (error) {
    logError("journey.getProgress", error);
    throw new Error("Failed to load progress");
  }

  const { data: evidence } = await admin
    .from("journey_skill_evidence")
    .select("skill_id, level, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Latest evidence row per skill wins.
  const skillLevels = new Map<string, string>();
  for (const row of evidence ?? []) {
    if (!skillLevels.has(row.skill_id)) skillLevels.set(row.skill_id, row.level);
  }

  const projectsPassed = (projects ?? []).filter((p) => p.status === "passed").length;
  const levelProgress = await getLevelProgress("user_id", userId);
  const streak = await getStreak("user_id", userId);
  const unlockedAchievements = await getUnlockedAchievements("user_id", userId);

  return {
    currentModuleOrder: path.current_module_order,
    totalModules: TOTAL_MODULES,
    progressPct: Math.round(((path.current_module_order - 1) / TOTAL_MODULES) * 100),
    projectsPassed,
    projects: projects ?? [],
    skillLevels: Object.fromEntries(skillLevels),
    modules: JOURNEY_MODULES.map((m) => ({ order: m.order, title: m.title, projectTitle: m.projectTitle })),
    ...levelProgress,
    ...streak,
    achievements: hydrateAchievements(unlockedAchievements),
  };
}

export { DEFAULT_RUBRIC_WEIGHTS };

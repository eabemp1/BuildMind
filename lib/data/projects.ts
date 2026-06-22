/**
 * lib/data/projects.ts
 *
 * Supabase data access for projects, milestones, and tasks.
 * Extracted from lib/buildmind.ts to separate DB I/O from business logic.
 *
 * Imported by:
 *   lib/buildmind.ts   (re-exported for backwards compatibility)
 *   app/api/ai/* routes
 *
 * NOTE: No "use client" directive — this module is imported by both client
 * components AND server-side API routes. All browser-only paths are guarded
 * with `typeof window !== "undefined"` checks. API routes use createAdminClient
 * directly and never call the client-side branches of these functions.
 */

import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { inferStageFromMilestones } from "@/lib/stages";
import { computeStartupScore } from "@/lib/scoring";
import { callModel } from "@/lib/ai-providers";
import type {
  BuildMindProject,
  ProjectSummary,
  BuildMindMilestone,
  BuildMindTask,
  DashboardOverview,
  WeeklyReportMetrics,
} from "@/lib/buildmind.types";

export function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((v) => String(v)).filter(Boolean);
}

// bm_dev_auth, bm_dev_email, bm_dev_project are intentionally raw localStorage —
// pre-auth dev-mode globals written by auth/login/page.tsx before any Supabase
// session exists. Never set in production; gated behind the local dev API.
function isLocalDevAuth(): boolean {
  return typeof window !== "undefined" && localStorage.getItem("bm_dev_auth") === "1";
}

function getLocalDevProject(): ProjectSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bm_dev_project");
    return raw ? (JSON.parse(raw) as ProjectSummary) : null;
  } catch {
    return null;
  }
}

function isInvalidRefreshToken(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown; status?: unknown };
  return (
    maybeError.code === "refresh_token_not_found" ||
    (maybeError.status === 400 &&
      typeof maybeError.message === "string" &&
      maybeError.message.toLowerCase().includes("invalid refresh token"))
  );
}

export async function getCurrentUser() {
  if (isLocalDevAuth()) {
    return {
      id: "00000000-0000-4000-8000-000000000000",
      email: localStorage.getItem("bm_dev_email") ?? "test@buildmind.local",
      user_metadata: { onboarding_completed: true },
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isInvalidRefreshToken(error)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }
    throw error;
  }
  return data.user ?? null;
}

export async function ensureUserProfile(user: {
  id: string;
  email?: string | null;
}) {
  const supabase = createClient();
  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("id,email")
    .eq("id", user.id)
    .maybeSingle();
  if (selectError) return { id: user.id, email: user.email ?? "" };

  if (!existing) {
    const { error: insertError } = await supabase.from("users").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_completed: false,
    });
    if (insertError && insertError.code !== "23505") {
      return { id: user.id, email: user.email ?? "" };
    }
  }

  return { id: user.id, email: user.email ?? "" };
}

export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    const { data: userData } = await supabase.auth.getUser();
    return userData.user?.user_metadata?.onboarding_completed === true;
  }
  return Boolean(data?.onboarding_completed);
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  const supabase = createClient();

  // E2 FIX: Both writes must complete for onboarding to be considered done.
  // Previously: if the second write (users table) failed silently, the JWT said
  // onboarding_completed=true (so middleware never redirected back to /onboarding)
  // but any query reading users.onboarding_completed returned false — an
  // inconsistency with no automatic reconciliation path.
  //
  // Now: we surface errors from both writes and throw if either fails, so the
  // calling code can retry or surface a meaningful error to the user.
  const { error: authError } = await supabase.auth.updateUser({
    data: { onboarding_completed: true },
  });
  if (authError) {
    console.error("[markOnboardingComplete] auth.updateUser failed:", authError.message);
    throw new Error("Failed to complete onboarding (auth): " + authError.message);
  }

  const { error: dbError } = await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", userId);
  if (dbError) {
    // The JWT has already been updated — log the desync so it can be reconciled.
    // We do NOT throw here because blocking the UX is worse than a temporary
    // one-row desync that can be reconciled by a background job.
    console.error(
      "[markOnboardingComplete] users table update failed (JWT already updated). " +
      "Manual reconciliation may be needed for userId=" + userId + ": " + dbError.message,
    );
  }
}

export async function getProjectsForCurrentUser(): Promise<BuildMindProject[]> {
  if (isLocalDevAuth()) {
    const project = getLocalDevProject();
    if (!project) return [];
    return [{
      id: project.id,
      user_id: "00000000-0000-4000-8000-000000000000",
      title: project.title,
      description: project.description,
      industry: project.industry ?? null,
      target_market: null,
      problem_type: null,
      revenue_model: null,
      startup_stage: project.startup_stage ?? "Idea",
      validation_score: project.validation_score ?? 35,
      // Bug fix: execution_score fallback was 20, making new projects score ~22
      // instead of the intended ~13 (no AI analysis yet = no execution signal).
      // Using 0 lets computeStartupScore reflect reality — run Break My Startup
      // or complete tasks to earn an execution score.
      execution_score: project.execution_score ?? 0,
      momentum_score: project.momentum_score ?? 50,
      target_users: null,
      problem: null,
      validation_strengths: project.validation_strengths,
      validation_weaknesses: [],
      validation_suggestions: [],
      created_at: project.created_at,
    }];
  }

  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...(p as BuildMindProject),
    validation_strengths: normalizeTextArray(p.validation_strengths),
    validation_weaknesses: normalizeTextArray(p.validation_weaknesses),
    validation_suggestions: normalizeTextArray(p.validation_suggestions),
  }));
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  if (isLocalDevAuth()) {
    const project = getLocalDevProject();
    return project ? [project] : [];
  }

  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createClient();

  let { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (projectsError) throw projectsError;
  if (!projects?.length) return [];

  const projectIds = projects.map((p) => p.id);
  
  // Batch project IDs to avoid URL length limits
  const BATCH_SIZE = 20;

  const projectBatches: string[][] = [];
  for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
    projectBatches.push(projectIds.slice(i, i + BATCH_SIZE));
  }
  const milestoneResults = await Promise.all(projectBatches.map((batchIds) => {
    const milestonesQuery = supabase
      .from("milestones")
      .select("id, title, project_id, status, order_index");
    return batchIds.length === 1
      ? milestonesQuery.eq("project_id", batchIds[0])
      : milestonesQuery.in("project_id", batchIds);
  }));
  const allMilestones: Array<{ id: string; title: string; project_id: string; status?: string | null; order_index?: number | null }> =
    milestoneResults.flatMap((result) => result.data ?? []);

  const milestoneIds = allMilestones.map((m) => m.id);
  let allTasks: Array<{ id: string; title?: string | null; milestone_id: string; is_completed: boolean; created_at: string }> = [];
  
  if (milestoneIds.length > 0) {
    const milestoneBatches: string[][] = [];
    for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
      milestoneBatches.push(milestoneIds.slice(i, i + BATCH_SIZE));
    }
    const taskResults = await Promise.all(milestoneBatches.map((batchIds) => {
      const tasksQuery = supabase
        .from("tasks")
        .select("id, title, milestone_id, is_completed, created_at");
      return batchIds.length === 1
        ? tasksQuery.eq("milestone_id", batchIds[0])
        : tasksQuery.in("milestone_id", batchIds);
    }));
    allTasks = taskResults.flatMap((result) => result.data ?? []);
  }
  const { data: tasks } = { data: allTasks };

  const milestoneToProject = new Map<string, string>();
  const milestoneIdToTitle = new Map<string, string>();
  allMilestones.forEach((m) => {
    milestoneToProject.set(m.id, m.project_id);
    milestoneIdToTitle.set(m.id, m.title);
  });

  const stats = new Map<
    string,
    { tasksCompleted: number; tasksTotal: number; lastActivity: string }
  >();
  projects.forEach((p) =>
    stats.set(p.id, {
      tasksCompleted: 0,
      tasksTotal: 0,
      lastActivity: p.created_at,
    }),
  );

  (tasks ?? []).forEach((task) => {
    const projectId = milestoneToProject.get(task.milestone_id);
    if (!projectId) return;
    const current = stats.get(projectId)!;
    stats.set(projectId, {
      tasksCompleted: current.tasksCompleted + (task.is_completed ? 1 : 0),
      tasksTotal: current.tasksTotal + 1,
      lastActivity:
        task.created_at && task.created_at > current.lastActivity
          ? task.created_at
          : current.lastActivity,
    });
  });

  return projects.map((project) => {
    const current = stats.get(project.id) ?? {
      tasksCompleted: 0,
      tasksTotal: 0,
      lastActivity: project.created_at,
    };
    const progress = current.tasksTotal
      ? Math.round((current.tasksCompleted / current.tasksTotal) * 100)
      : 0;

    const projectMilestones = (allMilestones ?? []).filter(
      (m) => m.project_id === project.id,
    );
    const projectTasks = (tasks ?? []).filter(
      (t) => milestoneToProject.get(t.milestone_id) === project.id,
    );
    const computedStage = inferStageFromMilestones(
      projectMilestones,
      projectTasks.map((t) => ({
        milestone_id: t.milestone_id,
        is_completed: t.is_completed,
      })),
      milestoneIdToTitle,
    );

    // Fix #15: Prefer the user's explicitly set startup_stage over inferred milestone stage.
    // The inference algorithm can return "Revenue" whenever the auto-generated Idea milestone
    // is complete — even when the project is brand new at Idea stage.
    // Only use inferred stage if the user has never set an explicit stage.
    const userStage = project.startup_stage;
    const displayStage = userStage || computedStage || "Idea";
    const validationStrengths = normalizeTextArray(project.validation_strengths);

    // Pending milestones and tasks — used by Today page for AI personalization
    const pendingMilestones = projectMilestones
      .filter((m) => m.status !== "completed")
      .sort((a, b) => (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER))
      .map((m) => m.title)
      .slice(0, 5);
    const pendingTasks = projectTasks
      .filter((t) => !t.is_completed)
      .map((t) => t.title)
      .filter((title): title is string => Boolean(title))
      .slice(0, 5);

    return {
      id: project.id,
      title: project.title,
      description: project.description,
      created_at: project.created_at,
      industry: project.industry ?? null,
      startup_stage: displayStage,
      validation_score: project.validation_score ?? null,
      execution_score: project.execution_score ?? null,
      momentum_score: project.momentum_score ?? null,
      validation_strengths: validationStrengths,
      tasksCompleted: current.tasksCompleted,
      tasksTotal: current.tasksTotal,
      progress,
      completion_rate: progress,
      lastActivity: current.lastActivity,
      problem: project.problem ?? null,
      target_users: project.target_users ?? null,
      pendingMilestones,
      pendingTasks,
    };
  });
}

export async function updateProjectStage(
  projectId: string,
  stage: string,
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("projects")
    .update({ startup_stage: stage })
    .eq("id", projectId);
}

/**
 * updateProjectDetails — updates project fields that affect the Founder Context Object.
 *
 * Whenever target_users, problem, or description changes, the startup_summary
 * in founder_context goes stale. This function updates the project AND
 * re-synthesizes startup_summary so the AI context stays accurate.
 *
 * Called from any UI that lets the user edit their project details.
 */
export async function updateProjectDetails(
  projectId: string,
  updates: {
    target_users?: string;
    problem?: string;
    description?: string;
    title?: string;
  },
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = createClient();

  // Update the project itself
  if (Object.keys(updates).length > 0) {
    const projectUpdates = {
      ...updates,
      ...(typeof updates.title === "string" ? { name: updates.title } : {}),
    };
    await supabase
      .from("projects")
      .update(projectUpdates)
      .eq("id", projectId)
      .eq("user_id", user.id);
  }

  // Re-fetch full project to rebuild summary with latest values
  const { data: project } = await supabase
    .from("projects")
    .select("name, title, description, target_users, problem, startup_stage")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) return;

  // Rebuild startup_summary — try provider rotation, fall back to concatenation
  let newSummary = [
    project.description?.trim() || project.name?.trim() || project.title?.trim(),
    project.target_users?.trim() ? `for ${project.target_users.trim()}` : null,
    project.problem?.trim() ? `solving "${project.problem.trim().slice(0, 80)}"` : null,
  ].filter(Boolean).join(" ").slice(0, 280);

  try {
    if (project.description) {
      const synthesized = await callModel([
        {
          role: "system",
          content: "Write one precise sentence (max 30 words) describing a startup for use in AI coaching prompts. Format: '[product] for [specific user type] that [solves specific problem]'. No preamble. Output only the sentence.",
        },
        {
          role: "user",
          content: `Idea: ${project.description ?? project.title}\nTarget users: ${project.target_users ?? "not specified"}\nProblem: ${project.problem ?? "not specified"}\nStage: ${project.startup_stage ?? "Idea"}`,
        },
      ], { role: "fast", temperature: 0.3, maxTokens: 80 });
      if (synthesized && synthesized.length > 10) newSummary = synthesized.slice(0, 280);
    }
  } catch {
    // Non-fatal — use concatenated fallback
  }

  // Push updated summary back to founder_context (fire-and-forget)
  void supabase
    .from("founder_context")
    .update({ startup_summary: newSummary, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  // Also sync to founder_memory
  void supabase
    .from("founder_memory")
    .update({ startup_summary: newSummary, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
}

export async function getProjectDetail(projectId: string): Promise<{
  project: BuildMindProject;
  milestones: BuildMindMilestone[];
  tasks: BuildMindTask[];
}> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError) throw projectError;

  const { data: milestones, error: milestoneError } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });
  if (milestoneError) throw milestoneError;

  // Batch milestone IDs to avoid URL length limits (max ~20-30 per query)
  const milestoneIds = (milestones ?? []).map((m) => m.id);
  let allTasks: BuildMindTask[] = [];
  
  if (milestoneIds.length > 0) {
    const BATCH_SIZE = 20;
    const batches = [];
    
    for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
      const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
      const tasksQuery = supabase
        .from("tasks")
        .select("*");
      batches.push(
        (batchIds.length === 1
          ? tasksQuery.eq("milestone_id", batchIds[0])
          : tasksQuery.in("milestone_id", batchIds))
          .order("created_at", { ascending: true })
      );
    }
    
    const batchResults = await Promise.all(batches);
    let tasksError: unknown = null;
    
    for (const result of batchResults) {
      if (result.error) {
        tasksError = result.error;
        break;
      }
      if (result.data) {
        allTasks = allTasks.concat(result.data);
      }
    }
    
    if (tasksError) throw tasksError;
  }

  return {
    project: {
      ...(project as BuildMindProject),
      validation_strengths: normalizeTextArray(project.validation_strengths),
      validation_weaknesses: normalizeTextArray(project.validation_weaknesses),
      validation_suggestions: normalizeTextArray(project.validation_suggestions),
    },
    milestones: (milestones ?? []) as BuildMindMilestone[],
    tasks: allTasks as BuildMindTask[],
  };
}

export async function createProjectWithRoadmap(params: {
  project_name: string;
  idea_description: string;
  target_users: string;
  problem: string;
  startup_stage?: string;
  blocker_type?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  await ensureUserProfile(user);
  const supabase = createClient();

  const projectPayload = {
    user_id: user.id,
    name: params.project_name,
    title: params.project_name,
    description: params.idea_description,
    target_users: params.target_users,
    problem: params.problem,
    startup_stage: params.startup_stage ?? "Idea",
    validation_strengths: [],
    validation_weaknesses: [],
    validation_suggestions: [],
  };

  const { data: createdProject, error: projectError } = await supabase
    .from("projects")
    .insert(projectPayload as never)
    .select("*")
    .maybeSingle();

  if (projectError || !createdProject) {
    throw projectError ?? new Error("Project insert returned no project");
  }

  try {
    const roadmapRes = await fetch("/api/ai/generate-roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        projectId: createdProject.id,
        title: params.project_name,
        idea_description: params.idea_description,
        target_users: params.target_users,
        problem: params.problem,
        startup_stage: params.startup_stage ?? "Idea",
      }),
    });
    if (!roadmapRes.ok) {
      const errBody = await roadmapRes.json().catch(() => ({}));
      console.error("[createProjectWithRoadmap] Roadmap API error:", roadmapRes.status, errBody);
      // Don't throw — project was created, milestones just won't exist yet
    }
  } catch (err) {
    console.error("[createProjectWithRoadmap] Roadmap fetch failed:", err);
    // Don't throw — project was created, user can regenerate from project page
  }

  await supabase.auth.updateUser({
    data: { onboarding_completed: true },
  });

  await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  // ── Pre-populate founder_context immediately ─────────────────────────────
  // Without this, every day-1 prompt reads startup_summary: null, target_users: null
  // and hits generic fallbacks. The specificity engine has nothing to work with.
  //
  // startup_summary is a one-sentence description the AI uses in every prompt.
  // We attempt provider rotation to synthesize a sharp, natural-language sentence.
  // Falls back to string concatenation so onboarding never blocks on API failure.
  let startupSummary = [
    params.idea_description?.trim(),
    params.target_users?.trim() ? `for ${params.target_users.trim()}` : null,
    params.problem?.trim() ? `solving "${params.problem.trim().slice(0, 80)}"` : null,
  ].filter(Boolean).join(" ").slice(0, 280);

  try {
    if (params.idea_description) {
      const synthesized = await callModel([
        {
          role: "system",
          content: "Write one precise sentence (max 30 words) describing a startup for use in AI coaching prompts. Format: '[product] for [specific user type] that [solves specific problem]'. No preamble. Output only the sentence.",
        },
        {
          role: "user",
          content: `Idea: ${params.idea_description}\nTarget users: ${params.target_users ?? "not specified"}\nProblem: ${params.problem ?? "not specified"}\nStage: ${params.startup_stage ?? "Idea"}`,
        },
      ], { role: "fast", temperature: 0.3, maxTokens: 80 });
      if (synthesized && synthesized.length > 10) startupSummary = synthesized.slice(0, 280);
    }
  } catch {
    // Non-fatal — fallback string concatenation is already set above
  }

  // Map onboarding blocker → initial avoidance signal
  // This seeds the pattern system from day 1 so the first task is already informed
  const BLOCKER_TO_AVOIDANCE: Record<string, string> = {
    no_users_yet:        "user outreach",
    building_too_slow:   "shipping / committing to done",
    no_revenue:          "pricing conversations",
    too_many_ideas:      "committing to one direction",
    dont_know_what_to_do: "prioritisation",
    just_starting:       "",
  };
  const initialAvoidance = params.blocker_type
    ? [BLOCKER_TO_AVOIDANCE[params.blocker_type]].filter(Boolean)
    : [];

  await supabase.from("founder_context").upsert({
    user_id: user.id,
    startup_summary:   startupSummary,
    current_stage:     params.startup_stage ?? "Idea",
    momentum_score:    50,
    last_active:       new Date().toISOString().slice(0, 10),
    days_inactive:     0,
    avoidance_zones: initialAvoidance,
    topics_mentioned_repeatedly: [],
    consecutive_tasks_completed: 0,
    tasks_accepted_this_week:    0,
    tasks_overridden_this_week:  0,
    cognitive_load:              "fresh",
  }, { onConflict: "user_id" });

  // Seed founder_memory with onboarding data — used by the coach from message 1
  void supabase.from("founder_memory").upsert({
    user_id:          user.id,
    startup_summary:  startupSummary,
    avoidance_zones:  [],
    strengths:        [],
    personality_tags: [],
    insight_history:  [],
    cofounder_style:  "execution-coach",
    updated_at:       new Date().toISOString(),
  }, { onConflict: "user_id" });
  // ─────────────────────────────────────────────────────────────────────────

  trackEvent("project_created");
  return createdProject;
}


// ── Report/dashboard functions moved to lib/data/reports.ts ──────────────────
// Re-exported here for backwards compatibility with existing imports.
export { getDashboardOverview, getWeeklyReportMetrics, calculateDashboardStats } from "@/lib/data/reports";

// ── Revenue tracking ────────────────────────────────────────────────────────

/**
 * updateProjectMRR — saves the founder's manually entered MRR.
 * Called from the MRR widget on the overview or project page.
 * The value is fed into the reflexion loop so tasks are revenue-aware.
 */
export async function updateProjectMRR(
  projectId: string,
  mrrPesewas: number,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = createClient();
  await supabase
    .from("projects")
    .update({ current_mrr: mrrPesewas, mrr_updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id);
}

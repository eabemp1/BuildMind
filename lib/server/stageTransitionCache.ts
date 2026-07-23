import { createAdminClient } from "@/lib/supabase/admin";

const STAGE_ORDER = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

function nextStage(stage: string): string | null {
  const index = STAGE_ORDER.findIndex((item) => item.toLowerCase() === stage.toLowerCase());
  if (index < 0 || index >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[index + 1];
}

export async function checkAndCacheStageTransition(userId: string, projectId: string): Promise<void> {
  if (!userId || !projectId) return;
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("startup_stage")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return;

  const currentStage = project.startup_stage ?? "Idea";
  const recommendedStage = nextStage(currentStage);
  if (!recommendedStage) return;

  const [{ count: reflectionCount }, { count: completedCount }, { data: latestReflection }] = await Promise.all([
    supabase.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", userId),
    // FIX: previously .eq("project_id", projectId) directly on tasks — that
    // column does not exist on the tasks table (it only has milestone_id,
    // which links to milestones, which links to projects). That query
    // either errored or silently returned null, so completedCount always
    // read as 0 and shouldPrompt could NEVER become true — the level-up
    // recommendation prompt was effectively permanently dead, regardless
    // of how many tasks a founder actually completed.
    supabase
      .from("tasks")
      .select("id, milestones!inner(project_id)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_completed", true)
      .eq("milestones.project_id", projectId),
    supabase
      .from("reflections")
      .select("confidence, outcome")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const confidence = Number(latestReflection?.confidence ?? 0);
  const shouldPrompt = (completedCount ?? 0) >= 3 && (reflectionCount ?? 0) >= 2 && confidence >= 3;

  await supabase.from("founder_context").upsert({
    user_id: userId,
    pending_stage_transition: shouldPrompt
      ? {
          project_id: projectId,
          current_stage: currentStage,
          recommended_stage: recommendedStage,
          reason: `You have completed ${completedCount ?? 0} tasks, reflected ${reflectionCount ?? 0} times, and your latest confidence is ${confidence}/5.`,
          computed_at: new Date().toISOString(),
        }
      : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

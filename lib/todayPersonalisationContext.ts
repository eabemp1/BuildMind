import { createAdminClient } from "@/lib/supabase/admin";

export interface TodayPersonalisationContext {
  /** Last 7 actions shown (from reflexion_learning_log), formatted for prompt injection */
  recentActionsBlock: string;
  /** Last 5 reflections with rich fields, formatted for prompt injection */
  recentReflectionsBlock: string;
  /** Recurring blockers extracted from reflections.blocker column */
  recurringBlockers: string[];
  /** Active (incomplete) milestone titles, max 3 */
  activeGoals: string[];
}

export async function buildTodayPersonalisationContext(
  userId: string,
  projectId: string,
): Promise<TodayPersonalisationContext> {
  const empty: TodayPersonalisationContext = {
    recentActionsBlock: "",
    recentReflectionsBlock: "",
    recurringBlockers: [],
    activeGoals: [],
  };

  try {
    const supabase = createAdminClient();

    // CROSS-PROJECT CONTAMINATION FIX: these two queries previously filtered
    // only by user_id, with no project_id filter at all — despite both
    // reflexion_learning_log and reflections having a project_id column
    // (reflections: supabase/migrations/20260502000000_agentic_upgrades.sql).
    // A founder with more than one project (or a Break My Startup run on a
    // separate custom idea) had every other project's tasks and reflections
    // pulled into "today's" generation — confirmed in production data where
    // a BuildMind task referenced an unrelated project by name.
    // `.or(project_id.eq.X,project_id.is.null)` keeps legacy rows written
    // before the project_id column existed (which would otherwise vanish
    // from context for every project, permanently) while excluding rows
    // known to belong to a specific *other* project.
    const [actionsResult, reflectionsResult, milestonesResult] = await Promise.allSettled([
      supabase
        .from("reflexion_learning_log")
        .select("action_shown, stage, created_at, outcome")
        .eq("user_id", userId)
        .or(`project_id.eq.${projectId},project_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(7),

      supabase
        .from("reflections")
        .select("outcome, confidence, note, what_tried, what_happened, what_learned, blocker, created_at, today_action")
        .eq("user_id", userId)
        .or(`project_id.eq.${projectId},project_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("milestones")
        .select("title, status")
        .eq("project_id", projectId)
        .neq("status", "completed")
        .order("created_at", { ascending: true })
        .limit(3),
    ]);

    const actions =
      actionsResult.status === "fulfilled" ? (actionsResult.value.data ?? []) : [];
    const recentActionsBlock =
      actions.length === 0
        ? ""
        : [
            "RECENT TASKS SHOWN (do NOT repeat any of these - no semantic equivalents):",
            ...actions.map((a, i) => {
              const date = new Date(a.created_at).toLocaleDateString();
              const outcomeTag = a.outcome && a.outcome !== "pending" ? ` [${a.outcome}]` : "";
              return `${i + 1}. ${date}: "${a.action_shown}"${outcomeTag}`;
            }),
            "-> A task is a repeat if it involves the same verb+object as any item above (e.g. 'post on LinkedIn' after 'share on LinkedIn' is a repeat). Generate something categorically different.",
          ].join("\n");

    const reflections =
      reflectionsResult.status === "fulfilled" ? (reflectionsResult.value.data ?? []) : [];

    const recurringBlockers: string[] = reflections
      .map((r) => r.blocker)
      .filter((b): b is string => Boolean(b?.trim()));

    const recentReflectionsBlock =
      reflections.length === 0
        ? ""
        : [
            "FOUNDER'S RECENT REFLECTION HISTORY (use this to make today's task a direct continuation):",
            ...reflections.map((r, i) => {
              const date = new Date(r.created_at).toLocaleDateString();
              const lines = [`[${i + 1}] ${date} - Outcome: ${r.outcome ?? "?"}, Confidence: ${r.confidence ?? "?"}/5`];
              if (r.today_action) lines.push(`  Task attempted: "${r.today_action}"`);
              if (r.what_tried) lines.push(`  What they tried: "${r.what_tried}"`);
              if (r.what_happened) lines.push(`  What happened: "${r.what_happened}"`);
              if (r.what_learned) lines.push(`  What they learned: "${r.what_learned}"`);
              if (r.blocker) lines.push(`  Blocker: "${r.blocker}"`);
              if (r.note && !r.what_tried) lines.push(`  Note: "${r.note}"`);
              return lines.join("\n");
            }),
            // FIX: this block used to end here, with no enforced instruction —
            // just the raw reflection text and a soft "use this" framing.
            // Confirmed in production: a founder explicitly wrote in
            // "What they learned" that they wanted to commit to one
            // distribution channel for a week before switching, and the
            // next several tasks scattered across five different channels
            // anyway. The content was present in the prompt; nothing told
            // the model it was binding. Mirror the same imperative pattern
            // used for recurringBlockers below.
            "-> If \"What they learned\" states a specific strategy, channel, or focus decision (e.g. \"stick to LinkedIn until I hit 10 signups before trying Reddit\"), today's task MUST follow that decision — do not switch channel, platform, or approach unless the founder's own reflection says they're done with it or it failed.",
          ].join("\n");

    const milestones =
      milestonesResult.status === "fulfilled" ? (milestonesResult.value.data ?? []) : [];
    const activeGoals = milestones.map((m) => m.title);

    return {
      recentActionsBlock,
      recentReflectionsBlock,
      recurringBlockers,
      activeGoals,
    };
  } catch {
    return empty;
  }
}

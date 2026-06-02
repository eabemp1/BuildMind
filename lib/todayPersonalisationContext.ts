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

    const [actionsResult, reflectionsResult, milestonesResult] = await Promise.allSettled([
      supabase
        .from("reflexion_learning_log")
        .select("action_shown, stage, created_at, outcome")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(7),

      supabase
        .from("reflections")
        .select("outcome, confidence, note, what_tried, what_happened, what_learned, blocker, created_at, today_action")
        .eq("user_id", userId)
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

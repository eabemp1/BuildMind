import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityEvent =
  | "task_accepted"
  | "task_completed"
  | "task_overridden"
  | "reflection_done"
  | "login"
  | "stage_advanced";

export async function recordActivity(
  userId: string,
  eventType: ActivityEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return;
  try {
    const supabase = createAdminClient();
    await supabase.from("activity_log").insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    });
  } catch (err) {
    console.error("[activityLog] non-fatal insert failure:", err);
  }
}

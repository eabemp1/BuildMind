/**
 * The first task saved by onboarding (user metadata `first_task`). Read only on a founder's first run.
 * Any failure returns null, and the hand-written bank is used instead.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";

export async function loadSavedStrike(userId: string): Promise<unknown> {
  try {
    if (!userId || !hasAdminEnv()) return null;
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    return (data?.user?.user_metadata as Record<string, unknown> | undefined)?.first_task ?? null;
  } catch { return null; }
}

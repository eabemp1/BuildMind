import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { cleanVoice } from "@/lib/work/voice";

/** The saved writing sample, or "" on any failure. Drafts then just use the default voice. */
export async function loadVoice(userId: string): Promise<string> {
  try {
    if (!userId || !hasAdminEnv()) return "";
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    return cleanVoice((data?.user?.user_metadata as Record<string, unknown> | undefined)?.writing_sample);
  } catch { return ""; }
}

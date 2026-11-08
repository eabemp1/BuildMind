import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { cleanVoice, founderFirstName } from "@/lib/work/voice";

/** The saved writing sample, or "" on any failure. Drafts then just use the default voice. */
export async function loadVoice(userId: string): Promise<string> {
  try {
    if (!userId || !hasAdminEnv()) return "";
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    return cleanVoice((data?.user?.user_metadata as Record<string, unknown> | undefined)?.writing_sample);
  } catch { return ""; }
}

/** The founder's first name from onboarding (user metadata `full_name`), or "". */
export async function loadFounderName(userId: string): Promise<string> {
  try {
    if (!userId || !hasAdminEnv()) return "";
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    const full = String((data?.user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "");
    return founderFirstName(full);
  } catch { return ""; }
}

import { createAdminClient } from "@/lib/supabase/admin";

function envAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (envAdminIds().includes(userId)) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  return data?.is_admin === true;
}

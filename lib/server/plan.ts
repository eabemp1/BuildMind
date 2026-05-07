import { planFromUserMetadata, type Plan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";

type UserLike = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

export function hasAdminPlanLookupEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getFreshAuthUser<T extends UserLike>(user: T): Promise<T> {
  if (!user?.id || !hasAdminPlanLookupEnv()) return user;

  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(user.id);
    return (data.user as T) ?? user;
  } catch {
    return user;
  }
}

export async function getFreshPlanForUser(user: UserLike): Promise<Plan> {
  const freshUser = await getFreshAuthUser(user);
  return planFromUserMetadata(freshUser);
}

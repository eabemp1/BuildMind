import { createAdminClient } from "@/lib/supabase/admin";

export type PublicStats = {
  founders: number;
  projects: number;
  milestones: number;
  weekly_tasks: number;
};

export const PUBLIC_STATS_FALLBACK: PublicStats = {
  founders: 0,
  projects: 0,
  milestones: 0,
  weekly_tasks: 0,
};

async function safeCount(supabase: ReturnType<typeof createAdminClient>, table: string): Promise<number> {
  try {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

async function safeAuthCount(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const PAGE_SIZE = 1000;
    let page = 1;
    let total = 0;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error || !data) break;
      total += data.users.length;
      if (data.users.length < PAGE_SIZE) break;
      page++;
    }

    return total;
  } catch {
    return 0;
  }
}

async function safeProjectOwners(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const { data, error } = await supabase.from("projects").select("user_id").not("user_id", "is", null);
    return (error || !data) ? 0 : new Set(data.map((r) => r.user_id).filter(Boolean)).size;
  } catch {
    return 0;
  }
}

async function safeWeeklyTasks(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("action_logs")
      .select("*", { count: "exact", head: true })
      .eq("outcome", "completed")
      .gte("created_at", sevenDaysAgo);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return PUBLIC_STATS_FALLBACK;
  }

  const supabase = createAdminClient();
  const [profiles, users, authUsers, projectOwners, projects, milestones, weekly_tasks] = await Promise.all([
    safeCount(supabase, "profiles"),
    safeCount(supabase, "users"),
    safeAuthCount(supabase),
    safeProjectOwners(supabase),
    safeCount(supabase, "projects"),
    safeCount(supabase, "milestones"),
    safeWeeklyTasks(supabase),
  ]);

  return {
    founders: Math.max(profiles, users, authUsers, projectOwners),
    projects,
    milestones,
    weekly_tasks,
  };
}

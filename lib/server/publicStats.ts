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

/** Founders who marked their account as a test run (Settings). Left out of the public counts. */
async function safeTestUserIds(supabase: ReturnType<typeof createAdminClient>): Promise<string[]> {
  try {
    const { data, error } = await supabase.from("user_behavior_state").select("user_id").eq("key", "test_mode").eq("value->>on", "true");
    return error || !data ? [] : data.map((r) => String(r.user_id));
  } catch {
    return [];
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

// The homepage renders on every visit, and these counts walk every user and project. Keep one copy
// per server instance for a few minutes so a traffic spike does not turn into a database spike.
const STATS_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: PublicStats } | null = null;
let inflight: Promise<PublicStats> | null = null;

export async function getPublicStats(): Promise<PublicStats> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return PUBLIC_STATS_FALLBACK;
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.value;
  inflight ??= computePublicStats()
    .then((value) => { cached = { at: Date.now(), value }; return value; })
    .finally(() => { inflight = null; });
  return inflight;
}

async function computePublicStats(): Promise<PublicStats> {

  const supabase = createAdminClient();
  const [profiles, users, authUsers, projectOwners, projects, milestones, weekly_tasks, testIds] = await Promise.all([
    safeCount(supabase, "profiles"),
    safeCount(supabase, "users"),
    safeAuthCount(supabase),
    safeProjectOwners(supabase),
    safeCount(supabase, "projects"),
    safeCount(supabase, "milestones"),
    safeWeeklyTasks(supabase),
    safeTestUserIds(supabase),
  ]);
  const testProjects = testIds.length
    ? await supabase.from("projects").select("id", { count: "exact", head: true }).in("user_id", testIds).then((r) => r.count ?? 0, () => 0)
    : 0;

  return {
    founders: Math.max(0, Math.max(profiles, users, authUsers, projectOwners) - testIds.length),
    projects: Math.max(0, projects - testProjects),
    milestones,
    weekly_tasks,
  };
}

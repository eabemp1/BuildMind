import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const revalidate = 60;

async function safeCount(supabase: ReturnType<typeof createAdminClient>, table: string): Promise<number> {
  try {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    return error ? 0 : (count ?? 0);
  } catch { return 0; }
}

async function safeAuthCount(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    // Supabase's admin.listUsers caps perPage at 1000 and silently truncates.
    // Paginate until we get a page shorter than perPage to get the real total.
    const PAGE_SIZE = 1000;
    let page = 1;
    let total = 0;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error || !data) break;
      total += data.users.length;
      // If we got a full page there may be more — keep going.
      // If we got fewer than PAGE_SIZE we've reached the end.
      if (data.users.length < PAGE_SIZE) break;
      page++;
    }
    return total;
  } catch { return 0; }
}

async function safeProjectOwners(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const { data, error } = await supabase.from("projects").select("user_id").not("user_id", "is", null);
    return (error || !data) ? 0 : new Set(data.map((r) => r.user_id).filter(Boolean)).size;
  } catch { return 0; }
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
  } catch { return 0; }
}

export async function GET() {
  const headers = {
    // ISR: serve stale for 60s, revalidate in background — instant for users
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    "Access-Control-Allow-Origin": "*",
  };
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ founders: 0, projects: 0, milestones: 0, weekly_tasks: 0 }, { headers });
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
    const founders = Math.max(profiles, users, authUsers, projectOwners);
    return NextResponse.json({ founders, projects, milestones, weekly_tasks }, { headers });
  } catch {
    return NextResponse.json({ founders: 0, projects: 0, milestones: 0, weekly_tasks: 0 }, { headers });
  }
}

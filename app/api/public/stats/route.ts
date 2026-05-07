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
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return error ? 0 : data.users.length;
  } catch { return 0; }
}

async function safeProjectOwners(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const { data, error } = await supabase.from("projects").select("user_id").not("user_id", "is", null);
    return (error || !data) ? 0 : new Set(data.map((r) => r.user_id).filter(Boolean)).size;
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
      return NextResponse.json({ founders: 0, projects: 0, milestones: 0 }, { headers });
    }
    const supabase = createAdminClient();
    const [profiles, users, authUsers, projectOwners, projects, milestones] = await Promise.all([
      safeCount(supabase, "profiles"),
      safeCount(supabase, "users"),
      safeAuthCount(supabase),
      safeProjectOwners(supabase),
      safeCount(supabase, "projects"),
      safeCount(supabase, "milestones"),
    ]);
    const founders = Math.max(profiles, users, authUsers, projectOwners);
    return NextResponse.json({ founders, projects, milestones }, { headers });
  } catch {
    return NextResponse.json({ founders: 0, projects: 0, milestones: 0 }, { headers });
  }
}

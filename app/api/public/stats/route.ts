import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const revalidate = 300; // cache for 5 minutes

async function countTable(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return 0;
  return count ?? 0;
}

async function countProjectOwners(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data, error } = await supabase
    .from("projects")
    .select("user_id")
    .not("user_id", "is", null);

  if (error || !data) return 0;
  return new Set(data.map((row) => row.user_id).filter(Boolean)).size;
}

async function countAuthUsers(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return 0;
  return data.users.length;
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [profiles, users, authUsers, projectOwners, projects, milestones] = await Promise.all([
      countTable(supabase, "profiles"),
      countTable(supabase, "users"),
      countAuthUsers(supabase),
      countProjectOwners(supabase),
      countTable(supabase, "projects"),
      countTable(supabase, "milestones"),
    ]);

    return NextResponse.json(
      { founders: Math.max(profiles, users, authUsers, projectOwners), projects, milestones },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
    );
  } catch (err) {
    console.error("[public/stats] error:", err);
    return NextResponse.json(
      { founders: 1, projects: 1, milestones: 1 },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  }
}

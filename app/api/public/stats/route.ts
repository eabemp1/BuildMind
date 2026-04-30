import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const [{ count: founders }, { count: projects }, { count: milestones }] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("projects").select("*", { count: "exact", head: true }),
      supabase.from("milestones").select("*", { count: "exact", head: true }),
    ]);

    return NextResponse.json(
      { founders, projects, milestones },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { founders: 0, projects: 0, milestones: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

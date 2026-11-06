/** GET /api/today/slot?projectId=… - the facts behind Today's single slot and status line. Read-only. */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTodaySlot } from "@/lib/server/todaySlot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const projectId = (new URL(request.url).searchParams.get("projectId") ?? "").trim();
  if (!projectId) return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", u.userId).maybeSingle();
  if (!data) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  const out = await loadTodaySlot(admin, u.userId, projectId, u.plan);
  return NextResponse.json({ success: true, ...out }, { headers: { "Cache-Control": "private, max-age=60" } });
}

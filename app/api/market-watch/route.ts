/**
 * POST /api/market-watch  { projectId } - scan now (Builder only). The weekly cron does the same.
 * GET  /api/market-watch?projectId=… - the latest saved scan. No network calls.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLatestWatch, runMarketWatch } from "@/lib/server/marketWatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownedProject(admin: ReturnType<typeof createAdminClient>, userId: string, projectId: string) {
  const { data } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!UUID.test(projectId)) return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  const admin = createAdminClient();
  if (!(await ownedProject(admin, u.userId, projectId))) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  return NextResponse.json({ success: true, watch: await loadLatestWatch(admin, u.userId, projectId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (u.plan !== "builder") return NextResponse.json({ success: false, error: "Market Watch is part of the Builder plan.", status: 403 }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { projectId?: unknown };
  const projectId = typeof body.projectId === "string" && UUID.test(body.projectId) ? body.projectId : "";
  if (!projectId) return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  const admin = createAdminClient();
  if (!(await ownedProject(admin, u.userId, projectId))) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  const out = await runMarketWatch(admin, { userId: u.userId, projectId });
  if (!out.ok) return NextResponse.json({ success: false, error: out.message, reason: out.reason }, { status: out.reason === "no_competitors" ? 422 : 500 });
  return NextResponse.json({ success: true, ...out });
}

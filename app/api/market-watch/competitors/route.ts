/**
 * GET    /api/market-watch/competitors?projectId=…        - the competitors you added.
 * POST   /api/market-watch/competitors { projectId, url, name? } - add one (Builder only, five at most).
 * DELETE /api/market-watch/competitors?projectId=…&id=…   - remove one.
 * Only a company's own homepage is accepted: articles, news, reviews and social pages are refused.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_COMPETITORS, cleanCompetitorUrl, nameFromHost } from "@/lib/marketWatch/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const H = { "Cache-Control": "private, no-store" };
type Admin = ReturnType<typeof createAdminClient>;

async function owned(admin: Admin, userId: string, projectId: string) {
  const { data } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
async function list(admin: Admin, userId: string, projectId: string) {
  const { data, error } = await admin.from("market_watch_competitors").select("id, name, url").eq("user_id", userId).eq("project_id", projectId).order("created_at", { ascending: true }).limit(MAX_COMPETITORS);
  return { rows: (data ?? []) as Array<{ id: string; name: string; url: string }>, error };
}

export async function GET(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!UUID.test(projectId)) return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  const admin = createAdminClient();
  if (!(await owned(admin, u.userId, projectId))) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  const { rows, error } = await list(admin, u.userId, projectId);
  if (error) return NextResponse.json({ success: false, error: "Could not read your competitors." }, { status: 503 });
  return NextResponse.json({ success: true, competitors: rows, max: MAX_COMPETITORS }, { headers: H });
}

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (u.plan !== "builder") return NextResponse.json({ success: false, error: "Market Watch is part of the Builder plan." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { projectId?: unknown; url?: unknown; name?: unknown };
  const projectId = typeof body.projectId === "string" && UUID.test(body.projectId) ? body.projectId : "";
  if (!projectId) return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  const cleaned = cleanCompetitorUrl(typeof body.url === "string" ? body.url : "");
  if (!cleaned.ok) return NextResponse.json({ success: false, error: cleaned.message }, { status: 422 });
  const name = (typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : "") || nameFromHost(cleaned.host);
  const admin = createAdminClient();
  if (!(await owned(admin, u.userId, projectId))) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  const before = await list(admin, u.userId, projectId);
  if (before.error) return NextResponse.json({ success: false, error: "Could not read your competitors." }, { status: 503 });
  if (before.rows.length >= MAX_COMPETITORS) return NextResponse.json({ success: false, error: `You can watch up to ${MAX_COMPETITORS} competitors. Remove one first.` }, { status: 422 });
  if (before.rows.some((r) => r.url === cleaned.url)) return NextResponse.json({ success: false, error: "You already watch that site." }, { status: 409 });
  const { error } = await admin.from("market_watch_competitors").insert({ user_id: u.userId, project_id: projectId, name, url: cleaned.url, host: cleaned.host });
  if (error) {
    const missing = /relation .* does not exist|market_watch_competitors/i.test(error.message ?? "") && /does not exist/i.test(error.message ?? "");
    return NextResponse.json({ success: false, error: missing ? "Market Watch needs a database update first (market_watch_competitors)." : "Could not save that competitor." }, { status: 503 });
  }
  const after = await list(admin, u.userId, projectId);
  return NextResponse.json({ success: true, competitors: after.rows, max: MAX_COMPETITORS }, { headers: H });
}

export async function DELETE(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const projectId = sp.get("projectId") ?? "", id = sp.get("id") ?? "";
  if (!UUID.test(projectId) || !UUID.test(id)) return NextResponse.json({ success: false, error: "projectId and id required" }, { status: 400 });
  const admin = createAdminClient();
  if (!(await owned(admin, u.userId, projectId))) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  const { error } = await admin.from("market_watch_competitors").delete().eq("id", id).eq("user_id", u.userId).eq("project_id", projectId);
  if (error) return NextResponse.json({ success: false, error: "Could not remove that competitor." }, { status: 503 });
  const after = await list(admin, u.userId, projectId);
  return NextResponse.json({ success: true, competitors: after.rows, max: MAX_COMPETITORS }, { headers: H });
}

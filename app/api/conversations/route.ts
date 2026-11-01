/**
 * /api/conversations — the founder's list of people they want to talk to.
 *   GET           people, summary and next step
 *   POST {name, whereFound?, link?, projectId?}
 *   PATCH {id, status?, message?, notes?}   status changes stamp contacted_at the first time it becomes "sent"
 *   DELETE ?id=
 * Founder-entered only. Scoped to the signed-in user.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStatus, nextAction, sanitizeLine, summarize, type Person } from "@/lib/conversations/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const COLS = "id, name, where_found, link, status, contacted_at, message, notes, insights, updated_at";

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, setup: true, people: [], summary: summarize([], new Date()), next: nextAction(summarize([], new Date())) });
  const { data, error } = await createAdminClient().from("conversation_people").select(COLS).eq("user_id", user.userId).order("updated_at", { ascending: false }).limit(200);
  const people = error ? [] : (data ?? []);
  const summary = summarize(people as Person[], new Date());
  return NextResponse.json({ ok: true, setup: Boolean(error), people, summary, next: nextAction(summary) });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { name?: unknown; whereFound?: unknown; link?: unknown; projectId?: unknown };
  const name = sanitizeLine(b.name, 80);
  if (!name) return NextResponse.json({ ok: false, error: "Add a name or a handle." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Saving is unavailable right now." }, { status: 503 });
  const projectId = typeof b.projectId === "string" && UUID.test(b.projectId) ? b.projectId : null;
  const admin = createAdminClient();
  if (projectId) {
    const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("user_id", user.userId).maybeSingle();
    if (!project) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  const { data, error } = await admin.from("conversation_people")
    .insert({ user_id: user.userId, project_id: projectId, name, where_found: sanitizeLine(b.whereFound, 160) || null, link: sanitizeLine(b.link, 300) || null })
    .select(COLS).single();
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not save. The tracker may not be set up yet." }, { status: 500 });
  return NextResponse.json({ ok: true, person: data });
}

export async function PATCH(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown; message?: unknown; notes?: unknown };
  if (typeof b.id !== "string" || !UUID.test(b.id)) return NextResponse.json({ ok: false }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false }, { status: 503 });
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (!isStatus(b.status)) return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
    patch.status = b.status;
    if (b.status === "sent") {
      const { data: cur } = await admin.from("conversation_people").select("contacted_at").eq("id", b.id).eq("user_id", user.userId).maybeSingle();
      if (!(cur as { contacted_at: string | null } | null)?.contacted_at) patch.contacted_at = new Date().toISOString();
    }
  }
  if (b.message !== undefined) patch.message = sanitizeLine(b.message, 4000) || null;
  if (b.notes !== undefined) patch.notes = sanitizeLine(b.notes, 8000) || null;
  const { data, error } = await admin.from("conversation_people").update(patch).eq("id", b.id).eq("user_id", user.userId).select(COLS).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, person: data });
}

export async function DELETE(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id) || !hasAdminEnv()) return NextResponse.json({ ok: false }, { status: 400 });
  await createAdminClient().from("conversation_people").delete().eq("id", id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true });
}

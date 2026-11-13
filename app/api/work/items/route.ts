/**
 * /api/work/items — the founder's Work library.
 *   GET            list (newest first) and the project defaults used to pre-fill forms
 *   GET ?id=       one full item
 *   PATCH {id, edits?, status?, note?}   save edits, mark used or sent
 *   DELETE ?id=    remove one
 * Every query is scoped to the signed-in founder.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProject } from "@/lib/prep/engine";
import { sanitizeText } from "@/lib/work/shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["draft", "used", "sent"];

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, items: [], project: null, setup: true });
  const admin = createAdminClient();
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
    const { data } = await admin.from("work_items").select("*").eq("id", id).eq("user_id", user.userId).maybeSingle();
    return data ? NextResponse.json({ ok: true, item: data }) : NextResponse.json({ ok: false }, { status: 404 });
  }
  const [{ data, error }, project] = await Promise.all([
    admin.from("work_items").select("id, kind, title, status, updated_at").eq("user_id", user.userId).order("updated_at", { ascending: false }).limit(60),
    loadProject(admin, user.userId, null),
  ]);
  return NextResponse.json({ ok: true, setup: Boolean(error), items: error ? [] : data ?? [], project: { name: project.name, targetUsers: project.targetUsers, problem: project.problem, description: project.description, stage: project.stage } });
}

export async function PATCH(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; edits?: unknown; status?: string; note?: unknown };
  if (!body.id || !UUID.test(body.id)) return NextResponse.json({ ok: false }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.edits && typeof body.edits === "object") {
    const edits: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.edits as Record<string, unknown>).slice(0, 8)) {
      if (/^v\d$/.test(k) && typeof v === "string") edits[k] = v.slice(0, 8000);
    }
    patch.edits = edits;
  }
  if (body.status) { if (!STATUSES.includes(body.status)) return NextResponse.json({ ok: false }, { status: 400 }); patch.status = body.status; }
  if (body.note !== undefined) patch.note = sanitizeText(body.note, 500) || null;
  const admin = createAdminClient();
  const { error } = await admin.from("work_items").update(patch).eq("id", body.id).eq("user_id", user.userId);
  return NextResponse.json({ ok: !error });
}

export async function DELETE(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const { error } = await createAdminClient().from("work_items").delete().eq("id", id).eq("user_id", user.userId);
  return NextResponse.json({ ok: !error });
}

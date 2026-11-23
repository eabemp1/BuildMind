/**
 * /api/work/landing-draft: the founder's saved, unpublished landing page design for one Work draft.
 *   GET ?key=            -> { ok, draft: { headline, pitch, design } | null }
 *   PUT { key, projectId?, headline, pitch, design } -> { ok }   (the design is cleaned here, never trusted)
 * Scoped to the signed-in founder. Saving publishes nothing.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanDesign } from "@/lib/landing/design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const key = (v: unknown) => (typeof v === "string" && v.trim().length >= 1 && v.length <= 200 ? v.trim() : null);

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const k = key(new URL(request.url).searchParams.get("key"));
  if (!k || !hasAdminEnv()) return NextResponse.json({ ok: true, draft: null });
  const { data, error } = await createAdminClient().from("landing_drafts").select("content").eq("user_id", user.userId).eq("item_key", k).maybeSingle();
  if (error) return NextResponse.json({ ok: true, draft: null, setup: true });
  return NextResponse.json({ ok: true, draft: (data as { content?: unknown } | null)?.content ?? null });
}

export async function PUT(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; projectId?: unknown; headline?: unknown; pitch?: unknown; design?: unknown };
  const k = key(b.key);
  if (!k) return NextResponse.json({ ok: false, error: "Nothing to save this under." }, { status: 400 });
  const design = cleanDesign(b.design);
  if (!design) return NextResponse.json({ ok: false, error: "Remove wording about logins, passwords, card numbers or verification." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Saving is unavailable right now." }, { status: 503 });
  const content = { headline: typeof b.headline === "string" ? b.headline.slice(0, 120) : "", pitch: typeof b.pitch === "string" ? b.pitch.slice(0, 300) : "", design };
  let projectId = typeof b.projectId === "string" && UUID.test(b.projectId) ? b.projectId : null;
  // A draft of a Library item belongs to that item's own project, whichever project is open now.
  const m = /^work:([0-9a-f-]{36})$/i.exec(k);
  if (m) {
    const { data: it } = await createAdminClient().from("work_items").select("project_id").eq("id", m[1]).eq("user_id", user.userId).maybeSingle();
    if (!it) return NextResponse.json({ ok: false, error: "That item is not in your library." }, { status: 404 });
    projectId = (it as { project_id?: string | null }).project_id ?? projectId;
  }
  const { error } = await createAdminClient().from("landing_drafts").upsert({ user_id: user.userId, item_key: k, project_id: projectId, content, updated_at: new Date().toISOString() }, { onConflict: "user_id,item_key" });
  if (error) return NextResponse.json({ ok: false, error: /landing_drafts/.test(error.message) ? "The landing_drafts table is not set up yet. Apply the latest database migration." : "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

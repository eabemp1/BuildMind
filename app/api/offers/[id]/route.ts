/**
 * PATCH /api/offers/[id] — edit the text, set the contact, publish or unpublish. DELETE removes it.
 * Publishing only happens when the founder asks for it and publishProblems() is empty.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanEdit, publishProblems, type OfferContent } from "@/lib/offers/page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const COLS = "id, project_id, person_id, slug, status, content, views, clicks, published_at, updated_at";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Unavailable right now." }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { content?: unknown; action?: unknown };
  const admin = createAdminClient();
  const { data } = await admin.from("offer_pages").select(COLS).eq("id", id).eq("user_id", user.userId).maybeSingle();
  const page = data as { content: OfferContent; status: string } | null;
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  let content = page.content;
  if (b.content && typeof b.content === "object") content = cleanEdit(b.content, content);
  const patch: Record<string, unknown> = { content, updated_at: new Date().toISOString() };
  if (b.action === "publish") {
    const problems = publishProblems(content);
    if (problems.length) return NextResponse.json({ ok: false, error: problems.join(" "), problems }, { status: 422 });
    patch.status = "published"; patch.published_at = new Date().toISOString();
  } else if (b.action === "unpublish") {
    patch.status = "draft";
  } else if (page.status === "published") {
    // Editing a live page must keep it valid.
    const problems = publishProblems(content);
    if (problems.length) return NextResponse.json({ ok: false, error: problems.join(" "), problems }, { status: 422 });
  }
  const { data: saved, error } = await admin.from("offer_pages").update(patch).eq("id", id).eq("user_id", user.userId).select(COLS).single();
  if (error) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true, page: saved });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id) || !hasAdminEnv()) return NextResponse.json({ ok: false }, { status: 400 });
  await createAdminClient().from("offer_pages").delete().eq("id", id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true });
}

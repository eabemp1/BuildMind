/**
 * POST /api/conversations/approve — the founder approves (or withdraws) one quote from a conversation for use on an offer page.
 * Body: { id, index, approved }. The quote must still be word for word in the notes.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteInNotes } from "@/lib/offers/page";
import type { Insight } from "@/lib/conversations/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; index?: unknown; approved?: unknown };
  if (typeof b.id !== "string" || !UUID.test(b.id) || !Number.isInteger(b.index) || typeof b.approved !== "boolean") return NextResponse.json({ ok: false }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Unavailable right now." }, { status: 503 });
  const admin = createAdminClient();
  const { data } = await admin.from("conversation_people").select("notes, insights").eq("id", b.id).eq("user_id", user.userId).maybeSingle();
  const row = data as { notes: string | null; insights: Insight[] | null } | null;
  const list = Array.isArray(row?.insights) ? row!.insights! : null;
  const i = b.index as number;
  if (!row || !list || !list[i]) return NextResponse.json({ ok: false }, { status: 404 });
  if (b.approved && !quoteInNotes(list[i].quote, row.notes ?? "")) return NextResponse.json({ ok: false, error: "That quote is no longer in your notes." }, { status: 409 });
  const next = list.map((x, k) => (k === i ? { ...x, approved: b.approved as boolean } : x));
  const { error } = await admin.from("conversation_people").update({ insights: next, updated_at: new Date().toISOString() }).eq("id", b.id).eq("user_id", user.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true, insights: next });
}

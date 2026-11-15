/**
 * POST /api/reflections/undo { id }
 * Removes a reflection the founder just saved by mistake, so every part of BuildMind that reads reflections
 * stops counting it. Allowed for 30 minutes after saving. Reopens the linked task and clears today's "reflected"
 * mark so they can write it again.
 * Not reversed: the streak count, the learning log and the anonymous activity feed event.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { withinUndoWindow } from "@/lib/reflectionUndo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : "";
  if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("reflections").select("id, task_id, outcome, created_at").eq("id", id).eq("user_id", u.userId).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: "Could not read that reflection." }, { status: 503 });
  if (!row) return NextResponse.json({ success: false, error: "Reflection not found." }, { status: 404 });
  if (!withinUndoWindow(String(row.created_at))) return NextResponse.json({ success: false, error: "It can only be undone within 30 minutes of saving." }, { status: 422 });
  const del = await admin.from("reflections").delete().eq("id", id).eq("user_id", u.userId);
  if (del.error) return NextResponse.json({ success: false, error: "Could not undo that." }, { status: 503 });
  if (row.task_id && (row.outcome === "completed" || row.outcome === "blocked")) {
    await admin.from("tasks").update({ status: "pending", is_completed: false, completed_at: null }).eq("id", row.task_id).eq("user_id", u.userId);
  }
  await admin.from("user_behavior_state").update({ value: null, updated_at: new Date().toISOString() }).eq("user_id", u.userId).eq("key", "reflect_done_date");
  return NextResponse.json({ success: true, reopenedTask: Boolean(row.task_id) });
}

/**
 * POST /api/work/generate — prepare one piece of work from the Work catalogue.
 * Body: { kind, inputs, projectId?, regenerateId? }. Returns the saved item. Nothing is sent or posted.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWork } from "@/lib/work/engine";
import { SPEC_BY_ID } from "@/lib/work/registry";
import { cleanInputs } from "@/lib/work/shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string; inputs?: unknown; projectId?: string | null; regenerateId?: string | null };
  const spec = body.kind ? SPEC_BY_ID[body.kind] : undefined;
  if (!spec) return NextResponse.json({ ok: false, error: "Unknown kind of work." }, { status: 400 });
  const { values, error } = cleanInputs(spec, body.inputs);
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Preparing work is unavailable right now." }, { status: 503 });

  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;

  const admin = createAdminClient();
  const projectId = body.projectId && UUID.test(body.projectId) ? body.projectId : null;
  const result = await generateWork(admin, user.userId, { spec, values, projectId });
  if (!result) return NextResponse.json({ ok: false, error: "BuildMind could not prepare this just now. Nothing was used up on your side. Please try again." }, { status: 502 });

  const row = { user_id: user.userId, project_id: projectId, kind: spec.id, title: result.title, inputs: values, payload: result, edits: {}, status: "draft", note: null, updated_at: new Date().toISOString() };
  try {
    if (body.regenerateId && UUID.test(body.regenerateId)) {
      const { data, error: upErr } = await admin.from("work_items").update({ title: row.title, payload: row.payload, edits: {}, status: "draft", updated_at: row.updated_at })
        .eq("id", body.regenerateId).eq("user_id", user.userId).select("id").maybeSingle();
      if (!upErr && data) return NextResponse.json({ ok: true, item: { id: (data as { id: string }).id, ...row } });
    }
    const { data, error: insErr } = await admin.from("work_items").insert(row).select("id").single();
    if (insErr || !data) return NextResponse.json({ ok: true, saved: false, item: { id: null, ...row } });
    return NextResponse.json({ ok: true, saved: true, item: { id: (data as { id: string }).id, ...row } });
  } catch {
    return NextResponse.json({ ok: true, saved: false, item: { id: null, ...row } });
  }
}

/**
 * GET  /api/work/voice → { sample }  the founder's writing sample ("" when none)
 * POST /api/work/voice { sample }    save it, or clear it with an empty string
 * Stored in the account's user metadata, so no table is needed.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanVoice, VOICE_MIN } from "@/lib/work/voice";
import { loadVoice } from "@/lib/server/voice";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, sample: await loadVoice(user.userId) });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Saving is unavailable right now." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { sample?: unknown };
  const sample = cleanVoice(body.sample);
  if (sample && sample.length < VOICE_MIN) return NextResponse.json({ ok: false, error: "Paste a little more, one or two real messages you wrote." }, { status: 400 });
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(user.userId);
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const { error } = await admin.auth.admin.updateUserById(user.userId, { user_metadata: { ...meta, writing_sample: sample || null } });
    if (error) throw error;
    return NextResponse.json({ ok: true, sample });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save this. Please try again." }, { status: 500 });
  }
}

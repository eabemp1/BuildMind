/**
 * POST /api/conversations/insights — turn the founder's rough notes from one conversation into short points.
 * Every point must quote the founder's own notes; points whose quote is not in the notes are dropped.
 * Body: { id, notes }. Saves notes and the verified points on the person.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeLine, verifyInsights } from "@/lib/conversations/track";
import { getEffectivePlan } from "@/lib/server/plan";
import { insightAccess } from "@/lib/work/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; notes?: unknown };
  const notes = sanitizeLine(b.notes, 8000);
  if (typeof b.id !== "string" || !UUID.test(b.id)) return NextResponse.json({ ok: false }, { status: 400 });
  if (notes.length < 30) return NextResponse.json({ ok: false, error: "Write a few lines about what they said first." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Unavailable right now." }, { status: 503 });
  const admin = createAdminClient();
  const { data: owns } = await admin.from("conversation_people").select("id, insights").eq("id", b.id).eq("user_id", user.userId).maybeSingle();
  if (!owns) return NextResponse.json({ ok: false }, { status: 404 });

  // Re-reading a conversation already read does not use up a free reading.
  const plan = await getEffectivePlan(user.userId);
  if (plan !== "builder" && (owns as { insights: unknown }).insights === null) {
    const { count, error: countError } = await admin.from("conversation_people").select("id", { count: "exact", head: true }).eq("user_id", user.userId).not("insights", "is", null);
    if (countError) {
      await admin.from("conversation_people").update({ notes, updated_at: new Date().toISOString() }).eq("id", b.id).eq("user_id", user.userId);
      return NextResponse.json({ ok: false, error: "Could not check your free insight allowance. Your notes were saved; please try again." }, { status: 503 });
    }
    const access = insightAccess(plan, count ?? 0);
    if (!access.allowed) {
      // The notes are still saved, so nothing the founder wrote is lost.
      await admin.from("conversation_people").update({ notes, updated_at: new Date().toISOString() }).eq("id", b.id).eq("user_id", user.userId);
      return NextResponse.json({ ok: false, error: access.message, upgradeUrl: "/upgrade" }, { status: 402 });
    }
  }
  const blocked = await gateAIUsage(user.userId, "core");
  if (blocked) return blocked;

  const prompt = `A founder wrote rough notes after a customer conversation. Pull out up to 5 things the PERSON said or did that matter for the founder's idea: their problem, what they do today, what they tried, what they would pay for or refuse.
RULES
- Each point must be backed by an exact quote copied word for word from the notes.
- Do not add anything that is not in the notes. Do not guess feelings or intentions. Do not say whether the idea is good.
- If the notes hold nothing useful, return an empty list.
NOTES
${notes}
Return JSON only: {"insights":[{"point":"short plain sentence","quote":"exact words from the notes"}]}`;
  let raw: unknown = null;
  try { raw = await callModelJSON<unknown>([{ role: "user", content: prompt }], { maxTokens: 900 }); } catch { /* handled below */ }
  if (raw === null) return NextResponse.json({ ok: false, error: "BuildMind could not read the notes just now. Your notes were kept. Please try again." }, { status: 502 });
  const insights = verifyInsights(raw, notes);
  await admin.from("conversation_people").update({ notes, insights, status: "done", updated_at: new Date().toISOString() }).eq("id", b.id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true, insights });
}

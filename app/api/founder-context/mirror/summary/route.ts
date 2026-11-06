/**
 * POST /api/founder-context/mirror/summary — a short plain-language reading of the founder's own Mirror.
 * Body: { mirror }. One Gemini-preferred call, cached per founder against a hash of the text it was written from, so an
 * unchanged mirror costs nothing. Returns { ok:false } quietly when the model is unavailable; the page shows nothing then.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasEnough, inputKey, normalizeSummary, summaryInput, summaryPrompt } from "@/lib/founderMirrorSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KEY = "mirror_summary";

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { mirror?: unknown };
  const input = summaryInput(body.mirror);
  if (!hasEnough(input)) return NextResponse.json({ ok: false, reason: "not_enough" });
  const key = inputKey(input);
  const admin = createAdminClient();

  const { data: row } = await admin.from("user_behavior_state").select("value").eq("user_id", user.userId).eq("key", KEY).maybeSingle();
  const cached = (row as { value?: { key?: string; text?: string } } | null)?.value;
  if (cached?.key === key && cached.text) return NextResponse.json({ ok: true, summary: cached.text, cached: true });

  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return NextResponse.json({ ok: false, reason: "limit" });
  try {
    const raw = await callModelJSON<unknown>([{ role: "user", content: summaryPrompt(input) }], { maxTokens: 500, prefer: "gemini", geminiTimeoutMs: 14_000, feature: "mirror_summary" });
    const text = normalizeSummary(raw);
    if (!text) return NextResponse.json({ ok: false, reason: "unreadable" });
    await admin.from("user_behavior_state").upsert({ user_id: user.userId, key: KEY, value: { key, text, at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    return NextResponse.json({ ok: true, summary: text, cached: false });
  } catch {
    return NextResponse.json({ ok: false, reason: "unavailable" });
  }
}

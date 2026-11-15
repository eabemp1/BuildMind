/**
 * GET  /api/project-facts?projectId=  → the facts BuildMind is working from.
 * POST /api/project-facts { key, value, projectId? } → the founder states or corrects one. History is kept; the latest wins.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { CORRECTABLE, FACTS_KEY, loadFacts, parseCorrections, type Correction, type CorrectableKey } from "@/lib/projectFacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ key: z.enum(Object.keys(CORRECTABLE) as [CorrectableKey, ...CorrectableKey[]]), value: z.string().trim().min(1).max(200), projectId: z.string().uuid().optional() });

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, facts: [] });
  const projectId = new URL(request.url).searchParams.get("projectId");
  const facts = await loadFacts(createAdminClient(), user.userId, projectId && /^[0-9a-f-]{36}$/i.test(projectId) ? projectId : null);
  return NextResponse.json({ ok: true, facts });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Choose what to correct and write a short answer." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const admin = createAdminClient();
  const { data } = await admin.from("user_behavior_state").select("value").eq("user_id", user.userId).eq("key", FACTS_KEY).maybeSingle();
  const items: Correction[] = [...parseCorrections(data?.value), { key: p.data.key, value: p.data.value, at: new Date().toISOString() }].slice(-60);
  const { error } = await admin.from("user_behavior_state").upsert({ user_id: user.userId, key: FACTS_KEY, value: { items }, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) return NextResponse.json({ ok: false, error: "Could not save that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, facts: await loadFacts(admin, user.userId, p.data.projectId ?? null) });
}

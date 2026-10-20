/** POST /api/radar/prep { id } — prepare for one item: why it fits, questions, an intro and the ask. Nothing is sent. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModelJSON } from "@/lib/ai-providers";
import { loadProject } from "@/lib/prep/engine";
import { loadInferredContext } from "@/lib/prep/context";
import { unsupportedNumbers } from "@/lib/distribution/engine";
import { prepFallback, cleanPrep } from "@/lib/radar/prep";
import type { RadarItem } from "@/lib/radar/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ id: z.string().uuid(), regenerate: z.boolean().optional() });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, prep: null, reason: "unavailable" });
  const admin = createAdminClient();
  const { data, error } = await admin.from("radar_items").select("*").eq("id", parsed.data.id).eq("user_id", user.userId).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const item = data as RadarItem & { source_text?: string | null; project_id?: string | null };
  if (item.prep && !parsed.data.regenerate) return NextResponse.json({ ok: true, prep: item.prep, cached: true });

  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;
  const project = await loadProject(admin, user.userId, item.project_id);
  const inferred = await loadInferredContext(admin, user.userId).catch(() => "");
  const facts = [item.title, item.organizer, item.location, item.eligibility, item.cost, item.notes, (item.source_text ?? "").slice(0, 1800)].filter(Boolean).join("\n");

  let prep = prepFallback(item);
  try {
    const ai = await callModelJSON<Record<string, unknown>>([
      { role: "system", content: `You prepare a solo founder for one ${item.kind}. Return ONLY JSON: {"why_it_fits":"1-2 sentences tying it to the founder's product","questions":["3 specific questions the founder should ask or answer"],"intro":"a message of at most 60 words the founder could send or say, first person, no placeholders","ask":"the one thing to ask for"}.
Use only the facts below. Never invent attendees, speakers, prices, dates or numbers. Never claim the founder has users unless the record says so. No filler, no flattery.` },
      { role: "user", content: `FOUNDER'S PRODUCT: ${project.name}. ${project.description} Problem: ${project.problem} Users: ${project.targetUsers} Stage: ${project.stage}\n\n${inferred}\n\nTHE ${item.kind.toUpperCase()}:\n${facts}` },
    ], { role: "fast", temperature: 0.3, maxTokens: 700 });
    const cleaned = cleanPrep(ai, `${facts}\n${project.description} ${project.problem} ${project.targetUsers} ${inferred}`, unsupportedNumbers);
    if (cleaned) prep = cleaned;
  } catch { /* deterministic fallback */ }
  await admin.from("radar_items").update({ prep, updated_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true, prep });
}

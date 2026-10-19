/**
 * POST /api/ai/prep/notes — the founder pastes notes from a customer interview.
 * BuildMind returns themes, each with a quote that is verified to be in the
 * notes, and counts how much was real past behaviour versus opinion.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardNotes } from "@/lib/prep/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ id: z.string().uuid(), notes: z.string().min(40).max(8000) });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = Body.safeParse(await request.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, error: "Paste a little more of your notes first." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("prepared_work").select("kind").eq("id", p.data.id).eq("user_id", user.userId).maybeSingle();
  if (!row || row.kind !== "validation_kit") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;

  const prompt = `You read a solo founder's customer interview notes. Use only the notes. Find up to 5 themes. For each, copy ONE exact sentence or phrase from the notes as the quote. Never paraphrase a quote and never invent one. No flattery, no verdict on whether the idea is good.

NOTES:
"""${p.data.notes}"""

Return JSON: {"themes":[{"theme":"short label","quote":"exact words from the notes"}],"surprise":"one thing in the notes that a founder might not expect, or empty","nextQuestion":"the one question worth asking in the next interview, about past behaviour"}`;
  try {
    const read = guardNotes(await callModelJSON<unknown>([{ role: "user", content: prompt }], { maxTokens: 900 }), p.data.notes);
    if (!read.themes.length) return NextResponse.json({ ok: false, error: "Could not find clear themes with quotes. Paste more of the conversation." }, { status: 422 });
    return NextResponse.json({ ok: true, read });
  } catch { return NextResponse.json({ ok: false, error: "Could not read that just now. Try again." }, { status: 502 }); }
}

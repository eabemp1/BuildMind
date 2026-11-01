/**
 * POST /api/work/refine — rewrite one text by an instruction ("shorter", "more direct", or the founder's own words).
 * Body: { text, instruction }. Returns { text }. Facts are kept; nothing new is added.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { refineText } from "@/lib/work/engine";
import { sanitizeText } from "@/lib/work/shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; instruction?: unknown };
  const text = sanitizeText(body.text, 6000);
  const instruction = sanitizeText(body.instruction, 200);
  if (text.length < 5 || instruction.length < 2) return NextResponse.json({ ok: false, error: "Add some text and say what to change." }, { status: 400 });
  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;
  const out = await refineText(text, instruction);
  if (!out) return NextResponse.json({ ok: false, error: "Could not rewrite this just now. Your text is unchanged." }, { status: 502 });
  return NextResponse.json({ ok: true, text: out });
}

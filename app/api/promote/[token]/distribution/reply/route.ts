import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isRes, requirePromoter } from "@/lib/distribution/guard";
import { reply } from "@/lib/distribution/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Drafts a reply for a saved conversation. You review and post it yourself. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const g = await requirePromoter((await params).token);
  if (isRes(g)) return g.res;
  const p = z.object({ conversationId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "conversationId required" }, { status: 400 });
  return reply(g, p.data.conversationId);
}

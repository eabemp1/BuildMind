import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isRes, requirePromoter } from "@/lib/distribution/guard";
import { diagnose } from "@/lib/distribution/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  body: z.string().min(20).max(8000),
  platform: z.enum(["linkedin", "x", "reddit", "hn", "other"]),
  audience: z.string().max(300).optional(),
  outcome: z.string().max(300).optional(),
  context: z.string().max(2000).optional(),
  draftId: z.string().uuid().optional(),
});

/** Diagnoses a draft and saves it. Never publishes anything. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const g = await requirePromoter((await params).token);
  if (isRes(g)) return g.res;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Paste a draft of at least 20 characters." }, { status: 400 });
  return diagnose(g, p.data);
}

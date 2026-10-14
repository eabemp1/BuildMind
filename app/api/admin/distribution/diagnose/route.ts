import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/distribution/guard";
import { runDiagnosis } from "@/lib/distribution/diagnose";

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

/** Diagnoses a draft and saves it (with its diagnosis). Never publishes anything. */
export async function POST(req: NextRequest) {
  const g = await requireOwner();
  if ("res" in g) return g.res;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Paste a draft of at least 20 characters." }, { status: 400 });
  const { draftId, ...input } = p.data;
  const diagnosis = await runDiagnosis(input);
  const admin = createAdminClient();
  const row = { platform: input.platform, audience: input.audience ?? null, outcome: input.outcome ?? null, context: input.context ?? null, body: input.body, diagnosis, updated_at: new Date().toISOString() };
  const q = draftId
    ? admin.from("dist_drafts").update(row).eq("id", draftId).eq("user_id", g.userId).select("*").maybeSingle()
    : admin.from("dist_drafts").insert({ ...row, user_id: g.userId }).select("*").single();
  const { data, error } = await q;
  return NextResponse.json({ ok: true, diagnosis, draft: error ? null : data, saved: !error });
}

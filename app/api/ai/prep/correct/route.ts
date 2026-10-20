/**
 * POST /api/ai/prep/correct — "Fix it": the Distribution Studio's diagnosis of
 * a draft. Returns what works, what weakens it (each with a quote that is
 * checked against the draft) and sharper versions. Nothing is sent or posted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { correctDraft } from "@/lib/distribution/engine";
import type { Platform } from "@/lib/distribution/textSignals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ id: z.string().uuid().optional(), text: z.string().min(20).max(4000), kind: z.string().max(30).optional(), platform: z.string().max(12).optional() });
const FIXABLE = new Set(["outreach", "post"]);

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = Body.safeParse(await request.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, error: "Add a little more text first." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });

  const admin = createAdminClient();
  // Without a saved row (database not set up yet) the review still works: it needs only the text.
  let row: { kind: string; platform: string; corrections: number } | null = null;
  if (p.data.id) {
    const { data } = await admin.from("prepared_work").select("kind,platform,corrections,project_id").eq("id", p.data.id).eq("user_id", user.userId).maybeSingle();
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    row = data as unknown as { kind: string; platform: string; corrections: number };
  } else if (!p.data.kind) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const kind = row?.kind ?? (p.data.kind as string);
  if (!FIXABLE.has(kind)) return NextResponse.json({ ok: false, error: "Nothing to fix here." }, { status: 400 });
  if (row && row.corrections >= 6) return NextResponse.json({ ok: false, error: "That's enough rounds for today. Use the best version." }, { status: 429 });

  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;

  const platform = (["linkedin", "x", "reddit", "hn", "other"].includes((row?.platform ?? p.data.platform) as string) ? (row?.platform ?? p.data.platform) : "other") as Platform;
  const diagnosis = await correctDraft(p.data.text, platform, "founders", "start a real conversation");
  if (row && p.data.id) await admin.from("prepared_work").update({ corrections: row.corrections + 1, updated_at: new Date().toISOString() }).eq("id", p.data.id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true, diagnosis });
}

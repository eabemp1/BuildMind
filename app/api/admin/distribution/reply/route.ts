import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/distribution/guard";
import { runReplyDraft } from "@/lib/distribution/diagnose";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Drafts a reply for a saved conversation. The founder reviews and posts it themselves. */
export async function POST(req: NextRequest) {
  const g = await requireOwner();
  if ("res" in g) return g.res;
  const p = z.object({ conversationId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "conversationId required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: c } = await admin.from("dist_conversations").select("*").eq("id", p.data.conversationId).eq("user_id", g.userId).maybeSingle();
  if (!c) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!c.excerpt?.trim()) return NextResponse.json({ ok: false, error: "Paste the post excerpt first so the reply can be grounded in it." }, { status: 400 });
  const draft = await runReplyDraft({ excerpt: c.excerpt, platform: c.platform, segment: c.segment, relevance: c.relevance, notes: c.notes });
  if (draft.ai) await admin.from("dist_conversations").update({ suggested_reply: draft.reply, updated_at: new Date().toISOString() }).eq("id", c.id).eq("user_id", g.userId);
  return NextResponse.json({ ok: true, ...draft });
}

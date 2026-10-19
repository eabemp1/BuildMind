/**
 * POST /api/ai/prep/link — the founder links the video they recorded (Loom or
 * YouTube). The link is checked through the provider's public oEmbed endpoint
 * for a real title. A private video is kept but marked unverified.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { oembedUrl, parseVideoUrl } from "@/lib/prep/video";
import type { Prepared } from "@/lib/prep/kinds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = z.object({ id: z.string().uuid(), url: z.string().min(10).max(300) }).safeParse(await request.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, error: "Paste the link first." }, { status: 400 });
  const v = parseVideoUrl(p.data.url);
  if (!v) return NextResponse.json({ ok: false, error: "Use a Loom share link or a YouTube link (https)." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("prepared_work").select("kind,payload,status").eq("id", p.data.id).eq("user_id", user.userId).maybeSingle();
  if (!row || row.kind !== "video_script") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  let title = ""; let verified = false;
  try {
    const r = await fetch(oembedUrl(v), { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (r.ok) { const j = (await r.json()) as { title?: string }; title = (j.title ?? "").trim().slice(0, 120); verified = Boolean(title); }
  } catch { /* unverified */ }

  const payload = { ...(row.payload as Prepared), recorded: { url: v.url, title: title || "Linked video", verified } };
  const update: Record<string, unknown> = { payload, updated_at: new Date().toISOString() };
  if (row.status !== "sent") update.status = "sent";
  const { error } = await admin.from("prepared_work").update(update).eq("id", p.data.id).eq("user_id", user.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true, recorded: payload.recorded });
}

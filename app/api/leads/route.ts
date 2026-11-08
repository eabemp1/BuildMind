/**
 * GET  /api/leads?projectId=&country=  — the founder's saved leads, plus what is working in that country.
 * POST /api/leads {id, status, channel?, note?} — record what happened with a lead.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeRow, rankRows, type MapRow } from "@/lib/leads/map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  const country = (req.nextUrl.searchParams.get("country") ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  let q = admin.from("lead_results").select("id,lead_name,lead_kind,lead_url,payload,channel,status,note,country,city,created_at").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(60);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: mine } = await q;

  let working: string[] = [];
  if (country) {
    const { data: rows } = await admin.from("customer_map").select("country,lead_kind,channel,founders,contacted,replied,converted").eq("country", country);
    working = rankRows((rows ?? []) as MapRow[]).slice(0, 4).map(describeRow);
  }
  return NextResponse.json({ ok: true, leads: mine ?? [], working });
}

const Update = z.object({
  id: z.string().uuid(),
  status: z.enum(["saved", "contacted", "replied", "converted", "no_reply", "not_a_fit"]),
  channel: z.enum(["whatsapp", "facebook", "phone", "visit", "email", "other"]).nullable().optional(),
  note: z.string().max(400).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body: z.infer<typeof Update>;
  try { body = Update.parse(await req.json()); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  const patch: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
  if (body.channel !== undefined) patch.channel = body.channel;
  if (body.note !== undefined) patch.note = body.note;
  const { error } = await createAdminClient().from("lead_results").update(patch).eq("id", body.id).eq("user_id", auth.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

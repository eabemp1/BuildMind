/**
 * GET  /api/leads?projectId=&country=  — the founder's saved leads, plus what is working in that country.
 * POST /api/leads {id, status, channel?, note?} — record what happened with a lead.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeRow, rankRows, type MapRow } from "@/lib/leads/map";
import { sameProduct } from "@/lib/leads/save";
import type { ProductBrief } from "@/lib/leads/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  const country = (req.nextUrl.searchParams.get("country") ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  // A one-off product has no project: its batches are told apart by the product name saved with them.
  const oneoff = req.nextUrl.searchParams.get("scope") === "oneoff";
  const brief = (req.nextUrl.searchParams.get("brief") ?? "").trim();

  let q = admin.from("lead_results").select("id,lead_name,lead_kind,lead_url,payload,channel,status,note,country,city,created_at").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(oneoff ? 200 : 60);
  if (oneoff) q = q.is("project_id", null);
  else if (projectId) q = q.eq("project_id", projectId);
  const { data: rawMine } = await q;
  const mine = oneoff
    ? (rawMine ?? []).filter((r) => sameProduct((r.payload as { brief?: { name?: string } } | null)?.brief?.name, brief)).slice(0, 60)
    : rawMine;

  let working: string[] = [];
  if (country) {
    const { data: rows } = await admin.from("customer_map").select("country,lead_kind,channel,founders,contacted,replied,converted").eq("country", country);
    working = rankRows((rows ?? []) as MapRow[]).slice(0, 4).map(describeRow);
  }
  let rq = admin.from("lead_runs").select("id,status,lead_count,reason,error,stats,input,created_at,finished_at").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(oneoff ? 30 : 1);
  if (oneoff) rq = rq.is("project_id", null);
  else if (projectId) rq = rq.eq("project_id", projectId);
  const { data: runRows } = await rq;
  const productOf = (r: { input?: unknown }) => (r.input as { product?: ProductBrief } | null)?.product;
  const lastRun = oneoff ? (runRows ?? []).find((r) => sameProduct(productOf(r)?.name, brief)) : (runRows ?? [])[0];
  // A run that has been "running" for over 6 minutes was cut off; show it as failed instead of spinning forever.
  const cut = lastRun && lastRun.status === "running" && Date.now() - new Date(lastRun.created_at).getTime() > 6 * 60_000;
  const base = lastRun && cut ? { ...lastRun, status: "failed", error: "The search was cut off. Try again." } : lastRun;
  // The saved reading stays on the server; the page only learns that a retry is possible.
  let run: Record<string, unknown> | null = null;
  if (base) {
    const { material, ...st } = (base.stats ?? {}) as { material?: unknown };
    run = { id: base.id, status: base.status, lead_count: base.lead_count, reason: base.reason, error: base.error, stats: st, product: productOf(base) ?? null, retryable: base.status === "failed" && Boolean(material) };
  }
  // One-off products already searched, so they can be picked again without retyping.
  const oneoffs: ProductBrief[] = [];
  {
    const { data: all } = await admin.from("lead_runs").select("input").eq("user_id", auth.userId).is("project_id", null).order("created_at", { ascending: false }).limit(30);
    for (const r of all ?? []) {
      const p = productOf(r);
      if (p?.name && !oneoffs.some((x) => sameProduct(x.name, p.name))) oneoffs.push(p);
    }
  }
  return NextResponse.json({ ok: true, leads: mine ?? [], working, run, oneoffs: oneoffs.slice(0, 8) });
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

/**
 * POST /api/leads/find — run the Lead Finder for one founder and save what it found.
 * Builder plan; counts against the AI allowance like every agent run.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLeads } from "@/lib/leads/engine";
import { sanitizePromptInput } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().uuid().nullable().optional(),
  country: z.string().min(2).max(60),
  city: z.string().max(60).optional().default(""),
  customer: z.string().min(3).max(160),
  problem: z.string().max(240).optional().default(""),
});

export async function POST(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (auth.plan === "free") return NextResponse.json({ ok: false, error: "The Lead Finder is part of the Builder plan." }, { status: 403 });
  const blocked = await gateAIUsage(auth.userId, "general");
  if (blocked) return blocked;

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return NextResponse.json({ ok: false, error: "Add your country and who your customers are." }, { status: 400 }); }

  const admin = createAdminClient();
  let problem = sanitizePromptInput(body.problem, 240);
  if (body.projectId) {
    const { data: proj } = await admin.from("projects").select("problem,description").eq("id", body.projectId).eq("user_id", auth.userId).maybeSingle();
    if (!proj) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    if (!problem) problem = sanitizePromptInput(String(proj.problem ?? proj.description ?? ""), 240);
  }

  const run = await findLeads({
    country: sanitizePromptInput(body.country, 60),
    city: sanitizePromptInput(body.city, 60),
    customer: sanitizePromptInput(body.customer, 160),
    problem,
  });

  const saved: Array<Record<string, unknown>> = [];
  for (const l of run.leads) {
    const { data } = await admin.from("lead_results").upsert({
      user_id: auth.userId, project_id: body.projectId ?? null,
      country: body.country.trim(), city: body.city.trim(),
      lead_name: l.name, lead_kind: l.kind, lead_url: l.url, payload: l, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,project_id,lead_url", ignoreDuplicates: false }).select("id,status,channel,note").maybeSingle();
    saved.push({ ...l, id: data?.id ?? null, status: data?.status ?? "saved", channel: data?.channel ?? null });
  }
  return NextResponse.json({ ok: true, leads: saved, thin: run.thin, stats: run.stats });
}

/**
 * POST /api/demand — start a Demand Check in the background (Builder plan, counts against the AI allowance).
 * GET  /api/demand?projectId= — the latest check for that project.
 */
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDemand } from "@/lib/demand/engine";
import { sanitizePromptInput } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().uuid().nullable().optional(),
  country: z.string().min(2).max(60),
  city: z.string().max(60).optional().default(""),
  customer: z.string().min(3).max(160),
  problem: z.string().min(3).max(240),
});

export async function POST(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (auth.plan === "free") return NextResponse.json({ ok: false, error: "The Demand Check is part of the Builder plan." }, { status: 403 });
  const blocked = await gateAIUsage(auth.userId, "general");
  if (blocked) return blocked;

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return NextResponse.json({ ok: false, error: "Add your country and what people need." }, { status: 400 }); }

  const admin = createAdminClient();
  if (body.projectId) {
    const { data: proj } = await admin.from("projects").select("id").eq("id", body.projectId).eq("user_id", auth.userId).maybeSingle();
    if (!proj) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  const input = {
    country: sanitizePromptInput(body.country, 60), city: sanitizePromptInput(body.city, 60),
    customer: sanitizePromptInput(body.customer, 160), problem: sanitizePromptInput(body.problem, 240),
  };

  const since = new Date(Date.now() - 6 * 60_000).toISOString();
  const { data: live } = await admin.from("demand_runs").select("id").eq("user_id", auth.userId).eq("status", "running").gte("created_at", since).limit(1).maybeSingle();
  if (live?.id) return NextResponse.json({ ok: true, runId: live.id });

  const { data: row, error } = await admin.from("demand_runs").insert({ user_id: auth.userId, project_id: body.projectId ?? null, status: "running", input }).select("id").single();
  if (error || !row) return NextResponse.json({ ok: false, error: "Could not start the check. Has the demand_runs table been created?" }, { status: 500 });

  after(async () => {
    try {
      const run = await checkDemand(input);
      await admin.from("demand_runs").update({ status: "done", result: run, signal_count: run.signals.length, finished_at: new Date().toISOString() }).eq("id", row.id);
    } catch (e) {
      await admin.from("demand_runs").update({ status: "failed", error: String((e as Error)?.message ?? e).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", row.id);
    }
  });
  return NextResponse.json({ ok: true, runId: row.id });
}

export async function GET(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  let q = createAdminClient().from("demand_runs").select("id,status,result,error,created_at").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(1);
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q.maybeSingle();
  const run = data && data.status === "running" && Date.now() - new Date(data.created_at).getTime() > 6 * 60_000
    ? { ...data, status: "failed", error: "The check was cut off. Try again." } : data;
  return NextResponse.json({ ok: true, run: run ?? null });
}

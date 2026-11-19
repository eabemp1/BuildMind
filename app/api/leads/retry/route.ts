/**
 * POST /api/leads/retry { runId }: write the leads again from pages a search already read, after the AI step failed.
 * No new search: the saved reading is reused. Builder plan; spends one AI request, returned if it fails again.
 */
import { withJobCost, setJobUser } from "@/lib/server/jobCost";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { refundAIUsage } from "@/lib/server/aiUsageRefund";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractLeads, fromSaved, thinReason, type SavedMaterial } from "@/lib/leads/engine";
import { cleanInput } from "@/lib/leads/plan";
import { generationFailure, saveLeads } from "@/lib/leads/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ runId: z.string().uuid() });

async function postInner(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  setJobUser(auth.userId);
  if (auth.plan === "free") return NextResponse.json({ ok: false, error: "The Lead Finder is part of the Builder plan." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const userId = auth.userId;
  const { data: run } = await admin.from("lead_runs").select("id,project_id,status,input,stats").eq("id", parsed.data.runId).eq("user_id", userId).maybeSingle();
  if (!run) return NextResponse.json({ ok: false, error: "Search not found." }, { status: 404 });
  const stats = (run.stats ?? {}) as Record<string, unknown> & { material?: SavedMaterial };
  if (run.status !== "failed" || !stats.material) return NextResponse.json({ ok: false, error: "This search has nothing to retry. Run it again." }, { status: 409 });

  const blocked = await gateAIUsage(userId, "general");
  if (blocked) return blocked;

  // Claim it: only one retry can start, even if the button is pressed twice.
  const { data: claimed } = await admin.from("lead_runs").update({ status: "running", error: null }).eq("id", run.id).eq("status", "failed").select("id").maybeSingle();
  if (!claimed) { await refundAIUsage(userId, "general"); return NextResponse.json({ ok: true, runId: run.id, status: "running" }); }

  const input = cleanInput((run.input ?? {}) as Record<string, string>);
  const material = stats.material;
  const { material: _drop, failure: _f, ...keep } = stats; // eslint-disable-line @typescript-eslint/no-unused-vars
  after(async () => {
    const fail = async (msg: string) => {
      await refundAIUsage(userId, "general");
      await admin.from("lead_runs").update({ status: "failed", error: msg, stats: { ...keep, material, failure: "generation" }, finished_at: new Date().toISOString() }).eq("id", run.id);
    };
    try {
      const m = fromSaved(material);
      const out = await extractLeads(input, m.pages, m.places, m.snippets);
      if (out.failed) return await fail(generationFailure(out.error));
      const projectId = (run.project_id as string | null) ?? null;
      const failedSaves = await saveLeads(admin, { userId, projectId, country: input.country, city: input.city, product: projectId ? undefined : input.product, leads: out.leads });
      if (out.leads.length > 0 && failedSaves === out.leads.length) return await fail("Leads were written but could not be saved. Try again.");
      const st = { ...keep, proposed: out.proposed, modelFailed: 0, modelError: undefined };
      const reason = out.leads.length < 3 ? thinReason(out.leads.length, { resultsFound: Number(keep.resultsFound ?? 0), pagesRead: m.pages.length, places: m.places.length, proposed: out.proposed, modelFailed: 0 }) : null;
      await admin.from("lead_runs").update({ status: "done", stats: st, lead_count: out.leads.length, reason, error: null, finished_at: new Date().toISOString() }).eq("id", run.id);
    } catch (e) {
      await fail(generationFailure(String((e as Error)?.message ?? e)));
    }
  });
  return NextResponse.json({ ok: true, runId: run.id, status: "running" });
}

export async function POST(req: NextRequest) {
  return withJobCost("leads_retry", () => postInner(req));
}

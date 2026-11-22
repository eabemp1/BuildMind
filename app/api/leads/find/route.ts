/**
 * POST /api/leads/find — run the Lead Finder for one founder and save what it found.
 * Builder plan; counts against the AI allowance like every agent run.
 */
import { withJobCost, setJobUser } from "@/lib/server/jobCost";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { refundAIUsage } from "@/lib/server/aiUsageRefund";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLeads, type LeadSink } from "@/lib/leads/engine";
import { cleanBrief, type ProductBrief } from "@/lib/leads/plan";
import { directLeads } from "@/lib/leads/rank";
import { generationFailure, hasMaterial, plainUrl, sameProduct, saveLeads } from "@/lib/leads/save";
import { sanitizePromptInput } from "@/lib/agents";
import { admitHeavyRun } from "@/lib/server/heavyRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().uuid().nullable().optional(),
  /** A one-off product brief. Used when no project is chosen; nothing is saved to any project. */
  brief: z.object({ name: z.string().min(2).max(80), what: z.string().max(400).optional().default("") }).optional(),
  more: z.boolean().optional(),
  country: z.string().min(2).max(60),
  city: z.string().max(60).optional().default(""),
  customer: z.string().min(3).max(160),
  problem: z.string().max(240).optional().default(""),
});

async function postInner(req: NextRequest) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  setJobUser(auth.userId);
  if (auth.plan === "free") return NextResponse.json({ ok: false, error: "The Lead Finder is part of the Builder plan." }, { status: 403 });
  let body: z.infer<typeof Body>;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Say which field failed and why, so a filled-in form never gets a misleading "add your country".
    const issue = parsed.error.issues[0];
    const field = String(issue?.path?.[0] ?? "");
    const names: Record<string, string> = { country: "Country", city: "City", customer: "Who your customers are", problem: "The problem", projectId: "Project" };
    const name = names[field] ?? "The form";
    const error = issue?.code === "too_big" ? `${name} is too long. Shorten it and try again.`
      : issue?.code === "too_small" ? `${name} is too short. Add a little more.`
      : field === "projectId" ? "Reload the page and pick your project again."
      : "Add your country and who your customers are.";
    return NextResponse.json({ ok: false, error, field }, { status: 400 });
  }
  body = parsed.data;

  const admin = createAdminClient();
  let problem = sanitizePromptInput(body.problem, 240);
  // The product behind the search: the chosen project, or a one-off brief. Never both, and a one-off never touches a project.
  let product: ProductBrief | undefined;
  let projectId = body.projectId ?? null;
  if (projectId) {
    const { data: proj } = await admin.from("projects").select("name,problem,description").eq("id", projectId).eq("user_id", auth.userId).maybeSingle();
    if (!proj) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    if (!problem) problem = sanitizePromptInput(String(proj.problem ?? proj.description ?? ""), 240);
    product = cleanBrief({ name: sanitizePromptInput(String(proj.name ?? ""), 80), what: sanitizePromptInput(String(proj.description ?? proj.problem ?? ""), 400) });
  } else if (body.brief) {
    product = cleanBrief({ name: sanitizePromptInput(body.brief.name, 80), what: sanitizePromptInput(body.brief.what ?? "", 400) });
  }
  if (!projectId && !product) return NextResponse.json({ ok: false, error: "Choose a project or describe the product you are searching for." }, { status: 400 });

  // "Find more" keeps the brief the batch started with, whatever the form or the active project shows now.
  if (body.more === true) {
    let lq = admin.from("lead_runs").select("input").eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(20);
    lq = projectId ? lq.eq("project_id", projectId) : lq.is("project_id", null);
    const { data: prev } = await lq;
    const original = (prev ?? [])
      .map((r) => (r.input as { product?: ProductBrief } | null)?.product)
      .find((p) => p?.name && (projectId || (product && p.name.toLowerCase() === product.name.toLowerCase())));
    if (original) product = cleanBrief(original);
  }
  // With no project to take the problem from, a one-off's own description stands in (after "Find more" has restored the original).
  if (!problem && !projectId && product) problem = sanitizePromptInput(product.what, 240);

  const input = {
    country: sanitizePromptInput(body.country, 60),
    city: sanitizePromptInput(body.city, 60),
    customer: sanitizePromptInput(body.customer, 160),
    problem,
    ...(product ? { product } : {}),
  };

  // One search at a time per founder: if one started in the last 6 minutes, hand back that one.
  const since = new Date(Date.now() - 6 * 60_000).toISOString();
  const { data: live } = await admin.from("lead_runs").select("id").eq("user_id", auth.userId).eq("status", "running").gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (live?.id) return NextResponse.json({ ok: true, runId: live.id, status: "running" });

  const admit = await admitHeavyRun(auth.userId);
  if (!admit.allowed) return NextResponse.json({ ok: false, error: admit.reason, retryAfterMinutes: admit.retryAfterMinutes }, { status: 429 });

  // Spend the allowance last: a bad form, a search already running, or a busy server costs nothing.
  const blocked = await gateAIUsage(auth.userId, "general");
  if (blocked) return blocked;

  const { data: row, error: insErr } = await admin.from("lead_runs").insert({ user_id: auth.userId, project_id: projectId, status: "running", input }).select("id").single();
  if (insErr || !row) return NextResponse.json({ ok: false, error: "Could not start the search. Has the lead_runs table been created?" }, { status: 500 });

  const userId = auth.userId;
  const country = body.country.trim();
  const city = body.city.trim();
  // Keep working after the response is sent, so the founder can leave this page.
  after(async () => {
    const sink: LeadSink = { leads: [], stats: null, queries: [] };
    try {
      // The function is cut off at maxDuration. Stop a little earlier so the run is marked failed
      // with a clear message instead of staying "running" until the page gives up on it.
      const HARD_LIMIT_MS = (maxDuration - 20) * 1000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // "Find more": skip every page already saved for this product, so the search goes somewhere new.
      let known: string[] = [];
      let tried: string[] = [];
      if (body.more === true) {
        let hq = admin.from("lead_results").select("lead_url,payload").eq("user_id", userId).limit(400);
        hq = projectId ? hq.eq("project_id", projectId) : hq.is("project_id", null);
        const { data: have } = await hq;
        known = (have ?? []).filter((r) => projectId || sameProduct((r.payload as { brief?: { name?: string } } | null)?.brief?.name, product?.name)).map((r) => plainUrl(String((r as { lead_url?: string }).lead_url ?? ""))).filter(Boolean);
        // Resume: also skip the searches the last run already tried.
        let pq = admin.from("lead_runs").select("stats,input").eq("user_id", userId).neq("id", row.id).order("created_at", { ascending: false }).limit(10);
        pq = projectId ? pq.eq("project_id", projectId) : pq.is("project_id", null);
        const { data: prev } = await pq;
        const last = (prev ?? []).find((r) => projectId || sameProduct((r.input as { product?: ProductBrief } | null)?.product?.name, product?.name));
        const q = (last?.stats as { queries?: unknown } | null)?.queries;
        tried = Array.isArray(q) ? q.filter((x): x is string => typeof x === "string").slice(0, 40) : [];
      }
      let run: Awaited<ReturnType<typeof findLeads>>;
      try {
        run = await Promise.race([
          findLeads(input, Date.now() + HARD_LIMIT_MS - 30_000, admit.light, sink, known, tried),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The search took too long and was stopped. Try again.")), HARD_LIMIT_MS); }),
        ]);
      } catch (e) {
        // Out of time: keep what earlier rounds already found instead of throwing it away.
        if (!sink.leads.length || !sink.stats) throw e;
        run = { leads: sink.leads, thin: sink.leads.length < 3, reason: "The search ran out of time, so these are the leads found before it stopped.", queries: sink.queries, stats: sink.stats };
      } finally { clearTimeout(timer); }

      // The pages were read but the AI step could not write anything: a failure, not "no leads found". Keep what was read for a retry.
      if (run.leads.length === 0 && run.stats.modelFailed > 0 && hasMaterial(sink)) {
        await refundAIUsage(userId, "general");
        await admin.from("lead_runs").update({ status: "failed", error: generationFailure(run.stats.modelError), stats: { ...run.stats, queries: run.queries.slice(0, 40), failure: "generation", material: sink.material }, finished_at: new Date().toISOString() }).eq("id", row.id);
        return;
      }
      const saveFailed = await saveLeads(admin, { userId, projectId, country, city, product: projectId ? undefined : product, leads: run.leads });
      if (run.leads.length > 0 && saveFailed === run.leads.length) {
        await admin.from("lead_runs").update({ status: "failed", error: "Leads were found but could not be saved. Has the lead_results table been created?", stats: run.stats, finished_at: new Date().toISOString() }).eq("id", row.id);
        return;
      }
      await admin.from("lead_runs").update({ status: "done", stats: { ...run.stats, queries: run.queries.slice(0, 40) }, lead_count: directLeads(run.leads).length, reason: run.reason, finished_at: new Date().toISOString() }).eq("id", row.id);
    } catch (e) {
      await refundAIUsage(userId, "general"); // the search failed on our side: give the request back
      // Timed out after the pages were read: same as an AI failure, the reading is kept for a retry.
      const kept = sink.leads.length === 0 && hasMaterial(sink);
      await admin.from("lead_runs").update(kept
        ? { status: "failed", error: generationFailure(undefined, true), stats: { ...(sink.stats ?? {}), queries: sink.queries.slice(0, 40), failure: "generation", material: sink.material }, finished_at: new Date().toISOString() }
        : { status: "failed", error: String((e as Error)?.message ?? e).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", row.id);
    }
  });
  return NextResponse.json({ ok: true, runId: row.id, status: "running" });
}

export async function POST(req: NextRequest) {
  return withJobCost("leads_find", () => postInner(req));
}

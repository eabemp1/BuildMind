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
import { sanitizePromptInput } from "@/lib/agents";
import { admitHeavyRun } from "@/lib/server/heavyRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().uuid().nullable().optional(),
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
  if (body.projectId) {
    const { data: proj } = await admin.from("projects").select("problem,description").eq("id", body.projectId).eq("user_id", auth.userId).maybeSingle();
    if (!proj) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    if (!problem) problem = sanitizePromptInput(String(proj.problem ?? proj.description ?? ""), 240);
  }

  const input = {
    country: sanitizePromptInput(body.country, 60),
    city: sanitizePromptInput(body.city, 60),
    customer: sanitizePromptInput(body.customer, 160),
    problem,
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

  const { data: row, error: insErr } = await admin.from("lead_runs").insert({ user_id: auth.userId, project_id: body.projectId ?? null, status: "running", input }).select("id").single();
  if (insErr || !row) return NextResponse.json({ ok: false, error: "Could not start the search. Has the lead_runs table been created?" }, { status: 500 });

  const userId = auth.userId;
  const projectId = body.projectId ?? null;
  const country = body.country.trim();
  const city = body.city.trim();
  // Keep working after the response is sent, so the founder can leave this page.
  after(async () => {
    try {
      // The function is cut off at maxDuration. Stop a little earlier so the run is marked failed
      // with a clear message instead of staying "running" until the page gives up on it.
      const HARD_LIMIT_MS = (maxDuration - 20) * 1000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // "Find more": skip every page already saved for this project, so the search goes somewhere new.
      let known: string[] = [];
      if (body.more === true) {
        const { data: have } = await admin.from("lead_results").select("lead_url").eq("user_id", auth.userId).eq("project_id", body.projectId ?? "").limit(400);
        known = (have ?? []).map((r) => String((r as { lead_url?: string }).lead_url ?? "")).filter(Boolean);
      }
      const sink: LeadSink = { leads: [], stats: null, queries: [] };
      let run: Awaited<ReturnType<typeof findLeads>>;
      try {
        run = await Promise.race([
          findLeads(input, Date.now() + HARD_LIMIT_MS - 30_000, admit.light, sink, known),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The search took too long and was stopped. Try again.")), HARD_LIMIT_MS); }),
        ]);
      } catch (e) {
        // Out of time: keep what earlier rounds already found instead of throwing it away.
        if (!sink.leads.length || !sink.stats) throw e;
        run = { leads: sink.leads, thin: sink.leads.length < 3, reason: "The search ran out of time, so these are the leads found before it stopped.", queries: sink.queries, stats: sink.stats };
      } finally { clearTimeout(timer); }
      let saveFailed = 0;
      for (const l of run.leads) {
        // Select-then-write: the unique index is on an expression, so ON CONFLICT cannot target it.
        let q = admin.from("lead_results").select("id").eq("user_id", userId).eq("lead_url", l.url);
        q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
        const { data: existing } = await q.limit(1).maybeSingle();
        const row2 = { country, city, lead_name: l.name, lead_kind: l.kind, payload: l, updated_at: new Date().toISOString() };
        const { error } = existing?.id
          ? await admin.from("lead_results").update(row2).eq("id", existing.id)
          : await admin.from("lead_results").insert({ user_id: userId, project_id: projectId, lead_url: l.url, ...row2 });
        if (error) { saveFailed++; console.error("[leads] save failed:", error.message); }
      }
      if (run.leads.length > 0 && saveFailed === run.leads.length) {
        await admin.from("lead_runs").update({ status: "failed", error: "Leads were found but could not be saved. Has the lead_results table been created?", stats: run.stats, finished_at: new Date().toISOString() }).eq("id", row.id);
        return;
      }
      await admin.from("lead_runs").update({ status: "done", stats: run.stats, lead_count: run.leads.length, reason: run.reason, finished_at: new Date().toISOString() }).eq("id", row.id);
    } catch (e) {
      await refundAIUsage(auth.userId, "general"); // the search failed on our side: give the request back
            await admin.from("lead_runs").update({ status: "failed", error: String((e as Error)?.message ?? e).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", row.id);
    }
  });
  return NextResponse.json({ ok: true, runId: row.id, status: "running" });
}

export async function POST(req: NextRequest) {
  return withJobCost("leads_find", () => postInner(req));
}

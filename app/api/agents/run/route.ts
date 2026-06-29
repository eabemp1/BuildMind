/**
 * POST /api/agents/run
 *
 * Runs the agent to completion synchronously before responding.
 * This is the correct pattern for Vercel — fire-and-forget via setImmediate
 * is killed when the lambda is frozen after the response is sent.
 *
 * maxDuration = 300 s gives the full agent pipeline room to breathe.
 * The client renders the queued card immediately on POST response,
 * then receives the complete run in json.data when the route resolves.
 *
 * Plan gate: builder only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { runAgentWorkforce, AGENT_IDENTITY, type AgentType } from "@/lib/agentWorkforce";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  agentType: z.enum(["research", "validation", "competitor"]),
  projectId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await getRouteUser();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (auth.plan === "free") {
    return NextResponse.json(
      { ok: false, error: "Agent Workforce requires the Builder plan." },
      { status: 403 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { agentType, projectId } = body;
  const admin = createAdminClient();

  // ── Load startup context ──────────────────────────────────────────────────
  let startupTitle        = "Your Startup";
  let startupSummary      = "";
  let problem             = "";
  let targetUsers         = "founders";
  let stage               = "Idea";
  const resolvedProjectId = projectId ?? null;

  if (projectId) {
    const { data: proj } = await admin
      .from("projects")
      .select("id,name,title,description,problem,target_users,startup_stage")
      .eq("id", projectId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (proj) {
      startupTitle   = (proj.name ?? proj.title ?? "Your Startup").trim();
      startupSummary = proj.description  ?? "";
      problem        = proj.problem      ?? proj.description ?? "";
      targetUsers    = proj.target_users ?? "founders";
      stage          = proj.startup_stage ?? "Idea";
    }
  }

  // Enrich from founder_context
  const { data: fc } = await admin
    .from("founder_context")
    .select("startup_summary,current_stage")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (fc) {
    if (!startupSummary && fc.startup_summary) startupSummary = fc.startup_summary;
    if (stage === "Idea" && fc.current_stage)  stage          = fc.current_stage;
  }

  if (!problem && !startupSummary) {
    return NextResponse.json(
      { ok: false, error: "No startup context found. Complete onboarding first." },
      { status: 422 },
    );
  }
  if (!problem) problem = startupSummary;

  // ── Create agent_runs row ─────────────────────────────────────────────────
  const identity = AGENT_IDENTITY[agentType as AgentType];
  const { data: runRow, error: insertErr } = await admin
    .from("agent_runs")
    .insert({
      user_id:        auth.userId,
      project_id:     resolvedProjectId,
      agent_type:     agentType,
      status:         "queued",
      mission:        identity.description,
      max_iterations: 3,
      started_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !runRow) {
    const isMissing = insertErr?.message?.includes("does not exist");
    return NextResponse.json(
      {
        ok:    false,
        error: isMissing
          ? "Database tables not ready — apply the agent_runs migration."
          : (insertErr?.message ?? "Failed to create agent run."),
      },
      { status: 500 },
    );
  }

  const runId = runRow.id as string;

  // ── Run synchronously ─────────────────────────────────────────────────────
  // Do NOT use setImmediate / Promise.resolve().then() here.
  // Vercel freezes the lambda the moment the response is flushed,
  // killing any background work. We await the full run and return the
  // complete result so the client gets everything in one response.
  try {
    const result = await runAgentWorkforce({
      runId,
      userId:        auth.userId,
      projectId:     resolvedProjectId,
      agentType:     agentType as AgentType,
      stage,
      startupTitle,
      startupSummary,
      problem,
      targetUsers,
      maxIterations: 3,
    });

    // Fetch the final run row to return full state to client
    const { data: finalRun } = await admin
      .from("agent_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    return NextResponse.json({
      ok:     true,
      runId,
      data:   finalRun,   // client can skip polling — it already has the result
      result,
    });
  } catch (err) {
    await admin
      .from("agent_runs")
      .update({
        status:         "error",
        current_action: String(err).slice(0, 200),
        updated_at:     new Date().toISOString(),
      })
      .eq("id", runId);

    return NextResponse.json(
      { ok: false, error: "Agent run failed. Check server logs.", runId },
      { status: 500 },
    );
  }
}

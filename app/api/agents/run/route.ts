/**
 * POST /api/agents/run
 *
 * Validates the request, inserts an agent_runs row, kicks off the agent
 * workforce in the background (fire-and-forget), and returns the run ID
 * so the client can start polling /api/agents/status/[runId].
 *
 * Plan gate: builder only.
 * DB requirement: agent_runs and agent_findings tables (see migration below).
 *
 * MIGRATION (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS agent_runs (
 *   id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
 *   agent_type       text NOT NULL CHECK (agent_type IN ('research','validation','competitor')),
 *   status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','error','abandoned')),
 *   mission          text,
 *   current_action   text,
 *   iteration        int2 NOT NULL DEFAULT 0,
 *   max_iterations   int2 NOT NULL DEFAULT 3,
 *   signals_found    int2 NOT NULL DEFAULT 0,
 *   confidence_pct   int2 NOT NULL DEFAULT 0,
 *   verdict          text CHECK (verdict IN ('proceed','pivot','kill','inconclusive')),
 *   top_finding_1    text,
 *   top_finding_2    text,
 *   top_finding_3    text,
 *   top_risk         text,
 *   recommended_action text,
 *   report_markdown  text,
 *   started_at       timestamptz NOT NULL DEFAULT now(),
 *   completed_at     timestamptz,
 *   updated_at       timestamptz NOT NULL DEFAULT now()
 * );
 * ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY agent_runs_own ON agent_runs FOR ALL USING (auth.uid() = user_id);
 *
 * CREATE TABLE IF NOT EXISTS agent_findings (
 *   id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   run_id            uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
 *   user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   iteration         int2 NOT NULL DEFAULT 1,
 *   signal_type       text NOT NULL,
 *   positive          boolean NOT NULL DEFAULT true,
 *   confidence        float4 NOT NULL DEFAULT 0.5,
 *   title             text NOT NULL,
 *   evidence          text NOT NULL,
 *   source_type       text NOT NULL DEFAULT 'reasoning',
 *   action_hint       text,
 *   founder_confirmed boolean,
 *   created_at        timestamptz NOT NULL DEFAULT now()
 * );
 * ALTER TABLE agent_findings ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY agent_findings_own ON agent_findings FOR ALL USING (auth.uid() = user_id);
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { runAgentWorkforce, AGENT_IDENTITY, type AgentType } from "@/lib/agentWorkforce";

export const runtime    = "nodejs";
export const dynamic    = "force-dynamic";
export const maxDuration = 300; // agent run can take up to ~2 min

const BodySchema = z.object({
  agentType:  z.enum(["research", "validation", "competitor"]),
  projectId:  z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
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
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { agentType, projectId } = body;
  const admin = createAdminClient();

  // ── Load startup context ──────────────────────────────────────────────────
  // Primary: projects row (has problem, target_users, startup_stage).
  // Fallback: founder_context (startup_summary, current_stage).
  let startupTitle   = "Your Startup";
  let startupSummary = "";
  let problem        = "";
  let targetUsers    = "founders";
  let stage          = "Idea";
  let resolvedProjectId: string | null = projectId ?? null;

  if (projectId) {
    const { data: proj } = await admin
      .from("projects")
      .select("id,name,title,description,problem,target_users,startup_stage")
      .eq("id", projectId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (proj) {
      startupTitle   = (proj.name ?? proj.title ?? "Your Startup").trim();
      startupSummary = proj.description ?? "";
      problem        = proj.problem        ?? proj.description ?? "";
      targetUsers    = proj.target_users   ?? "founders";
      stage          = proj.startup_stage  ?? "Idea";
    }
  }

  // Also pull founder_context for richer summary
  const { data: fc } = await admin
    .from("founder_context")
    .select("startup_summary,current_stage")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (fc) {
    if (!startupSummary && fc.startup_summary) startupSummary = fc.startup_summary;
    if (stage === "Idea" && fc.current_stage)  stage           = fc.current_stage;
  }

  // If we still have nothing useful, fail gracefully
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
    // agent_runs table doesn't exist yet — migration not applied
    const isMissing = insertErr?.message?.includes("does not exist");
    return NextResponse.json(
      {
        ok:    false,
        error: isMissing
          ? "Database tables not ready. Apply the agent_runs migration first (see route comment)."
          : (insertErr?.message ?? "Failed to create agent run."),
      },
      { status: 500 },
    );
  }

  const runId = runRow.id as string;

  // ── Fire-and-forget ───────────────────────────────────────────────────────
  // We return the runId immediately; the client polls /api/agents/status/[runId].
  // runAgentWorkforce writes all state to agent_runs + agent_findings directly.
  setImmediate(() => {
    runAgentWorkforce({
      runId,
      userId:         auth.userId,
      projectId:      resolvedProjectId,
      agentType:      agentType as AgentType,
      stage,
      startupTitle,
      startupSummary,
      problem,
      targetUsers,
      maxIterations:  3,
    }).catch(async (err) => {
      await admin
        .from("agent_runs")
        .update({ status: "error", current_action: String(err).slice(0, 200), updated_at: new Date().toISOString() })
        .eq("id", runId);
    });
  });

  return NextResponse.json({ ok: true, runId });
}

/**
 * app/api/project/stage-evidence/route.ts
 *
 * GET  /api/project/stage-evidence?projectId=uuid&fromStage=Launch&toStage=Growth
 *   → submitted evidence rows for this transition + computed completeness
 *     against the requirement for the target stage (null requirement for a
 *     non-forward move — see lib/server/stageEvidence.ts). All five
 *     forward transitions (Validation, MVP, Launch, Growth, Revenue) have
 *     a real, fully-built requirement, not just Launch -> Growth.
 *
 * POST /api/project/stage-evidence
 *   → record one typed evidence row (metric | artifact | experiment | founder_judgment).
 *     This does not gate anything itself — the Projects-page stage picker
 *     decides whether to show the evidence review at all, and manual stage
 *     selection remains an override regardless of completeness.
 *
 * DELETE /api/project/stage-evidence?id=uuid&projectId=uuid
 *   → founder corrects/removes a submitted evidence row.
 *
 * PATCH /api/project/stage-evidence   { projectId, toStage }
 *   → the ONLY way a project's stage changes. A forward move needs at least one evidence row for
 *     that transition (STAGE_GATE_MIN_EVIDENCE_ROWS); a backward move is a correction and needs none.
 *     It does not complete earlier milestones or tasks. It lives here, not in a new route, to stay
 *     inside the Vercel Hobby function limit.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { loadConnectedFacts } from "@/lib/integrations/facts";
import { suggestEvidence, type EvidenceSuggestion } from "@/lib/stageEvidenceSuggest";
import {
  getStageEvidenceRequirement,
  computeStageEvidenceCompleteness,
  validateStageEvidenceInput,
  STAGE_EVIDENCE_TYPES,
  stageMoveAllowed,
  STAGE_GATE_MIN_EVIDENCE_ROWS,
  type StageEvidenceRow,
} from "@/lib/server/stageEvidence";

const SELECT_COLUMNS =
  "id, evidence_type, metric_name, metric_value, metric_date, artifact_description, artifact_url, experiment_channel, experiment_hypothesis, experiment_outcome, judgment_text, created_at";

const EvidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  fromStage: z.string().min(1).max(40),
  toStage: z.string().min(1).max(40),
  evidence_type: z.enum(STAGE_EVIDENCE_TYPES as unknown as [string, ...string[]]),
  metric_name: z.string().max(200).optional(),
  metric_value: z.string().max(200).optional(),
  metric_date: z.string().max(20).optional(),
  artifact_description: z.string().max(1000).optional(),
  artifact_url: z.string().max(500).optional(),
  experiment_channel: z.string().max(200).optional(),
  experiment_hypothesis: z.string().max(1000).optional(),
  experiment_outcome: z.string().max(1000).optional(),
  judgment_text: z.string().max(2000).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const fromStage = searchParams.get("fromStage");
    const toStage = searchParams.get("toStage");
    if (!projectId || !fromStage || !toStage) {
      return NextResponse.json({ ok: false, error: "projectId, fromStage, and toStage are required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("project_stage_evidence")
      .select(SELECT_COLUMNS)
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .eq("from_stage", fromStage)
      .eq("to_stage", toStage)
      .order("created_at", { ascending: false });

    if (error) {
      logError("stage-evidence/GET", error, { userId: user.id, projectId });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as StageEvidenceRow[];
    const requirement = getStageEvidenceRequirement(fromStage, toStage);
    const completeness = requirement ? computeStageEvidenceCompleteness(requirement, rows) : null;

    // Optional: numbers from connected apps, offered one by one. Never saved here.
    let suggestions: EvidenceSuggestion[] = [];
    if (searchParams.get("suggest") === "1" && requirement) {
      try {
        const facts = await loadConnectedFacts(admin, user.id, { maxAgeMs: 6 * 3600_000 });
        const taken = new Set(rows.map((r) => `${r.metric_name ?? ""}|${r.artifact_description ?? ""}`));
        const { count: withInsights } = await admin.from("conversation_people").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("insights", "is", null).neq("insights", "[]");
        suggestions = suggestEvidence(facts, { withInsights: withInsights ?? 0 }).filter((s) => !taken.has(`${s.row.metric_name ?? ""}|${s.row.artifact_description ?? ""}`));
      } catch { /* suggestions are optional */ }
    }

    return NextResponse.json({ ok: true, rows, requirement, completeness, suggestions });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = EvidenceInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
    }
    const input = parsed.data;

    const validationError = validateStageEvidenceInput(input);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const admin = createAdminClient();

    // Confirm the project actually belongs to this founder before writing —
    // RLS covers this too, but a clear 403 is more useful than a silent
    // policy rejection on a form the founder is actively filling in.
    const { data: project, error: projectErr } = await admin
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (projectErr || !project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    const { data: inserted, error: insertError } = await admin
      .from("project_stage_evidence")
      .insert({
        project_id: input.projectId,
        user_id: user.id,
        from_stage: input.fromStage,
        to_stage: input.toStage,
        evidence_type: input.evidence_type,
        metric_name: input.metric_name ?? null,
        metric_value: input.metric_value ?? null,
        metric_date: input.metric_date ?? null,
        artifact_description: input.artifact_description ?? null,
        artifact_url: input.artifact_url ?? null,
        experiment_channel: input.experiment_channel ?? null,
        experiment_hypothesis: input.experiment_hypothesis ?? null,
        experiment_outcome: input.experiment_outcome ?? null,
        judgment_text: input.judgment_text ?? null,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) {
      logError("stage-evidence/POST", insertError, { userId: user.id, projectId: input.projectId });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    const { data: allRows } = await admin
      .from("project_stage_evidence")
      .select(SELECT_COLUMNS)
      .eq("user_id", user.id)
      .eq("project_id", input.projectId)
      .eq("from_stage", input.fromStage)
      .eq("to_stage", input.toStage)
      .order("created_at", { ascending: false });

    const rows = (allRows ?? []) as StageEvidenceRow[];
    const requirement = getStageEvidenceRequirement(input.fromStage, input.toStage);
    const completeness = requirement ? computeStageEvidenceCompleteness(requirement, rows) : null;

    return NextResponse.json({ ok: true, row: inserted, rows, completeness });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const projectId = searchParams.get("projectId");
    if (!id || !projectId) {
      return NextResponse.json({ ok: false, error: "id and projectId are required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error: deleteError } = await admin
      .from("project_stage_evidence")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      logError("stage-evidence/DELETE", deleteError, { userId: user.id, id });
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

const StageChangeSchema = z.object({
  projectId: z.string().uuid(),
  toStage: z.string().min(1).max(40),
});

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const parsed = StageChangeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }
    const { projectId, toStage } = parsed.data;

    const admin = createAdminClient();
    const { data: project } = await admin
      .from("projects")
      .select("id, startup_stage, stage_history")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

    const fromStage = String((project as { startup_stage?: string | null }).startup_stage ?? "Idea");
    if (fromStage === toStage) return NextResponse.json({ ok: true, stage: toStage, unchanged: true });

    const { count } = await admin
      .from("project_stage_evidence")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .eq("from_stage", fromStage)
      .eq("to_stage", toStage);

    if (!stageMoveAllowed(fromStage, toStage, count ?? 0)) {
      return NextResponse.json(
        {
          ok: false,
          code: "evidence_required",
          error: `Add at least ${STAGE_GATE_MIN_EVIDENCE_ROWS} piece of evidence before moving from ${fromStage} to ${toStage}.`,
        },
        { status: 409 },
      );
    }

    const history = Array.isArray((project as { stage_history?: unknown }).stage_history)
      ? ((project as { stage_history: unknown[] }).stage_history)
      : [];
    const { error: updateError } = await admin
      .from("projects")
      .update({
        startup_stage: toStage,
        stage_history: [...history, { from: fromStage, to: toStage, set_at: new Date().toISOString(), source: "manual", evidence_rows: count ?? 0 }],
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (updateError) {
      logError("stage-evidence/PATCH", updateError, { userId: user.id, projectId });
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
    // The "ready for the next stage" prompt is now out of date: clear it if it was about this project.
    try {
      const { data: ctx } = await admin.from("founder_context").select("pending_stage_transition").eq("user_id", user.id).maybeSingle();
      const pending = (ctx?.pending_stage_transition ?? null) as { project_id?: string } | null;
      if (pending?.project_id === projectId) {
        await admin.from("founder_context").update({ pending_stage_transition: null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      }
    } catch { /* the next check-in recomputes it anyway */ }
    return NextResponse.json({ ok: true, stage: toStage, from: fromStage });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

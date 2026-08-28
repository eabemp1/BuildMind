/**
 * app/api/risk-signals/route.ts
 *
 * GET  /api/risk-signals?projectId=uuid
 *   → recent signals + the computed churn risk assessment for that project.
 *     Backs Risk Interrupt and the risk-based Recovery Mode on Today.
 *
 * POST /api/risk-signals
 *   → log one founder-reported signal (a support ticket, an NPS score, a
 *     direct customer message/warning). See lib/riskSignals.ts for how
 *     these get turned into a churn probability + burn-at-risk figure.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeChurnRisk, type RiskSignal } from "@/lib/riskSignals";
import { logError } from "@/lib/server/logger";

const SignalInputSchema = z.object({
  projectId: z.string().uuid(),
  signalType: z.enum(["support_ticket", "nps_score", "customer_message", "other"]),
  severity: z.enum(["critical", "warning", "neutral", "positive"]).default("warning"),
  value: z.number().min(0).max(10000).optional(),
  note: z.string().min(1).max(500),
  customerName: z.string().max(200).optional(),
  mrrAtRisk: z.number().min(0).max(10_000_000).optional(),
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
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "projectId is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("project_risk_signals")
      .select("id, signal_type, severity, value, note, customer_name, mrr_at_risk, created_at")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      logError("risk-signals/GET", error, { userId: user.id, projectId });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const signals: RiskSignal[] = (data ?? []).map((row) => ({
      id: row.id,
      signal_type: row.signal_type,
      severity: row.severity,
      value: row.value,
      note: row.note,
      customer_name: row.customer_name,
      mrr_at_risk: row.mrr_at_risk,
      created_at: row.created_at,
    }));

    const assessment = computeChurnRisk(signals);

    return NextResponse.json({ ok: true, signals, assessment });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
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

    const parsed = SignalInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
    }
    const { projectId, signalType, severity, value, note, customerName, mrrAtRisk } = parsed.data;

    const admin = createAdminClient();

    // Confirm the project belongs to this user before writing — RLS also
    // enforces this, but failing fast here gives a clean 404 instead of a
    // silent RLS-denied insert.
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (projectError) {
      return NextResponse.json({ ok: false, error: projectError.message }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    const { data: inserted, error: insertError } = await admin
      .from("project_risk_signals")
      .insert({
        user_id: user.id,
        project_id: projectId,
        signal_type: signalType,
        severity,
        value: value ?? null,
        note,
        customer_name: customerName ?? null,
        mrr_at_risk: mrrAtRisk ?? null,
      })
      .select("id, signal_type, severity, value, note, customer_name, mrr_at_risk, created_at")
      .single();

    if (insertError) {
      logError("risk-signals/POST", insertError, { userId: user.id, projectId });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // Return the freshly recomputed assessment too, so the caller (Risk
    // Interrupt capture UI) can show the updated risk immediately without
    // a second round-trip.
    const { data: recent } = await admin
      .from("project_risk_signals")
      .select("id, signal_type, severity, value, note, customer_name, mrr_at_risk, created_at")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);

    const assessment = computeChurnRisk((recent ?? []) as RiskSignal[]);

    return NextResponse.json({ ok: true, signal: inserted, assessment });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
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
      .from("project_risk_signals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id); // RLS also enforces this — belt and suspenders on a delete

    if (deleteError) {
      logError("risk-signals/DELETE", deleteError, { userId: user.id, id });
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    // Recomputed assessment reflects the removal immediately, same as POST.
    const { data: recent } = await admin
      .from("project_risk_signals")
      .select("id, signal_type, severity, value, note, customer_name, mrr_at_risk, created_at")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);

    const assessment = computeChurnRisk((recent ?? []) as RiskSignal[]);

    return NextResponse.json({ ok: true, assessment });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

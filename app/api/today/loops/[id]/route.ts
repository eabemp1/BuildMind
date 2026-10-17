/**
 * PATCH /api/today/loops/:id
 *   { action: "record", evidence, result?, metric_value?, metric_label? }
 *   { action: "snooze", choice }
 *   { action: "dismiss" }
 *
 * Recording evidence also writes a reflection row, so the next Today task and
 * the facts ledger are built from what actually happened.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { DURATION_CHOICES, canSnooze, evidenceAsReflection, snoozedDueAt } from "@/lib/today/loops";
import { logQualityEvent } from "@/lib/today/telemetry";

export const dynamic = "force-dynamic";

const choices = Object.keys(DURATION_CHOICES) as [keyof typeof DURATION_CHOICES, ...(keyof typeof DURATION_CHOICES)[]];
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    evidence: z.string().trim().min(2).max(1000),
    result: z.enum(["worked", "mixed", "failed"]).optional(),
    metric_value: z.number().finite().optional(),
    metric_label: z.string().trim().max(60).optional(),
  }),
  z.object({ action: z.literal("snooze"), choice: z.enum(choices) }),
  z.object({ action: z.literal("dismiss") }),
]);

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;

  const admin = createAdminClient();
  const { data: loop } = await admin
    .from("today_loops").select("id, project_id, task_text, measure, status, snooze_count")
    .eq("id", id).eq("user_id", user.userId).maybeSingle();
  if (!loop) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (loop.status !== "open") return NextResponse.json({ ok: true, already: loop.status });

  const now = new Date().toISOString();

  if (b.action === "snooze") {
    if (!canSnooze(loop)) return NextResponse.json({ ok: false, error: "Snoozed too many times. Record what you have, or dismiss it." }, { status: 409 });
    await admin.from("today_loops").update({ due_at: snoozedDueAt(b.choice), snooze_count: loop.snooze_count + 1, notified_at: null }).eq("id", id).eq("user_id", user.userId);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "dismiss") {
    await admin.from("today_loops").update({ status: "dismissed", resolved_at: now }).eq("id", id).eq("user_id", user.userId);
    return NextResponse.json({ ok: true });
  }

  await admin.from("today_loops").update({
    status: "recorded", resolved_at: now, evidence: b.evidence, result: b.result ?? null,
    metric_value: b.metric_value ?? null, metric_label: b.metric_label ?? null,
  }).eq("id", id).eq("user_id", user.userId);

  // Feed the result back as a reflection (best-effort).
  try {
    const r = evidenceAsReflection(loop, b.evidence, b.result);
    await admin.from("reflections").insert({
      user_id: user.userId, project_id: loop.project_id ?? null, outcome: r.outcome,
      today_action: r.today_action, what_tried: r.what_tried, what_happened: r.what_happened,
      what_learned: r.what_learned, note: r.note, confidence: 3, created_at: now,
    });
  } catch { /* the loop is recorded either way */ }
  void logQualityEvent(admin, { userId: user.userId, projectId: loop.project_id, kind: "loop_recorded", task: loop.task_text, detail: b.result ?? null });
  return NextResponse.json({ ok: true });
}

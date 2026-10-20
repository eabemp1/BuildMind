/**
 * POST /api/ai/prep — prepare today's task.
 *
 * Detects what kind of work the task is and returns a first draft (messages, a
 * post, landing copy, an SEO brief, an investor update, a competitor brief, an
 * interview kit, a video script). One preparation per task per day is cached,
 * so reopening Today costs nothing. Nothing is sent or posted for the founder.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePrep, loadLearnRows } from "@/lib/prep/engine";
import { fallbackPrep } from "@/lib/prep/fallback";
import { PREP_META, prepKindFor, taskHash, type PrepKind, type Prepared } from "@/lib/prep/kinds";
import { learnedLessons, performance } from "@/lib/prep/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  task: z.string().min(4).max(600),
  missionKind: z.string().max(40).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  firstStep: z.string().max(400).optional(),
  regenerate: z.boolean().optional(),
  idea: z.string().max(1500).optional(),
});

type Row = { id: string; kind: PrepKind; payload: Prepared; chosen_variant: string | null; final_text: string | null; status: string; outcome: string | null; corrections: number };
const today = () => new Date().toISOString().slice(0, 10);

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const { task, missionKind, projectId, firstStep, regenerate, idea } = parsed.data;

  const kind = prepKindFor(task, missionKind);
  if (!kind) return NextResponse.json({ ok: true, prep: null, reason: "no_task" });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, prep: null, reason: "unavailable" });

  const admin = createAdminClient();
  const hash = taskHash(task, kind);
  const day = today();

  const summary = async () => {
    if (!PREP_META[kind].learns) return { learned: [] as string[], performance: null };
    const rows = await loadLearnRows(admin, user.userId);
    return { learned: learnedLessons(rows, kind), performance: performance(rows, kind) };
  };

  try {
    if (!regenerate) {
      const { data: hit, error: hitError } = await admin.from("prepared_work").select("id,kind,payload,chosen_variant,final_text,status,outcome,corrections").eq("user_id", user.userId).eq("day", day).eq("task_hash", hash).maybeSingle();
      if (hitError) throw new Error(hitError.message);
      // A starting structure from an earlier failed attempt is not served from cache: try again.
      if (hit && !(hit as Row).payload?.degraded) {
        const r = hit as Row;
        return NextResponse.json({ ok: true, prep: { id: r.id, kind: r.kind, prepared: r.payload, chosenVariant: r.chosen_variant, finalText: r.final_text, status: r.status, outcome: r.outcome, corrections: r.corrections, cached: true, ...(await summary()) } });
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 160) : "";
    // The table is missing (migration not run). Still prepare and show the work, unsaved.
    const unsaved = await generatePrep(admin, user.userId, { task, missionKind, projectId, firstStep, idea }).catch(() => null);
    const prepared = unsaved?.prepared ?? fallbackPrep(kind, task, firstStep);
    return NextResponse.json({ ok: true, reason: "setup", detail, prep: { id: null, kind, prepared, chosenVariant: null, finalText: null, status: "prepared", outcome: null, corrections: 0, cached: false, learned: [], performance: null } });
  }

  const blocked = await gateAIUsage(user.userId, "core");
  if (blocked) return blocked;

  const generated = await generatePrep(admin, user.userId, { task, missionKind, projectId, firstStep, idea }).catch(() => null);
  // Never return nothing: if generation failed, the founder still gets a starting structure from their own task.
  const result = generated ?? { kind, platform: "other", prepared: fallbackPrep(kind, task, firstStep) };

  const { data: saved, error } = await admin.from("prepared_work").upsert({
    user_id: user.userId, project_id: projectId ?? null, day, task_hash: hash, task_text: task.slice(0, 600),
    kind: result.kind, platform: result.platform, payload: result.prepared,
    chosen_variant: null, final_text: null, edit_ratio: null, status: "prepared", outcome: null, outcome_at: null, corrections: 0, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,day,task_hash" }).select("id").single();
  if (error || !saved) return NextResponse.json({ ok: true, reason: "setup", detail: (error?.message ?? "").slice(0, 160), prep: { id: null, kind: result.kind, prepared: result.prepared, chosenVariant: null, finalText: null, status: "prepared", outcome: null, corrections: 0, cached: false, learned: [], performance: null } });

  return NextResponse.json({ ok: true, prep: { id: saved.id as string, kind: result.kind, prepared: result.prepared, chosenVariant: null, finalText: null, status: "prepared", outcome: null, corrections: 0, cached: false, ...(await summary()) } });
}

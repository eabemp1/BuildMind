/**
 * GET  /api/today/loops   — this founder's follow-ups: { due, upcoming }.
 * POST /api/today/loops   — create a follow-up ("check back in N days").
 *
 * "When is it due" is pure arithmetic (lib/today/loops.ts). The Today page
 * asks this endpoint on every load, so a due follow-up shows up even if the
 * reminder cron has not run yet.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { DURATION_CHOICES, MAX_OPEN_LOOPS, dueAtFor, partitionLoops, type Loop } from "@/lib/today/loops";

export const dynamic = "force-dynamic";

const COLS = "id, project_id, task_text, measure, due_at, status, snooze_count, notified_at, evidence, result, created_at";

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("today_loops").select(COLS)
      .eq("user_id", user.userId).eq("status", "open")
      .order("due_at", { ascending: true }).limit(40);
    if (error) return NextResponse.json({ ok: true, due: [], upcoming: [], unavailable: true });
    const { due, upcoming } = partitionLoops((data ?? []) as Loop[]);
    return NextResponse.json({ ok: true, due, upcoming });
  } catch {
    return NextResponse.json({ ok: true, due: [], upcoming: [], unavailable: true });
  }
}

const Create = z.object({
  task_text: z.string().trim().min(3).max(500),
  measure: z.string().trim().min(3).max(300),
  choice: z.enum(Object.keys(DURATION_CHOICES) as [keyof typeof DURATION_CHOICES, ...(keyof typeof DURATION_CHOICES)[]]),
  projectId: z.string().uuid().nullish(),
});

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = await rateLimitAsync(`today-loops:${user.userId}:${getClientIp(request)}`, 30, 60 * 60 * 1000, { failClosed: false });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many follow-ups. Try again later." }, { status: 429 });

  const parsed = Create.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid follow-up", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;

  const admin = createAdminClient();
  const { count } = await admin.from("today_loops").select("id", { count: "exact", head: true }).eq("user_id", user.userId).eq("status", "open");
  if ((count ?? 0) >= MAX_OPEN_LOOPS) {
    return NextResponse.json({ ok: false, error: `You already have ${MAX_OPEN_LOOPS} open follow-ups. Record one first.` }, { status: 409 });
  }
  // Idempotent: the same task + measure is never queued twice.
  const { data: dup } = await admin.from("today_loops").select("id").eq("user_id", user.userId).eq("status", "open").eq("task_text", b.task_text).maybeSingle();
  if (dup?.id) return NextResponse.json({ ok: true, id: dup.id, duplicate: true });

  const { data, error } = await admin.from("today_loops").insert({
    user_id: user.userId,
    project_id: b.projectId ?? null,
    task_text: b.task_text,
    measure: b.measure,
    due_at: dueAtFor(b.choice),
  }).select("id, due_at").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not save the follow-up" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id, due_at: data?.due_at });
}

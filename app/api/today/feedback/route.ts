/**
 * POST /api/today/feedback — one-tap "this task doesn't fit me".
 * The reason becomes a fact in the ledger (lib/today/facts.ts) that the
 * generator must respect and the guards enforce on the next task.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { logQualityEvent } from "@/lib/today/telemetry";

export const dynamic = "force-dynamic";

const Body = z.object({
  task_text: z.string().trim().min(3).max(500),
  reason: z.enum(["no_users", "no_access", "already_done", "too_big", "not_relevant", "no_time"]),
  note: z.string().trim().max(300).optional(),
  projectId: z.string().uuid().nullish(),
});

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = await rateLimitAsync(`today-feedback:${user.userId}:${getClientIp(request)}`, 40, 60 * 60 * 1000, { failClosed: false });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid feedback", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("today_feedback").insert({
    user_id: user.userId, project_id: b.projectId ?? null, task_text: b.task_text, reason: b.reason, note: b.note ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: "Could not save feedback" }, { status: 500 });
  void logQualityEvent(admin, { userId: user.userId, projectId: b.projectId, kind: "feedback", rules: [b.reason], task: b.task_text, detail: b.note });
  return NextResponse.json({ ok: true });
}

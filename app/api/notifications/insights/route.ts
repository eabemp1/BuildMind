/**
 * app/api/notifications/insights/route.ts
 *
 * GET /api/notifications/insights?projectId=...
 * Returns data-rich notifications (today's task, weekly pace, momentum,
 * overdue milestones, stage readiness, avoidance) computed from the
 * founder's real records. Read-only; the client decides what to display.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildInsightNotifications } from "@/lib/server/notificationInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() || undefined;
    const items = await buildInsightNotifications(user.id, projectId);
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: false, error: "insights_failed" }, { status: 500 });
  }
}

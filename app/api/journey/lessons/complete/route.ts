/**
 * app/api/journey/lessons/complete/route.ts
 * POST { lesson_id } — marks a lesson complete for the authenticated
 * student/mentor and awards lesson_completed XP (idempotent — replaying
 * this never double-awards, see lib/journey.ts::hasCompletedActivity).
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { completeLesson } from "@/lib/journey";
import { isJourneyStudentEmail } from "@/lib/server/journeyAuth";
import { isAdminUser } from "@/lib/server/adminAuth";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const allowed = isJourneyStudentEmail(userResult.user.email) || (await isAdminUser(userResult.user.id));
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { lesson_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.lesson_id) {
    return NextResponse.json({ ok: false, error: "lesson_id is required" }, { status: 400 });
  }

  try {
    const result = await completeLesson("user_id", userResult.user.id, body.lesson_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError("api.journey.lessons.complete", err);
    const msg = err instanceof Error ? err.message : "Failed to record lesson completion";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

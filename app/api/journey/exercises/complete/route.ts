/**
 * app/api/journey/exercises/complete/route.ts
 * POST { exercise_id } — marks an exercise complete, awards exercise_completed XP.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { completeExercise } from "@/lib/journey";
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

  let body: { exercise_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.exercise_id) {
    return NextResponse.json({ ok: false, error: "exercise_id is required" }, { status: 400 });
  }

  try {
    const result = await completeExercise("user_id", userResult.user.id, body.exercise_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError("api.journey.exercises.complete", err);
    const msg = err instanceof Error ? err.message : "Failed to record exercise completion";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * app/api/journey/s/[token]/exercises/complete/route.ts
 * POST { exercise_id } — token-link equivalent of /api/journey/exercises/complete.
 */
import { NextResponse } from "next/server";
import { getStudentByToken } from "@/lib/journeyAccess";
import { completeExercise } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await getStudentByToken(token);
  if (!student) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
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
    const result = await completeExercise("student_id", student.id, body.exercise_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError("api.journey.s.exercises.complete", err);
    return NextResponse.json({ ok: false, error: "Failed to record exercise completion" }, { status: 500 });
  }
}

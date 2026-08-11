/**
 * app/api/journey/s/[token]/lessons/complete/route.ts
 * POST { lesson_id } — token-link equivalent of /api/journey/lessons/complete.
 */
import { NextResponse } from "next/server";
import { getStudentByToken } from "@/lib/journeyAccess";
import { completeLesson } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await getStudentByToken(token);
  if (!student) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
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
    const result = await completeLesson("student_id", student.id, body.lesson_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError("api.journey.s.lessons.complete", err);
    return NextResponse.json({ ok: false, error: "Failed to record lesson completion" }, { status: 500 });
  }
}

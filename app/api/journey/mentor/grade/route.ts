/**
 * app/api/journey/mentor/grade/route.ts
 * POST { submission_id, score, category_scores?, feedback?, strengths?, weaknesses?, required_fixes? }
 * Mentor-only (profiles.is_admin = true). AI is never the final grading
 * authority (master prompt §9) — this route only accepts a human-entered
 * score; there is no AI auto-grade path anywhere in Phase 1.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { gradeSubmission, type GradeInput } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const isMentor = await isAdminUser(userResult.user.id);
  if (!isMentor) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { submission_id?: string } & GradeInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.submission_id) {
    return NextResponse.json({ ok: false, error: "submission_id is required" }, { status: 400 });
  }
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return NextResponse.json({ ok: false, error: "score must be a number 0-100" }, { status: 400 });
  }

  try {
    const grade = await gradeSubmission(userResult.user.id, body.submission_id, {
      score,
      category_scores: body.category_scores,
      feedback: body.feedback,
      strengths: body.strengths,
      weaknesses: body.weaknesses,
      required_fixes: body.required_fixes,
    });
    return NextResponse.json({ ok: true, grade });
  } catch (err) {
    logError("api.journey.mentor.grade", err);
    const msg = err instanceof Error ? err.message : "Failed to record grade";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

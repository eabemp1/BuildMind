/**
 * app/api/journey/s/[token]/progress/route.ts
 * GET — progress summary for the link-holder identified by token.
 */
import { NextResponse } from "next/server";
import { getStudentByToken } from "@/lib/journeyAccess";
import { getProgressForStudent } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await getStudentByToken(token);
  if (!student) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const progress = await getProgressForStudent(student.id);
    return NextResponse.json({ ok: true, studentName: student.name, progress });
  } catch (err) {
    logError("api.journey.s.progress", err);
    return NextResponse.json({ ok: false, error: "Failed to load progress" }, { status: 500 });
  }
}

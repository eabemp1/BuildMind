/**
 * app/api/journey/s/[token]/today/route.ts
 * GET — today's mission for whoever holds this link. No auth session
 * required; the token itself is the credential (matches /api/promote/[token]).
 */
import { NextResponse } from "next/server";
import { getStudentByToken } from "@/lib/journeyAccess";
import { getTodayMissionForStudent } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await getStudentByToken(token);
  if (!student) {
    // 404, not 401/403 — don't confirm or deny whether a token is "close".
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const mission = await getTodayMissionForStudent(student.id);
    return NextResponse.json({ ok: true, studentName: student.name, mission });
  } catch (err) {
    logError("api.journey.s.today", err);
    return NextResponse.json({ ok: false, error: "Failed to load today's mission" }, { status: 500 });
  }
}

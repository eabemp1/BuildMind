/**
 * app/api/journey/s/[token]/submit/route.ts
 * POST { project_id, repository_url?, notes? } — records a new submission
 * version for the link-holder. Never overwrites a prior submission.
 */
import { NextResponse } from "next/server";
import { getStudentByToken } from "@/lib/journeyAccess";
import { submitProjectForStudent } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await getStudentByToken(token);
  if (!student) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: { project_id?: string; repository_url?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.project_id) {
    return NextResponse.json({ ok: false, error: "project_id is required" }, { status: 400 });
  }
  if (!body.repository_url && !body.notes) {
    return NextResponse.json(
      { ok: false, error: "Provide at least a repository_url or notes" },
      { status: 400 },
    );
  }

  try {
    const submission = await submitProjectForStudent(student.id, body.project_id, body);
    return NextResponse.json({ ok: true, submission });
  } catch (err) {
    logError("api.journey.s.submit", err);
    return NextResponse.json({ ok: false, error: "Failed to submit project" }, { status: 500 });
  }
}

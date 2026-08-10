/**
 * app/api/journey/s/[token]/start/route.ts
 * POST { module_order, deadline? } — starts (idempotent) a project for the
 * link-holder identified by token.
 */
import { NextResponse } from "next/server";
import { getStudentByToken } from "@/lib/journeyAccess";
import { startProjectForStudent } from "@/lib/journey";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await getStudentByToken(token);
  if (!student) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: { module_order?: number; deadline?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const moduleOrder = Number(body.module_order);
  if (!Number.isInteger(moduleOrder) || moduleOrder < 1 || moduleOrder > 16) {
    return NextResponse.json({ ok: false, error: "module_order must be an integer 1-16" }, { status: 400 });
  }

  try {
    const project = await startProjectForStudent(student.id, moduleOrder, body.deadline ?? null);
    return NextResponse.json({ ok: true, project });
  } catch (err) {
    logError("api.journey.s.start", err);
    return NextResponse.json({ ok: false, error: "Failed to start project" }, { status: 500 });
  }
}

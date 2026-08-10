/**
 * app/api/journey/projects/start/route.ts
 * POST { module_order, deadline? } — starts (idempotent) the project for a module.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { startProject } from "@/lib/journey";
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
    const project = await startProject(userResult.user.id, moduleOrder, body.deadline ?? null);
    return NextResponse.json({ ok: true, project });
  } catch (err) {
    logError("api.journey.projects.start", err);
    const msg = err instanceof Error ? err.message : "Failed to start project";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

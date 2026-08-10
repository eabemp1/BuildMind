/**
 * app/api/journey/progress/route.ts
 * GET — returns the student's overall progress: module position, projects,
 * and latest skill-evidence level per skill.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { getProgress } from "@/lib/journey";
import { isJourneyStudentEmail } from "@/lib/server/journeyAuth";
import { isAdminUser } from "@/lib/server/adminAuth";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const allowed = isJourneyStudentEmail(userResult.user.email) || (await isAdminUser(userResult.user.id));
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const progress = await getProgress(userResult.user.id);
    return NextResponse.json({ ok: true, progress });
  } catch (err) {
    logError("api.journey.progress", err);
    const msg = err instanceof Error ? err.message : "Failed to load progress";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

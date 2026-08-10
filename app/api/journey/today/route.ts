/**
 * app/api/journey/today/route.ts
 * GET — returns the student's Today mission (current module, project, milestone).
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { getTodayMission } from "@/lib/journey";
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
    const mission = await getTodayMission(userResult.user.id);
    return NextResponse.json({ ok: true, mission });
  } catch (err) {
    logError("api.journey.today", err);
    const msg = err instanceof Error ? err.message : "Failed to load today mission";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

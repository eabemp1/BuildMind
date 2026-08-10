/**
 * app/api/journey/projects/[id]/submit/route.ts
 * POST { repository_url?, notes? } — records a new submission version.
 * Never overwrites a previous submission (master prompt §8).
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { submitProject } from "@/lib/journey";
import { isJourneyStudentEmail } from "@/lib/server/journeyAuth";
import { isAdminUser } from "@/lib/server/adminAuth";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const allowed = isJourneyStudentEmail(userResult.user.email) || (await isAdminUser(userResult.user.id));
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { repository_url?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.repository_url && !body.notes) {
    return NextResponse.json(
      { ok: false, error: "Provide at least a repository_url or notes" },
      { status: 400 },
    );
  }

  try {
    const submission = await submitProject(userResult.user.id, projectId, body);
    return NextResponse.json({ ok: true, submission });
  } catch (err) {
    logError("api.journey.projects.submit", err);
    const msg = err instanceof Error ? err.message : "Failed to submit project";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * app/api/journey/mentor/submissions/route.ts
 * GET — mentor-only. Lists submissions awaiting review across students.
 *
 * "Mentor" == profiles.is_admin = true (see lib/server/adminAuth.ts). There is
 * no separate mentor role/relationship table — see Phase 0 audit, section I,
 * and the migration file header for why.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const isMentor = await isAdminUser(userResult.user.id);
  if (!isMentor) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("journey_submissions")
      .select(
        "id, project_id, user_id, student_id, version, repository_url, notes, submitted_at, status, journey_projects(title, module_order)",
      )
      .eq("status", "awaiting_review")
      .order("submitted_at", { ascending: true });

    if (error) throw error;

    // Attach student display names for the token-link identity (user_id
    // rows have no equivalent lookup needed — that's the mentor's own
    // BuildMind account context, name isn't relevant there).
    const studentIds = Array.from(
      new Set((data ?? []).map((s) => s.student_id).filter((id): id is string => Boolean(id))),
    );
    let namesById: Record<string, string> = {};
    if (studentIds.length > 0) {
      const { data: students } = await admin
        .from("journey_students")
        .select("id, name")
        .in("id", studentIds);
      namesById = Object.fromEntries((students ?? []).map((s) => [s.id, s.name]));
    }

    const submissions = (data ?? []).map((s) => ({
      ...s,
      student_name: s.student_id ? namesById[s.student_id] ?? "Student" : null,
    }));

    return NextResponse.json({ ok: true, submissions });
  } catch (err) {
    logError("api.journey.mentor.submissions", err);
    const msg = err instanceof Error ? err.message : "Failed to load submissions";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

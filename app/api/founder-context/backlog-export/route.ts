/**
 * app/api/founder-context/backlog-export/route.ts
 *
 * GET → the founder's own backlog as a downloadable file. Sibling of
 * /api/founder-context/intelligence-export, and the target of the download
 * links on the AI Coach's list_backlog result card.
 *
 *   ?projectId=…   defaults to the most recently updated project
 *   ?status=open|completed|all   (default open)
 *   ?milestone=…   case-insensitive substring of a milestone title
 *   ?format=json|csv   (default json)
 *
 * Uses the SAME fetchBacklog/shapeBacklog the coach action uses, so the file
 * and the card can't disagree about what "open" means. Ownership is checked
 * against the authenticated user inside fetchBacklog — projectId from the
 * query string is never trusted on its own.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBacklog, shapeBacklog, backlogToCSV } from "@/lib/coachActions/backlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  status: z.enum(["open", "completed", "all"]).default("open"),
  milestone: z.string().trim().min(1).max(80).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    milestone: url.searchParams.get("milestone") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid query." }, { status: 400 });
  const { status, milestone, format } = parsed.data;

  const admin = createAdminClient();
  let projectId = url.searchParams.get("projectId") || "";
  if (!projectId) {
    const { data: project } = await admin
      .from("projects").select("id").eq("user_id", user.id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    projectId = project?.id ?? "";
  }
  if (!projectId) return NextResponse.json({ ok: false, error: "No project found" }, { status: 404 });

  const fetched = await fetchBacklog(admin, user.id, projectId);
  if (!fetched.ok) return NextResponse.json({ ok: false, error: fetched.error }, { status: fetched.status });

  const now = new Date();
  const view = shapeBacklog(fetched.milestones, fetched.tasks, { status, milestone }, now);
  const stamp = now.toISOString().slice(0, 10);

  if (format === "csv") {
    return new NextResponse(backlogToCSV(view.items), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="buildmind-backlog-${status}-${stamp}.csv"`,
      },
    });
  }

  return new NextResponse(
    JSON.stringify({
      ok: true,
      data: {
        generatedAt: now.toISOString(),
        projectId,
        filters: { status, milestone: milestone ?? null },
        totals: {
          matching: view.totalMatching,
          projectOpen: view.openCount,
          projectCompleted: view.completedCount,
        },
        milestoneNotFound: view.milestoneNotFound,
        tasks: view.items,
      },
    }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="buildmind-backlog-${status}-${stamp}.json"`,
      },
    },
  );
}

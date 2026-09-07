/**
 * app/api/founder-context/intelligence-export/route.ts
 *
 * GET → the founder's own Founder Execution Intelligence data, as an
 * actual downloadable output — not another in-app page. Default JSON
 * (the full report, including the nested FounderIntelligenceState).
 * ?format=csv returns just the standing trend as rows, for anyone who
 * wants to drop 30 days of readiness/engagement into a spreadsheet.
 * ?history=true additionally includes up to 30 days of past full-state
 * snapshots (founder_intelligence_log) — omitted by default since it's
 * the heaviest part of the payload and most callers just want today's
 * report, not a month of nested state objects.
 *
 * This route computes nothing new — see founderIntelligenceExport.ts's
 * header for why. It's the export surface, not a new source of truth.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFounderIntelligenceReport, standingTrendToCSV, getIntelligenceHistory } from "@/lib/server/founderIntelligenceExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  let projectId = url.searchParams.get("projectId") || "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const wantsHistory = url.searchParams.get("history") === "true";

  if (!projectId) {
    const admin = createAdminClient();
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    projectId = project?.id ?? "";
  }
  if (!projectId) return NextResponse.json({ ok: false, error: "No project found" }, { status: 404 });

  const report = await buildFounderIntelligenceReport(user.id, projectId);
  if (!report) return NextResponse.json({ ok: false, error: "Could not build report" }, { status: 404 });

  if (format === "csv") {
    const csv = standingTrendToCSV(report.standingTrend);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="buildmind-standing-${projectId}.csv"`,
      },
    });
  }

  const history = wantsHistory ? await getIntelligenceHistory(projectId, 30) : null;
  return new NextResponse(JSON.stringify({ ok: true, data: { ...report, history } }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="buildmind-intelligence-${projectId}.json"`,
    },
  });
}

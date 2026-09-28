/**
 * app/api/founder-context/execution-log-export/route.ts
 *
 * GET → the founder's execution record (every Today action logged in the
 * window, with its outcome) as a downloadable file. Target of the download
 * links on the AI Coach's get_execution_log card.
 *
 *   ?days=14            1–90
 *   ?format=json|csv    (default json)
 *
 * Same fetchExecutionLog/shapeExecutionLog the coach card uses, so the file
 * and the card can't disagree. Scoped to the authenticated user; nothing in
 * the query string can address another user's rows.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchExecutionLog, shapeExecutionLog, executionLogToCSV } from "@/lib/coachActions/executionLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    days: url.searchParams.get("days") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid query." }, { status: 400 });
  const { days, format } = parsed.data;

  const now = new Date();
  const fetched = await fetchExecutionLog(createAdminClient(), user.id, days, now);
  if (!fetched.ok) return NextResponse.json({ ok: false, error: fetched.error }, { status: fetched.status });

  const view = shapeExecutionLog(fetched.rows, days, now, fetched.truncated);
  const stamp = now.toISOString().slice(0, 10);

  if (format === "csv") {
    return new NextResponse(executionLogToCSV(view.entries), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="buildmind-execution-log-${days}d-${stamp}.csv"`,
      },
    });
  }

  return new NextResponse(
    JSON.stringify({
      ok: true,
      data: {
        generatedAt: now.toISOString(),
        windowDays: days,
        timezoneNote: "All timestamps are UTC.",
        truncated: view.truncated,
        counts: view.counts,
        daysWithCompletion: view.daysWithCompletion,
        entries: view.entries,
      },
    }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="buildmind-execution-log-${days}d-${stamp}.json"`,
      },
    },
  );
}

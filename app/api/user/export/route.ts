/**
 * GET /api/user/export?format=json|report|csv|manifest[&table=<name>]
 *
 *   json      the complete machine-readable export (manifest included)
 *   report    a readable HTML summary (open it, or print to PDF)
 *   csv       ONE flat table as CSV (needs table=); nested columns are left out and named in a header
 *   manifest  what a download contains, without reading any of your rows
 *
 * Privacy: only the signed-in user's own id is ever used for queries (there is no id in the request to change),
 * responses are never cached, and nothing is stored on the server: the file exists only in this response.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { buildDataExport, describeExport } from "@/lib/dataExport";
import { buildReportHtml, csvTables, toCsv } from "@/lib/dataExportFormats";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORMATS = ["json", "report", "csv", "manifest"] as const;
type Format = (typeof FORMATS)[number];

const SAFE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: SAFE_HEADERS });

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "json") as Format;
  if (!FORMATS.includes(format)) return NextResponse.json({ ok: false, error: "Choose json, report, csv or manifest." }, { status: 400, headers: SAFE_HEADERS });

  if (format === "manifest") {
    const preview = await rateLimitAsync(`data-export-preview:${user.id}`, 60, 60 * 60 * 1000);
    if (!preview.ok) return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429, headers: SAFE_HEADERS });
    return NextResponse.json({ ok: true, schema_version: "2.0", ...describeExport() }, { headers: SAFE_HEADERS });
  }

  const limit = await rateLimitAsync(`data-export:${user.id}`, 8, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "You have downloaded several times this hour. Try again later." }, { status: 429, headers: SAFE_HEADERS });

  try {
    const data = await buildDataExport(createAdminClient(), { id: user.id, email: user.email });
    const day = data.exported_at.slice(0, 10);
    const complete = String(data.complete);

    if (format === "report") {
      return new NextResponse(buildReportHtml(data), {
        status: 200,
        headers: { ...SAFE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="buildmind-report-${day}.html"`, "X-Export-Complete": complete },
      });
    }

    if (format === "csv") {
      const table = url.searchParams.get("table") ?? "";
      const allowed = csvTables(data);
      if (!allowed.some((t) => t.table === table)) {
        return NextResponse.json({ ok: false, error: "Choose one of the tables that can be saved as CSV.", tables: allowed }, { status: 400, headers: SAFE_HEADERS });
      }
      const out = toCsv(data.tables[table] as Record<string, unknown>[]);
      return new NextResponse(out.csv, {
        status: 200,
        headers: {
          ...SAFE_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="buildmind-${table}-${day}.csv"`,
          "X-Export-Complete": complete,
          "X-Export-Rows": String(out.rows),
          "X-Export-Omitted-Columns": out.omitted.join(","),
        },
      });
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: { ...SAFE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="buildmind-data-${day}.json"`, "X-Export-Complete": complete, "X-Export-Rows": String(data.summary.total_rows) },
    });
  } catch (err) {
    logError("user/export", err, { userId: user.id, route: "/api/user/export" });
    return NextResponse.json({ ok: false, error: "Could not build your export. Try again in a moment." }, { status: 500, headers: SAFE_HEADERS });
  }
}

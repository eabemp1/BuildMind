/** GET /api/user/export - the signed-in founder's own data as a JSON download. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { buildDataExport } from "@/lib/dataExport";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimitAsync(`data-export:${user.id}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "You have exported a few times this hour. Try again later." }, { status: 429 });

  try {
    const data = await buildDataExport(createAdminClient(), { id: user.id, email: user.email });
    const day = data.exported_at.slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="buildmind-data-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logError("user/export", err, { userId: user.id, route: "/api/user/export" });
    return NextResponse.json({ ok: false, error: "Could not build your export. Try again in a moment." }, { status: 500 });
  }
}

/**
 * GET /api/today/pinned — the Break My Startup test the founder pinned that is still steering Today, if any.
 * Read-only. The Today page uses it to offer "Not this one", which releases the pin through /api/break-predictions/choose.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { activePin, type BreakPredictionRow } from "@/lib/agentToToday";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, pin: null }, { headers: H });
  try {
    const { data, error } = await createAdminClient().from("break_predictions").select("id, project_id, tests, created_at").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(5);
    if (error) return NextResponse.json({ ok: true, pin: null }, { headers: H });
    return NextResponse.json({ ok: true, pin: activePin((data ?? []) as BreakPredictionRow[], null) }, { headers: H });
  } catch {
    return NextResponse.json({ ok: true, pin: null }, { headers: H });
  }
}

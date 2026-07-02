/**
 * app/api/blocker-insight/route.ts
 *
 * GET  /api/blocker-insight?userId=...  — returns active (undismissed) insight
 * PATCH /api/blocker-insight            — dismisses or marks acted_on
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { getActiveInsight, dismissInsight } from "@/lib/blockerIntelligence";
import { z } from "zod";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 10;

// GET — fetch the active blocker insight for the current user
export async function GET(request: Request) {
  try {
    const routeUser = await getRouteUser();
    if (!routeUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!hasAdminEnv()) return NextResponse.json({ success: true, data: null });

    const supabase = createAdminClient();
    const insight = await getActiveInsight(supabase, routeUser.userId);

    return NextResponse.json({ success: true, data: insight });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// PATCH — dismiss or mark acted_on
const PatchSchema = z.object({
  id:       z.string().uuid(),
  acted_on: z.boolean().default(false),
});

export async function PATCH(request: Request) {
  try {
    const routeUser = await getRouteUser();
    if (!routeUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!hasAdminEnv()) return NextResponse.json({ success: true });

    const body = await request.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });

    const supabase = createAdminClient();

    // Verify ownership before dismissing
    const { data: insight } = await supabase
      .from("blocker_insights")
      .select("user_id")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (!insight || insight.user_id !== routeUser.userId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await dismissInsight(supabase, parsed.data.id, parsed.data.acted_on);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

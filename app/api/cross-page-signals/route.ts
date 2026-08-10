import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { getCrossPageSignals } from "@/lib/crossPageSignals";

/**
 * GET /api/cross-page-signals?projectId=<id>
 *
 * Backs the nav badges built for the "page coherence" work — see
 * lib/crossPageSignals.ts for the design rationale and why this stays
 * deliberately cheap.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, signals: [] }, { status: 401 });
  }
  if (!hasAdminEnv()) {
    return NextResponse.json({ success: true, signals: [] });
  }

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const admin = createAdminClient();
    const signals = await getCrossPageSignals(admin, routeUser.userId, projectId);
    return NextResponse.json({ success: true, signals });
  } catch {
    // Nav badges are a nice-to-have — never let this break page load.
    return NextResponse.json({ success: true, signals: [] });
  }
      }

/**
 * POST /api/ai/coach/apply { projectId, proposal }
 * Applies a coach write the founder confirmed on the card. Ownership and proposal
 * shape are re-validated on the server before anything is changed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { applyWrite } from "@/lib/coachWrites/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ApplySchema = z.object({
  projectId: z.string().uuid(),
  proposal: z.unknown(),
});

export async function POST(request: Request) {
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!hasAdminEnv()) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await applyWrite(
      createAdminClient(),
      routeUser.userId,
      parsed.data.projectId,
      parsed.data.proposal,
    );
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch {
    return NextResponse.json({ success: false, error: "Could not apply that change." }, { status: 500 });
  }
}
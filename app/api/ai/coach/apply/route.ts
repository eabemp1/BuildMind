/**
 * POST /api/ai/coach/apply  { projectId, proposal }
 * Runs a coach write the founder confirmed on the card. The proposal is re-validated and ownership is re-checked here;
 * nothing the client sends is trusted beyond ids that must resolve to the signed-in founder's own rows.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { applyWrite, undoWrite } from "@/lib/coachWrites/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ projectId: z.string().uuid().optional(), proposal: z.unknown().optional(), undo: z.unknown().optional() });

export async function POST(req: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ success: false, error: "Not available." }, { status: 503 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });

  if (body.data.undo) {
    const u = await undoWrite(createAdminClient(), user.userId, body.data.undo);
    return NextResponse.json({ success: u.ok, message: u.message, ...(u.ok ? {} : { error: u.message }) }, { status: u.ok ? 200 : 400 });
  }
  if (!body.data.projectId) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const result = await applyWrite(createAdminClient(), user.userId, body.data.projectId, body.data.proposal);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, message: result.message, undo: result.undo });
}

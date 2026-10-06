import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTrackRecord, resolveTest } from "@/lib/server/breakPredictions";

export const dynamic = "force-dynamic";

const Body = z.object({
  predictionId: z.string().uuid(),
  testId: z.string().min(1).max(80),
  status: z.enum(["supported", "refuted", "inconclusive", "open"]),
  note: z.string().max(300).optional(),
});

/** The founder's prediction track record. */
export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const trackRecord = await loadTrackRecord(createAdminClient(), user.userId);
  return NextResponse.json({ success: true, trackRecord });
}

/** Records what happened when the founder ran a predicted test. */
export async function POST(req: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

  const trackRecord = await resolveTest(createAdminClient(), { userId: user.userId, ...parsed.data });
  if (!trackRecord) return NextResponse.json({ success: false, error: "Could not record that result" }, { status: 404 });
  return NextResponse.json({ success: true, trackRecord });
}

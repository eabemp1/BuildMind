import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { chooseTest } from "@/lib/server/breakPredictions";

export const dynamic = "force-dynamic";

const Body = z.object({
  predictionId: z.string().uuid(),
  testId: z.string().min(1).max(80),
  choose: z.boolean().optional(),
});

/** The founder picks (or drops) a teardown test as today's action. */
export async function POST(req: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  const ok = await chooseTest(createAdminClient(), { userId: user.userId, ...parsed.data });
  if (!ok) return NextResponse.json({ success: false, error: "Could not set that as your action" }, { status: 404 });
  return NextResponse.json({ success: true });
}

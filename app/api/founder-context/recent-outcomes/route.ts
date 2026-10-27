import { NextResponse } from "next/server";
import { getRecentResolvedPredictions } from "@/lib/learningLoop";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent resolved Founder Intelligence predictions shown on Today. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const outcomes = await getRecentResolvedPredictions(createAdminClient(), user.id);
  return NextResponse.json({ ok: true, outcomes });
}

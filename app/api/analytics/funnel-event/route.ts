import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";

export async function POST(req: NextRequest) {
  const limit = await rateLimitAsync(`funnel:${getClientIp(req)}`, 120, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: true });

  const { step } = await req.json().catch(() => ({}));
  if (!step) return NextResponse.json({ ok: true });
  const admin = createAdminClient();
  try {
    await admin.rpc("increment_funnel_step", { p_step: step });
  } catch (err) {
    // Silently fail — table may not exist yet
    console.warn("[funnel-event] increment_funnel_step failed:", err);
  }
  return NextResponse.json({ ok: true });
}

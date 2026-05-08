import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimit } from "@/lib/server/rateLimit";

export async function POST(req: NextRequest) {
  const limit = rateLimit(`funnel:${getClientIp(req)}`, 120, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: true });

  const { step } = await req.json().catch(() => ({}));
  if (!step) return NextResponse.json({ ok: true });
  const admin = createAdminClient();
  try {
    await admin.rpc("increment_funnel_step", { p_step: step });
  } catch {
    // Silently fail — table may not exist yet
  }
  return NextResponse.json({ ok: true });
}

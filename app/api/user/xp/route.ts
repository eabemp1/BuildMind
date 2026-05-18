/**
 * app/api/user/xp/route.ts
 *
 * GET  → returns the current user's XP total from founder_context
 * POST → increments XP by the given amount
 *
 * XP is stored in founder_context.xp (int column). Previously it lived only
 * in localStorage, which caused score discrepancies across devices.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitAsync } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("founder_context")
      .select("xp")
      .eq("user_id", userId)
      .maybeSingle();

    return NextResponse.json({ xp: (data?.xp as number | null) ?? 0 });
  } catch {
    return NextResponse.json({ xp: 0 });
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimitAsync(
    `xp:${userId}`,
    20,              // 20 XP grants per hour — generous for legitimate use
    60 * 60 * 1000,
    { failClosed: false }  // fail open — authenticated route
  );
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many XP requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount ?? 0);
  if (!amount || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  // Cap per-request XP to a reasonable maximum (largest legitimate award is ~50 XP).
  // This prevents a crafted POST from inflating a user's XP to an arbitrary value.
  const MAX_XP_PER_CALL = 500;
  if (amount > MAX_XP_PER_CALL) {
    return NextResponse.json({ error: `amount must not exceed ${MAX_XP_PER_CALL}` }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // Fetch current XP
    const { data: existing } = await admin
      .from("founder_context")
      .select("xp")
      .eq("user_id", userId)
      .maybeSingle();

    const currentXP = (existing?.xp as number | null) ?? 0;
    const newXP = currentXP + amount;

    await admin
      .from("founder_context")
      .upsert({ user_id: userId, xp: newXP }, { onConflict: "user_id" });

    return NextResponse.json({ ok: true, xp: newXP });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update XP";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

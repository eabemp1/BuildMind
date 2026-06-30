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
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { getFounderScorecard, grantXP } from "@/lib/scorecard";

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
    const scorecard = await getFounderScorecard(userId);
    return NextResponse.json({ xp: scorecard.xp });
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
  const reason = typeof body?.reason === "string" ? body.reason : "client-awarded";
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
    // grantXP() is the ONLY permitted writer to founder_context.xp — see
    // lib/scorecard.ts. It throws loudly on failure instead of swallowing
    // errors, which is what made the original achievements addXP() bug
    // (silent .catch(() => {})) invisible for so long.
    const newXP = await grantXP(userId, amount, reason);
    return NextResponse.json({ ok: true, xp: newXP });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update XP";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * lib/server/featureGate.ts — spend one use of a capped Builder feature, or return a ready 429.
 * If the counter cannot be reached the call is allowed: bookkeeping trouble never blocks a paying founder.
 */
import { NextResponse } from "next/server";
import { getPlanContext } from "@/lib/server/plan";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { featureLimit, limitMessage, type LimitedFeature, type LimitTier } from "@/lib/featureLimits";

export async function gateFeature(userId: string, feature: LimitedFeature): Promise<NextResponse | null> {
  let tier: LimitTier = "free";
  try {
    const ctx = await getPlanContext(userId);
    tier = ctx.plan === "builder" ? (ctx.trial ? "trial" : "builder") : "free";
  } catch { tier = "builder"; } // the route already required Builder
  const limit = featureLimit(feature, tier);
  if (limit <= 0) return NextResponse.json({ ok: false, error: "This is part of the Builder plan.", upgradeUrl: "/upgrade" }, { status: 403 });
  const rl = await rateLimitAsync(`feat:${feature}:${userId}`, limit, 24 * 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ ok: false, error: limitMessage(feature, limit) }, { status: 429 });
  return null;
}

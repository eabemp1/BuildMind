import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOT_UA } from "@/lib/funnel/source";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";

// Allowlist of valid step names — prevents analytics pollution from arbitrary
// strings passed by scrapers or curious developers hitting the endpoint directly.
const VALID_STEPS = new Set([
  "landing_view", "signup", "onboarding_start", "identity_input_complete",
  "reflexion_strike_started", "reflexion_strike_shown", "reflexion_strike_fallback",
  "reflexion_strike_accepted", "founder_state_complete", "depth_questions_answered",
  "stage_selected", "identity_complete", "onboarding_complete",
  "first_task_completed", "first_reflect", "landing_cta_click", "demo_play",
]);

const clip = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);

export async function POST(req: NextRequest) {
  const limit = await rateLimitAsync(`funnel:${getClientIp(req)}`, 120, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const step = body.step;
  // Silently ignore unknown steps — return 200 so clients don't retry
  if (typeof step !== "string" || !VALID_STEPS.has(step)) return NextResponse.json({ ok: true });
  // Crawlers, link previews and headless browsers are not visitors.
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  try {
    // One row per event with the visitor id and where they came from, so visits can be split by source.
    await admin.from("funnel_events").insert({
      user_id: null,
      step,
      session_id: clip(body.vid, 40),
      referrer: clip(body.referrer, 200),
      user_agent: ua.slice(0, 200),
      meta: { source: clip(body.source, 40) ?? "direct", medium: clip(body.medium, 30), campaign: clip(body.campaign, 40) },
    });
  } catch (err) {
    // Silently fail — table may not exist yet
    console.warn("[funnel-event] insert failed:", err);
  }
  return NextResponse.json({ ok: true });
}

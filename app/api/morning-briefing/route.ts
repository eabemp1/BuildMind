/**
 * app/api/morning-briefing/route.ts
 *
 * GET → returns today's morning briefing (generates if not yet created)
 * POST → manually trigger generation (used by the scheduled Edge Function)
 *
 * Plan gating — Playbook §6.1:
 *   Free    → Morning Briefing 3 days/week (Mon, Wed, Fri)
 *   Builder → Daily Morning Briefing, Reflexion-powered, delivered before you wake
 *
 * Both tiers receive the briefing. Free tier is rate-limited by day-of-week.
 * Do NOT gate this route at "builder" — that blocks free users from their 3-day briefing.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMorningBriefing } from "@/lib/reflexion";
import { planFromUserMetadata } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mon=1, Wed=3, Fri=5 — free tier briefing days */
const FREE_BRIEFING_DAYS = new Set([1, 3, 5]);

function isBriefingDayForPlan(plan: string): boolean {
  if (plan === "builder") return true;
  const dow = new Date().getDay(); // 0=Sun … 6=Sat
  return FREE_BRIEFING_DAYS.has(dow);
}

function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (isCronRequest(req)) {
    return NextResponse.json({
      ok: true,
      cron: true,
      message: "Morning briefing cron is reachable. Supabase scheduled-jobs performs batch generation.",
    });
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const plan = planFromUserMetadata(user);

  // Free-tier day-of-week gate
  if (!isBriefingDayForPlan(plan)) {
    return NextResponse.json({
      ok: false,
      reason: "not_briefing_day",
      message: "Your Morning Briefing is ready. You need Builder to receive it every day.",
      upgradePrompt: true,
    }, { status: 403 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Check if briefing already generated today
  const { data: existing } = await admin
    .from("morning_briefings")
    .select("*")
    .eq("user_id", user.id)
    .gte("created_at", `${today}T00:00:00Z`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return NextResponse.json({ ok: true, data: existing, cached: true });

  // Generate a fresh one
  const { data: ctx } = await admin
    .from("founder_context")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: lastReflection } = await admin
    .from("reflections")
    .select("outcome, note, confidence, today_action")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reflexionCtx = {
    startupSummary: ctx?.startup_summary ?? "",
    stage: ctx?.current_stage ?? "Idea",
    momentumScore: ctx?.momentum_score ?? 50,
    avoidanceSignals: ctx?.avoidance_signals ?? [],
    topicsRepeated: ctx?.topics_mentioned_repeatedly ?? [],
    cognitiveLoad: ctx?.cognitive_load ?? "fresh",
    yesterdayTask: lastReflection?.today_action ?? undefined,
    completedYesterday: lastReflection?.outcome === "completed",
  };

  try {
    const briefing = await generateMorningBriefing(reflexionCtx);
    const { data: saved } = await admin
      .from("morning_briefings")
      .insert({ user_id: user.id, ...briefing, delivered_at: new Date().toISOString() })
      .select()
      .single();
    return NextResponse.json({ ok: true, data: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // For scheduled jobs — requires cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: "Use the Supabase Edge Function for scheduled delivery" });
}

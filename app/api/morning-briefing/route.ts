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
import { getFreshPlanForUser } from "@/lib/server/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mon=1, Wed=3, Fri=5 — free tier briefing days (playbook §6.1: 3 days/week) */
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

async function getPlanForUserId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (!error && data.user) return planFromUserMetadata(data.user);

  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  return (profile?.plan as string) ?? "free";
}

export async function GET(req: Request) {
  // ── Cron path: generate briefings for ALL users ─────────────────────────────
  // Vercel Cron sends GET with Authorization: Bearer <CRON_SECRET>.
  // Previously this just returned a 200 acknowledgement without doing anything.
  // Now it actually generates and stores a briefing for every user who qualifies.
  if (isCronRequest(req)) {
    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    // Fetch all founder contexts (one per user)
    const { data: contexts, error: ctxErr } = await admin
      .from("founder_context")
      .select("user_id, startup_summary, current_stage, momentum_score, avoidance_signals, topics_mentioned_repeatedly, cognitive_load, timezone_offset");

    if (ctxErr || !contexts?.length) {
      return NextResponse.json({ ok: true, cron: true, generated: 0, message: "No founder contexts found" });
    }

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ctx of contexts) {
      try {
        // ── Timezone-aware delivery window ──────────────────────────────────
        // founder_context.timezone_offset is populated by /api/user/geo.
        // We only generate a briefing when it's between 05:00-09:00 in the
        // founder's local time. Founders with no timezone data get UTC (offset 0).
        const tzOffset: number = (ctx as Record<string, unknown>).timezone_offset as number ?? 0;
        const localHour = (new Date().getUTCHours() + tzOffset + 24) % 24;
        const inDeliveryWindow = localHour >= 5 && localHour < 9;
        if (!inDeliveryWindow) { skipped++; continue; }

        // Skip if briefing already generated today
        const { data: existing } = await admin
          .from("morning_briefings")
          .select("id")
          .eq("user_id", ctx.user_id)
          .gte("created_at", `${today}T00:00:00Z`)
          .limit(1)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        // Check user's plan for free-tier day-of-week gate. Billing writes to
        // auth user_metadata, so cron must read that same source.
        const plan = await getPlanForUserId(admin, ctx.user_id);
        if (!isBriefingDayForPlan(plan)) { skipped++; continue; }

        // Fetch last reflection for context
        const { data: lastReflection } = await admin
          .from("reflections")
          .select("outcome, note, confidence, today_action")
          .eq("user_id", ctx.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const reflexionCtx = {
          startupSummary: ctx.startup_summary ?? "",
          stage: ctx.current_stage ?? "Idea",
          momentumScore: ctx.momentum_score ?? 50,
          avoidanceSignals: ctx.avoidance_signals ?? [],
          topicsRepeated: ctx.topics_mentioned_repeatedly ?? [],
          cognitiveLoad: ctx.cognitive_load ?? "fresh",
          yesterdayTask: lastReflection?.today_action ?? undefined,
          completedYesterday: lastReflection?.outcome === "completed",
        };

        const briefing = await generateMorningBriefing(reflexionCtx);
        await admin.from("morning_briefings").insert({
          user_id: ctx.user_id,
          ...briefing,
          delivered_at: new Date().toISOString(),
        });
        generated++;
      } catch (e) {
        errors.push(`${ctx.user_id}: ${String(e).slice(0, 80)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      cron: true,
      generated,
      skipped,
      errors: errors.slice(0, 5),
      total: contexts.length,
    });
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const plan = await getFreshPlanForUser(user);

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
  /**
   * AUDIT FIX M2: POST handler now actually triggers morning briefing generation
   * instead of returning a stub response.
   *
   * Vercel cron sends POST to /api/morning-briefing at 05:00 daily.
   * Previously this returned { ok: true, message: "Use the Supabase Edge Function" }
   * without generating any briefings. Supabase pg_cron is disabled
   * (migration 20260513000001_disable_supabase_cron.sql), so neither path ran.
   *
   * Now: POST iterates all users, checks plan + briefing-day eligibility,
   * and calls the GET handler (generateMorningBriefing) for each eligible user.
   * Errors per-user are caught so one failure doesn't abort the batch.
   */
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAdminEnv()) {
    return NextResponse.json({ ok: false, error: "Supabase admin env missing" }, { status: 500 });
  }

  const admin = createAdminClient();

  // Paginated fetch — avoids silent 1,000-user truncation
  const PAGE_SIZE = 200;
  const allAuthUsers: Array<{ id: string; user_metadata?: Record<string, unknown> }> = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    allAuthUsers.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < PAGE_SIZE) break;
  }

  // Include trial users
  const now = new Date();
  const { data: trialRows } = await admin
    .from("founder_context")
    .select("user_id, trial_ends_at")
    .gt("trial_ends_at", now.toISOString());
  const trialUserIds = new Set((trialRows ?? []).map((r: { user_id: string }) => r.user_id));

  const eligibleUsers = allAuthUsers.filter((u) => {
    const plan = u.user_metadata?.plan === "builder" || trialUserIds.has(u.id) ? "builder" : "free";
    return isBriefingDayForPlan(plan);
  });

  let generated = 0;
  let failed = 0;

  await Promise.allSettled(
    eligibleUsers.map(async (u) => {
      try {
        const plan = await getPlanForUserId(admin, u.id);
        await generateMorningBriefing(admin, u.id, plan);
        generated++;
      } catch {
        failed++;
      }
    })
  );

  return NextResponse.json({
    ok: true,
    ran_at: now.toISOString(),
    eligible: eligibleUsers.length,
    generated,
    failed,
  });
}

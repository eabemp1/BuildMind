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
import { getEffectivePlan, getFreshPlanForUser } from "@/lib/server/plan";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { buildTodayActionCacheFromBriefing, upsertTodayActionCache } from "@/lib/todayActionCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

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
  const start = Date.now();

  // ── Cron path: generate briefings for ALL users ─────────────────────────────
  // Vercel Cron sends GET with Authorization: Bearer <CRON_SECRET>.
  // Previously this just returned a 200 acknowledgement without doing anything.
  // Now it actually generates and stores a briefing for every user who qualifies.
  if (isCronRequest(req)) {
    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const activeSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Early exit if no actionable records exist.
    const { count: activeCount, error: countErr } = await admin
      .from("founder_context")
      .select("user_id", { count: "exact", head: true })
      .gte("last_active", activeSince);

    if (countErr) {
      return NextResponse.json({ ok: false, error: countErr.message, step: "count_actionable" }, { status: 500 });
    }
    if (!activeCount) {
      return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
    }

    // Fetch all founder contexts (one per user)
    const { data: contexts, error: ctxErr } = await admin
      .from("founder_context")
      .select("user_id, startup_summary, current_stage, momentum_score, avoidance_zones, topics_mentioned_repeatedly, cognitive_load, timezone_offset, last_active")
      .gte("last_active", activeSince);

    if (ctxErr || !contexts?.length) {
      return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
    }

    const userIds = contexts.map((ctx: { user_id: string }) => ctx.user_id);
    const usersWithProjects = new Set<string>();
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const { data: projects } = await admin
        .from("projects")
        .select("user_id")
        .in("user_id", batch);
      (projects ?? []).forEach((row: { user_id: string }) => usersWithProjects.add(row.user_id));
    }

    if (usersWithProjects.size === 0) {
      return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
    }

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ctx of contexts) {
      try {
        if (!usersWithProjects.has(ctx.user_id)) { skipped++; continue; }

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

        // Fetch last 5 reflections for richer pattern context
        const { data: recentReflections } = await admin
          .from("reflections")
          .select("outcome, note, confidence, today_action, what_tried, what_happened, what_learned, blocker, created_at")
          .eq("user_id", ctx.user_id)
          .order("created_at", { ascending: false })
          .limit(5);

        const lastReflection = recentReflections?.[0] ?? null;

        // Build pattern summary from last 5 reflections
        const reflectionLines = (recentReflections ?? []).map((r, i) => {
          const tried    = r.what_tried    ?? r.today_action ?? "unknown";
          const happened = r.what_happened ?? "";
          const learned  = r.what_learned  ?? "";
          const blocked  = r.blocker       ?? "";
          const daysAgo  = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
          return [
            `${i + 1}. [${daysAgo}d ago] Tried: "${tried}" → ${r.outcome}`,
            happened ? `   Result: ${happened}` : "",
            learned  ? `   Learned: ${learned}` : "",
            blocked  ? `   Blocker: ${blocked}` : "",
          ].filter(Boolean).join("\n");
        });

        // FIX: Inject the current cached task so the briefing AI knows not to repeat it.
        // Replaced tasks never produce a reflection — without this the briefing
        // regenerates the same task every night (the stale-task loop bug).
        try {
          const { data: cacheRow } = await admin
            .from("user_behavior_state")
            .select("value")
            .eq("user_id", ctx.user_id)
            .eq("key", "today_action_cache")
            .maybeSingle();
          const cachedTask = cacheRow?.value as { data?: { action?: string }; shown_count?: number } | null;
          if (cachedTask?.data?.action) {
            const shownCount = cachedTask.shown_count ?? 1;
            reflectionLines.push(
              `[TASK SHOWN ${shownCount}x WITHOUT COMPLETION — do not regenerate this or similar tasks]: "${cachedTask.data.action}"`
            );
          }
        } catch { /* non-fatal */ }

        const reflectionHistory = reflectionLines.join("\n\n");

        // Fetch active project for gap detection (weaknesses + stage)
        const { data: activeProject } = await admin
          .from("projects")
          .select("id, name, title, description, target_users, problem, validation_weaknesses, startup_stage, startup_summary")
          .eq("user_id", ctx.user_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const reflexionCtx = {
          // Prefer project-level startup_summary (kept up-to-date when project fields change).
          // founder_context.startup_summary is never written by the app and will always be NULL.
          startupSummary: activeProject?.startup_summary ?? ctx.startup_summary ?? "",
          stage: ctx.current_stage ?? "Idea",
          momentumScore: ctx.momentum_score ?? 50,
          avoidanceSignals: ctx.avoidance_zones ?? [],
          topicsRepeated: ctx.topics_mentioned_repeatedly ?? [],
          cognitiveLoad: ctx.cognitive_load ?? "fresh",
          yesterdayTask: lastReflection?.today_action ?? undefined,
          completedYesterday: lastReflection?.outcome === "completed",
          reflectionHistory: reflectionHistory || undefined,
          // Gap detection fields
          userId: ctx.user_id,
          projectWeaknesses: activeProject?.validation_weaknesses ?? [],
          projectStage: activeProject?.startup_stage ?? ctx.current_stage ?? "Idea",
        };

        const briefing = await generateMorningBriefing(reflexionCtx);
        await admin.from("morning_briefings").insert({
          user_id: ctx.user_id,
          ...briefing,
          delivered_at: new Date().toISOString(),
        });

        if (activeProject?.id) {
          await upsertTodayActionCache(
            admin,
            ctx.user_id,
            buildTodayActionCacheFromBriefing({
              briefing,
              project: activeProject,
              stage: activeProject.startup_stage ?? ctx.current_stage ?? "Idea",
              timezoneOffset: tzOffset,
            }),
          );

          // ── Mirror momentum + write execution_score onto projects ───────────
          // momentum_score is NEVER computed here — founder_context is the
          // single source of truth, written exclusively by
          // app/api/founder-context/task-complete/route.ts (which uses the
          // bounded EMA formula in lib/momentum.ts). This is purely a
          // best-effort mirror for legacy reads against project_summaries.
          // See lib/scorecard.ts for the canonical read/write contract.
          const batchMomentum = ctx.momentum_score ?? 50;
          const batchVerdict = (briefing as Record<string, unknown>).reflexion_verdict as string | undefined;
          const batchExecution =
            batchVerdict === "pass"    ? 75 :
            batchVerdict === "partial" ? 45 :
            batchVerdict === "fail"    ? 20 :
            (activeProject as Record<string, unknown>).execution_score != null
              ? (activeProject as Record<string, unknown>).execution_score as number
              : 50;

          await admin
            .from("projects")
            .update({ momentum_score: batchMomentum, execution_score: batchExecution })
            .eq("id", activeProject.id)
            .eq("user_id", ctx.user_id);
        }
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
      processed: generated + skipped,
      durationMs: Date.now() - start,
    });
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const plan = await getEffectivePlan(user.id);

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

  if (existing) {
    // Reconstruct gaps from raw_context for cached briefings
    const cachedGaps = (existing.raw_context as { gaps?: unknown[] } | null)?.gaps ?? [];
    return NextResponse.json({ ok: true, data: { ...existing, gaps: cachedGaps }, cached: true });
  }

  // Generate a fresh one
  const { data: ctx } = await admin
    .from("founder_context")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Read last 5 reflections for richer pattern context
  const { data: recentReflections } = await admin
    .from("reflections")
    .select("outcome, note, confidence, today_action, what_tried, what_happened, what_learned, blocker, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const lastReflection = recentReflections?.[0] ?? null;

  // Build a pattern summary from last 5 reflections
  const reflectionLines = (recentReflections ?? []).map((r, i) => {
    const tried    = r.what_tried    ?? r.today_action ?? "unknown";
    const happened = r.what_happened ?? "";
    const learned  = r.what_learned  ?? "";
    const blocked  = r.blocker       ?? "";
    const daysAgo  = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
    return [
      `${i + 1}. [${daysAgo}d ago] Tried: "${tried}" → ${r.outcome}`,
      happened ? `   Result: ${happened}` : "",
      learned  ? `   Learned: ${learned}` : "",
      blocked  ? `   Blocker: ${blocked}` : "",
    ].filter(Boolean).join("\n");
  });

  // FIX: Inject current cached task so user-triggered briefing also avoids repeating it
  try {
    const { data: cacheRow } = await admin
      .from("user_behavior_state")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "today_action_cache")
      .maybeSingle();
    const cachedTask = cacheRow?.value as { data?: { action?: string }; shown_count?: number } | null;
    if (cachedTask?.data?.action) {
      const shownCount = cachedTask.shown_count ?? 1;
      reflectionLines.push(
        `[TASK SHOWN ${shownCount}x WITHOUT COMPLETION — do not regenerate this or similar tasks]: "${cachedTask.data.action}"`
      );
    }
  } catch { /* non-fatal */ }

  const reflectionHistory = reflectionLines.join("\n\n");

  // Fetch active project for gap detection
  const { data: activeProject } = await admin
    .from("projects")
    .select("id, name, title, description, target_users, problem, validation_weaknesses, startup_stage, startup_summary")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reflexionCtx = {
    // Prefer project-level startup_summary (kept up-to-date when project fields change).
    // founder_context.startup_summary is never written by the app and will always be NULL.
    startupSummary: activeProject?.startup_summary ?? ctx?.startup_summary ?? "",
    stage: ctx?.current_stage ?? "Idea",
    momentumScore: ctx?.momentum_score ?? 50,
    avoidanceSignals: ctx?.avoidance_zones ?? [],
    topicsRepeated: ctx?.topics_mentioned_repeatedly ?? [],
    cognitiveLoad: ctx?.cognitive_load ?? "fresh",
    yesterdayTask: lastReflection?.today_action ?? undefined,
    completedYesterday: lastReflection?.outcome === "completed",
    reflectionHistory: reflectionHistory || undefined,
    // Gap detection fields
    userId: user.id,
    projectWeaknesses: activeProject?.validation_weaknesses ?? [],
    projectStage: activeProject?.startup_stage ?? ctx?.current_stage ?? "Idea",
  };

  try {
    const briefing = await generateMorningBriefing(reflexionCtx);

    // Note: morning_briefings table has: win, risk, action, raw_context, delivered_at.
    // The briefing object also contains `gaps` which is NOT a DB column.
    // Spread only the known columns; store gaps inside raw_context.
    //
    // INSERT and SELECT are separated — chaining .select().maybeSingle() on an
    // admin client insert returns null in some Supabase versions even when the
    // row was written. We insert first, then fetch the row back by user+date.
    const insertPayload = {
      user_id:      user.id,
      win:          briefing.win,
      risk:         briefing.risk,
      action:       briefing.action,
      raw_context:  { gaps: briefing.gaps ?? [], stage: reflexionCtx.stage },
      delivered_at: new Date().toISOString(),
    };

    const { error: insertError } = await admin
      .from("morning_briefings")
      .insert(insertPayload);

    if (insertError) {
      // If it's a duplicate (already generated today via race), fall through to fetch
      if (!insertError.message?.includes("duplicate") && !insertError.code?.includes("23505")) {
        throw new Error(`morning_briefings insert: ${insertError.message}`);
      }
    }

    // Fetch the row back (works regardless of whether we just inserted or it was a dup)
    const { data: saved } = await admin
      .from("morning_briefings")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", `${today}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeProject?.id) {
      await upsertTodayActionCache(
        admin,
        user.id,
        buildTodayActionCacheFromBriefing({
          briefing,
          project: activeProject,
          stage: activeProject.startup_stage ?? ctx?.current_stage ?? "Idea",
        }),
      );

      // ── Write execution_score + momentum_score back to projects ──────────
      const newMomentum = reflexionCtx.momentumScore ?? 50;

      const reflexionVerdict = (briefing as Record<string, unknown>).reflexion_verdict as string | undefined;
      const newExecution =
        reflexionVerdict === "pass"    ? 75 :
        reflexionVerdict === "partial" ? 45 :
        reflexionVerdict === "fail"    ? 20 :
        (activeProject as Record<string, unknown>).execution_score != null
          ? (activeProject as Record<string, unknown>).execution_score as number
          : 50;

      await admin
        .from("projects")
        .update({ momentum_score: newMomentum, execution_score: newExecution })
        .eq("id", activeProject.id)
        .eq("user_id", user.id);
    }

    // Always return a valid briefing — even if DB fetch returned null,
    // return the generated briefing directly so the modal still fires.
    const returnData = saved
      ? { ...saved, gaps: briefing.gaps ?? [] }
      : { ...insertPayload, id: null, gaps: briefing.gaps ?? [], created_at: new Date().toISOString() };

    return NextResponse.json({ ok: true, data: returnData });
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

  return GET(req);
      }

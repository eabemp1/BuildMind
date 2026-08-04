/**
 * app/api/cron/sunday-email/route.ts — Sunday behavioral week-in-review email
 *
 * Audit v8 GROWTH #4:
 * "Automate a 'your week in BuildMind' email every Sunday. Not a newsletter —
 * a personalized behavioral summary. 'You completed 4 tasks this week. Your
 * momentum rose from 62 to 74. You avoided outreach twice. Next week: one
 * outreach call before anything else.' This email is the retention hook for
 * founders who didn't open the app all week."
 *
 * Schedule: Sundays 08:00 UTC (add to vercel.json)
 * Auth: CRON_SECRET header required in production
 *
 * Data sources (all existing tables, no new queries needed):
 *   - action_logs          → tasks completed this week
 *   - founder_context      → momentum_score, streak, avoidance signals
 *   - founder_memory       → avoidance_zones for pattern message
 *   - reflections          → last 7 days for momentum delta
 *   - auth.users           → email addresses
 *   - profiles             → display name
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setWeeklyMomentumBaseline } from "@/lib/scorecard";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { sendEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/server/logger";
import { generateSundayEmailNarrative } from "@/lib/cron/aiContent";
import { claimSendSlots } from "@/lib/cronSendLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // batches across all users

function isCronRequest(request: Request): boolean {
  const auth  = request.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    ?? request.headers.get("x-cron-secret");
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

interface FounderWeekData {
  userId:          string;
  email:           string;
  name:            string;
  startupName:     string;
  tasksCompleted:  number;
  momentumStart:   number;
  momentumEnd:     number;
  streak:          number;
  avoidancePattern?: string;
  nextWeekFocus?:  string;
  weekNumber:      number;
}

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export async function GET(request: Request) {
  const start = Date.now();

  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error(
      "[buildmind] CRON_SECRET is not set. Sunday behavioral email cron is blocked. " +
      "Set CRON_SECRET in Vercel Environment Variables."
    );
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured. Set it in Vercel to enable Sunday email cron." },
      { status: 500 },
    );
  }

  if (!isCronRequest(request) && process.env.NODE_ENV === "production") {
    console.error("[buildmind] Sunday behavioral email cron blocked: invalid or missing CRON_SECRET.");
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminEnv()) {
    return NextResponse.json({ success: false, error: "Missing admin env" }, { status: 500 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ success: false, error: "RESEND_API_KEY not set — skipping email sends" }, { status: 503 });
  }

  const supabase    = createAdminClient();
  const weekNumber  = getWeekNumber();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Early exit if no actionable records exist.
  const { count: subscriptionCount } = await supabase
    .from("subscriptions")
    .select("user_id", { count: "exact", head: true })
    .eq("plan", "builder")
    .in("status", ["active", "grace"]);
  const { count: trialCount } = await supabase
    .from("founder_context")
    .select("user_id", { count: "exact", head: true })
    .gt("trial_ends_at", nowIso);

  if (!subscriptionCount && !trialCount) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  // ── 1. Get all builder + trial users (paginated) ───────────────────────────
  const PAGE_SIZE = 200;
  const allUsers: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error || !data) break;
    allUsers.push(...data.users);
    if (data.users.length < PAGE_SIZE) break;
  }

  const { data: trialRows } = await supabase
    .from("founder_context")
    .select("user_id, trial_ends_at")
    .gt("trial_ends_at", new Date().toISOString());

  const trialIds = new Set((trialRows ?? []).map((r: { user_id: string }) => r.user_id));
  const builderUsers = allUsers.filter(u =>
    u.user_metadata?.plan === "builder" || trialIds.has(u.id)
  );
  const builderIds = builderUsers.map(u => u.id);

  if (builderIds.length === 0) {
    return NextResponse.json({ success: true, sent: 0, reason: "no builder users" });
  }

  // ── 2. Batch-fetch all data in parallel ────────────────────────────────────
  const [profilesRes, founderCtxRes, founderMemRes, actionLogsRes, reflectionsRes] =
    await Promise.allSettled([
      supabase
        .from("profiles")
        .select("id, name, username")
        .in("id", builderIds),
      supabase
        .from("founder_context")
        .select("user_id, momentum_score, streak, meta_critic_signal")
        .in("user_id", builderIds),
      supabase
        .from("founder_memory")
        .select("user_id, avoidance_zones, last_insight")
        .in("user_id", builderIds),
      supabase
        .from("action_logs")
        .select("user_id, outcome, created_at")
        .in("user_id", builderIds)
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("reflections")
        .select("user_id, momentum_score, created_at")
        .in("user_id", builderIds)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: true }),
    ]);

  const profiles    = profilesRes.status    === "fulfilled" ? (profilesRes.value.data ?? [])    : [];
  const founderCtxs = founderCtxRes.status  === "fulfilled" ? (founderCtxRes.value.data ?? [])  : [];
  const founderMems = founderMemRes.status  === "fulfilled" ? (founderMemRes.value.data ?? [])  : [];
  const actionLogs  = actionLogsRes.status  === "fulfilled" ? (actionLogsRes.value.data ?? [])  : [];
  const reflections = reflectionsRes.status === "fulfilled" ? (reflectionsRes.value.data ?? []) : [];

  // ── 3. Fetch their projects (startup name) ─────────────────────────────────
  const { data: projects } = await supabase
    .from("projects")
    .select("user_id, name, title")
    .in("user_id", builderIds)
    .order("created_at", { ascending: true });

  // Index lookups
  type ProfileRow  = { id: string; name?: string; username?: string };
  type CtxRow      = { user_id: string; momentum_score?: number; streak?: number; meta_critic_signal?: string };
  type MemRow      = { user_id: string; avoidance_zones?: string[]; last_insight?: string };
  type LogRow      = { user_id: string; outcome?: string; created_at: string };
  type ReflRow     = { user_id: string; momentum_score?: number; created_at: string };
  type ProjectRow  = { user_id: string; name?: string; title?: string };

  const profileMap  = new Map<string, ProfileRow>((profiles as ProfileRow[]).map(p => [p.id, p]));
  const ctxMap      = new Map<string, CtxRow>((founderCtxs as CtxRow[]).map(c => [c.user_id, c]));
  const memMap      = new Map<string, MemRow>((founderMems as MemRow[]).map(m => [m.user_id, m]));
  const projectMap  = new Map<string, ProjectRow>();
  for (const p of (projects ?? []) as ProjectRow[]) {
    if (!projectMap.has(p.user_id)) projectMap.set(p.user_id, p);
  }

  // Group logs and reflections by user
  const logsByUser  = new Map<string, LogRow[]>();
  const reflsByUser = new Map<string, ReflRow[]>();
  for (const l of actionLogs  as LogRow[])  { if (!logsByUser.has(l.user_id))  logsByUser.set(l.user_id, []);  logsByUser.get(l.user_id)!.push(l); }
  for (const r of reflections as ReflRow[]) { if (!reflsByUser.has(r.user_id)) reflsByUser.set(r.user_id, []); reflsByUser.get(r.user_id)!.push(r); }

  // ── 4. Build per-user data, skip users with nothing to report ─────────────
  const weekData: FounderWeekData[] = [];
  for (const user of builderUsers) {
    const authEmail = user.email;
    if (!authEmail) continue;

    const profile  = profileMap.get(user.id);
    const ctx      = ctxMap.get(user.id);
    const mem      = memMap.get(user.id);
    const project  = projectMap.get(user.id);
    const logs     = logsByUser.get(user.id) ?? [];
    const refls    = reflsByUser.get(user.id) ?? [];

    const tasksCompleted = logs.filter(l => l.outcome === "completed").length;
    const momentumEnd    = ctx?.momentum_score ?? 0;
    const momentumStart  = refls.length > 0 ? (refls[0].momentum_score ?? momentumEnd) : momentumEnd;
    const streak         = ctx?.streak ?? 0;

    // ── Weekly momentum baseline snapshot ─────────────────────────────────
    // Powers FounderScorecard.momentumTrend / momentumDelta (lib/scorecard.ts),
    // used by app/insights/page.tsx (Behavioral Patterns) to show whether
    // momentum is rising or falling week over week. Runs for every builder
    // user regardless of whether they end up receiving an email below.
    setWeeklyMomentumBaseline(user.id).catch(() => {});

    // Skip if they did literally nothing and momentum didn't change
    if (tasksCompleted === 0 && momentumEnd === momentumStart && streak === 0) continue;

    // Avoidance pattern: prefer meta_critic_signal, fall back to first avoidance zone
    const avoidancePattern: string | undefined =
      ctx?.meta_critic_signal
      ?? (mem?.avoidance_zones?.[0] ? `You've been avoiding: ${mem.avoidance_zones[0]}` : undefined);

    // Next week focus: use last_insight if available
    const nextWeekFocus = mem?.last_insight ?? undefined;

    weekData.push({
      userId:         user.id,
      email:          authEmail,
      name:           profile?.name ?? profile?.username ?? "Founder",
      startupName:    project?.name ?? project?.title ?? "your startup",
      tasksCompleted,
      momentumStart,
      momentumEnd,
      streak,
      avoidancePattern,
      nextWeekFocus,
      weekNumber,
    });
  }

  // ── 5. Send emails in batches of 10 (Resend free tier: 100/day) ───────────
  // FIX (High #9): no durable per-user marker existed before this send loop
  // — only best-effort logging (logInfo/logError) AFTER each send. Claim
  // each user's slot atomically first; only the returned (successfully
  // claimed) subset gets an email. Default (today's) date is correct here
  // since this cron runs weekly, so a same-day claim naturally means "once
  // this Sunday" — no multi-day window to worry about like re-engage.
  const claimedUserIds = new Set(await claimSendSlots(weekData.map((d) => d.userId), "sunday_email"));
  const sendableWeekData = weekData.filter((d) => claimedUserIds.has(d.userId));
  const deduped = weekData.length - sendableWeekData.length;

  const BATCH = 10;
  let sent = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < sendableWeekData.length; i += BATCH) {
    const batch = sendableWeekData.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (d) => {
        try {
        // Generate AI-written diagnosis + directive for this founder
        const aiNarrative = await generateSundayEmailNarrative({
          name:           d.name,
          startupName:    d.startupName,
          stage:          undefined,    // add stage to FounderWeekData if you want it here
          tasksCompleted: d.tasksCompleted,
          momentumStart:  d.momentumStart,
          momentumEnd:    d.momentumEnd,
          streak:         d.streak,
          avoidanceZone:  d.avoidancePattern,
          lastInsight:    d.nextWeekFocus,
        });

          const result = await sendEmail({
            to: d.email,
            template: "weekly_behavioral_review",
            data: {
              name:            d.name,
              startupName:     d.startupName,
              tasksCompleted:  d.tasksCompleted,
              momentumStart:   d.momentumStart,
              momentumEnd:     d.momentumEnd,
              streak:          d.streak,
              avoidancePattern: aiNarrative.diagnosis,
              nextWeekFocus:   aiNarrative.nextWeekDirective,
              weekNumber:      d.weekNumber,
            },
          });
          if (result.ok) {
            sent++;
            processed++;
            logInfo("sunday-email/sent", "Email sent", { userId: d.userId, weekNumber: d.weekNumber });
          } else {
            failed++;
            processed++;
            logError("sunday-email/failed", result.error, { userId: d.userId });
          }
        } catch (err) {
          failed++;
          processed++;
          logError("sunday-email/error", err, { userId: d.userId });
        }
      })
    );
    // Small delay between batches to stay within rate limits
    if (i + BATCH < sendableWeekData.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return NextResponse.json({
    success: true,
    ran_at:          new Date().toISOString(),
    week_number:     weekNumber,
    builder_users:   builderUsers.length,
    eligible:        weekData.length,
    deduped, // already claimed for this Sunday by an earlier/overlapping run
    processed,
    durationMs:      Date.now() - start,
    emails_sent:     sent,
    emails_failed:   failed,
  });
        }

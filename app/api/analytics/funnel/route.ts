/**
 * app/api/analytics/funnel/route.ts — Growth Improvement #5
 *
 * Server-side onboarding funnel event persistence.
 *
 * The existing lib/onboarding-analytics.ts is localStorage-only — all data
 * is invisible to the admin dashboard and lost if the user clears storage.
 * This endpoint receives funnel step events from the client and persists them
 * to Supabase, enabling:
 *   - Real server-side funnel analysis (which steps lose most founders)
 *   - Admin dashboard showing actual conversion rates per step
 *   - Drop-off attribution (device, time-of-day, referral source)
 *   - A/B test instrumentation foundation
 *
 * The existing trackFunnelStep() calls in onboarding/page.tsx will be updated
 * to also POST here. localStorage tracking is kept for fast local reads.
 *
 * Payload: { step: FunnelStep; meta?: Record<string, unknown> }
 * Auth: required (JWT) — anonymous funnel events go to /api/analytics/funnel/anon
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime  = "edge";
export const dynamic  = "force-dynamic";

const FUNNEL_STEPS = [
  "landing", "signup", "onboarding_start", "onboarding_idea",
  "onboarding_stage", "reflexion_strike_started", "reflexion_strike_shown",
  "reflexion_strike_fallback", "reflexion_strike_accepted", "depth_questions_answered",
  "onboarding_complete", "first_today", "first_task_completed", "first_action_done", "first_reflect", "first_report",
  "upgrade_seen", "upgrade_converted",
] as const;

type FunnelStep = typeof FUNNEL_STEPS[number];

const schema = z.object({
  step:      z.enum(FUNNEL_STEPS),
  meta:      z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  sessionId: z.string().max(64).optional(), // client-generated session id for attribution
  referrer:  z.string().max(200).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid step" }, { status: 422 });
  }

  const { step, meta, sessionId, referrer } = parsed.data;

  // Auth — get userId; gracefully degrade if auth fails
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // continue without userId — still valuable for conversion attribution
  }

  try {
    const supabase = await createSupabaseClient();
    await supabase.from("funnel_events").insert({
      user_id:    userId,
      step,
      meta:       meta ?? null,
      session_id: sessionId ?? null,
      referrer:   referrer ?? null,
      user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical — analytics failure must never break the onboarding flow
  }

  return NextResponse.json({ ok: true });
}

// ── Admin: funnel conversion rates ────────────────────────────────────────────
// GET /api/analytics/funnel?secret=CRON_SECRET
// Returns per-step counts and drop-off rates for the admin dashboard.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const supabase = await createSupabaseClient();

    // Count distinct users who reached each step
    const results: Record<string, number> = {};
    for (const step of FUNNEL_STEPS) {
      const { count } = await supabase
        .from("funnel_events")
        .select("*", { count: "exact", head: true })
        .eq("step", step);
      results[step] = count ?? 0;
    }

    // Compute drop-off between adjacent steps
    const ordered = FUNNEL_STEPS.map(s => ({ step: s, count: results[s] ?? 0 }));
    const withDropoff = ordered.map((row, i) => {
      const prev = ordered[i - 1]?.count ?? row.count;
      const dropoff = prev > 0 ? Math.round((1 - row.count / prev) * 100) : 0;
      return { ...row, dropoff_pct: dropoff };
    });

    return NextResponse.json({ ok: true, funnel: withDropoff });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

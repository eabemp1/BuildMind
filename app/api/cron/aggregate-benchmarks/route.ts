/**
 * app/api/cron/aggregate-benchmarks/route.ts — AI Improvement #5
 *
 * Nightly cron: aggregates benchmark_events → benchmark_cohorts.
 *
 * Flow:
 *   1. Read all benchmark_events, group by (stage, signal_type, category)
 *   2. Compute sample_size, median_momentum, completion_rate, pivot_rate, recovery_rate
 *   3. For cohorts with sample_size ≥ 10, call AI to generate insight_text
 *   4. Upsert into benchmark_cohorts
 *
 * Triggered by QStash nightly at 2am UTC (registered in vercel.json / cron-schedule.sql).
 * Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIN_COHORT = 10; // never surface insights from cohorts smaller than this

interface RawEvent {
  signal_type: string;
  stage: string;
  category: string | null;
  momentum_bucket: number;
}

interface CohortRow {
  stage: string;
  signal_type: string;
  category: string | null;
  events: RawEvent[];
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function generateInsightText(cohort: CohortRow, sampleSize: number): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return "";

  const prompt = `You are a startup analytics assistant. Generate a single, actionable insight (1–2 sentences, max 120 chars) for this cohort of founders:
Stage: ${cohort.stage}
Signal: ${cohort.signal_type}
Category: ${cohort.category ?? "all"}
Sample size: ${sampleSize} founders

Be specific and data-driven. Start with "Founders who..." or "At ${cohort.stage} stage...". No hedging.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  // Auth check
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing env" }, { status: 500 });
  }

  const supabase = createAdmin(supabaseUrl, serviceKey);

  // Read all events from the last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Early exit if no actionable records exist.
  const { count, error: countError } = await supabase
    .from("benchmark_events")
    .select("signal_type", { count: "exact", head: true })
    .gte("created_at", since);

  if (countError) {
    console.error("[aggregate-benchmarks] count error", countError);
    return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  const { data: events, error: eventsError } = await supabase
    .from("benchmark_events")
    .select("signal_type, stage, category, momentum_bucket")
    .gte("created_at", since);

  if (eventsError) {
    console.error("[aggregate-benchmarks] events fetch error", eventsError);
    return NextResponse.json({ ok: false, error: eventsError.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true, message: "No events to aggregate", cohorts_upserted: 0, processed: 0, durationMs: Date.now() - start });
  }

  // Group by (stage, signal_type, category)
  const groups = new Map<string, CohortRow>();
  for (const event of events as RawEvent[]) {
    const key = `${event.stage}|${event.signal_type}|${event.category ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, { stage: event.stage, signal_type: event.signal_type, category: event.category, events: [] });
    }
    groups.get(key)!.events.push(event);
  }

  let cohortsUpserted = 0;
  const upserts: Record<string, unknown>[] = [];

  for (const [, cohort] of groups) {
    const sampleSize = cohort.events.length;
    if (sampleSize < MIN_COHORT) continue; // privacy guard

    const momentumBuckets = cohort.events.map(e => e.momentum_bucket);
    const medianMomentum  = median(momentumBuckets);

    // Simple derived rates from signal types in the cohort
    const allEventsForStage = events.filter(e => (e as RawEvent).stage === cohort.stage) as RawEvent[];
    const pivotCount    = allEventsForStage.filter(e => e.signal_type === "pivot").length;
    const recoveryCount = allEventsForStage.filter(e => e.signal_type === "momentum_recovery").length;
    const taskDoneCount = allEventsForStage.filter(e => e.signal_type === "task_completed").length;
    const totalInStage  = allEventsForStage.length || 1;

    const completionRate = taskDoneCount / totalInStage;
    const pivotRate      = pivotCount / totalInStage;
    const recoveryRate   = recoveryCount / totalInStage;

    // Generate AI insight for large enough cohorts
    const insightText = await generateInsightText(cohort, sampleSize);

    upserts.push({
      stage:          cohort.stage,
      signal_type:    cohort.signal_type,
      category:       cohort.category,
      sample_size:    sampleSize,
      median_momentum: medianMomentum,
      completion_rate: completionRate,
      pivot_rate:      pivotRate,
      recovery_rate:   recoveryRate,
      insight_text:    insightText,
      updated_at:      new Date().toISOString(),
    });
    cohortsUpserted++;
  }

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("benchmark_cohorts")
      .upsert(upserts, { onConflict: "stage,signal_type,category" });

    if (upsertError) {
      console.error("[aggregate-benchmarks] upsert error", upsertError);
      return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
    }
  }

  console.log(`[aggregate-benchmarks] processed ${events.length} events → ${cohortsUpserted} cohorts upserted`);
  return NextResponse.json({ ok: true, events_processed: events.length, processed: events.length, cohorts_upserted: cohortsUpserted, durationMs: Date.now() - start });
}

// Allow GET for manual trigger from admin dashboard
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}

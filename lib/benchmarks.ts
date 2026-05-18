/**
 * lib/benchmarks.ts — AI Improvement #5: Aggregated benchmarking layer
 *
 * The data moat. Anonymized behavioral patterns across all BuildMind founders
 * enable statements like "founders who avoid sales conversations at your stage
 * have 3x higher pivot rates" — collective intelligence no competitor can
 * replicate without years of users.
 *
 * Architecture:
 *   1. Event ingestion: recordBenchmarkEvent() called from task/reflection API
 *   2. Aggregation: cron runs nightly via /api/cron/aggregate-benchmarks
 *   3. Query: getBenchmarkInsight() fetches pre-aggregated stats for a founder
 *   4. Injection: insights injected into Reflexion context at Stage 1
 *
 * Privacy:
 *   - All data is anonymized at the row level (no user_id in aggregate table)
 *   - Cohort minimum: never surface insights from cohorts < 10 founders
 *     (prevents re-identification of early users)
 *   - Bucket keys: stage + avoidance_category + completion_rate_bucket
 *
 * Schema (see migration 20260517000001_benchmarks.sql):
 *   benchmark_events   — raw anonymized events (user_id dropped at write)
 *   benchmark_cohorts  — pre-aggregated stats keyed by (stage, signal_type)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BenchmarkSignalType =
  | "avoidance"         // founder avoided a task category
  | "override"          // founder overrode AI suggestion
  | "task_completed"    // founder completed a task
  | "momentum_recovery" // founder recovered from low momentum
  | "pivot"             // founder recorded a pivot decision
  | "first_user"        // founder got first paying user
  | "stall"             // founder went 7+ days inactive;

export interface BenchmarkEvent {
  signal_type: BenchmarkSignalType;
  stage: string;            // "Idea" | "MVP" | "Launch" | "Growth"
  category?: string;        // task category for avoidance/completion events
  momentum_bucket: number;  // round(momentum_score / 10) * 10 → 20|30|40…100
  week_of_year: number;     // 1–52, for temporal patterns
}

export interface BenchmarkCohort {
  stage: string;
  signal_type: BenchmarkSignalType;
  category?: string;
  sample_size: number;          // founders in this cohort
  median_momentum: number;      // median momentum_score in cohort
  completion_rate: number;      // 0–1: tasks completed / total
  pivot_rate: number;           // 0–1: proportion who pivoted within 60d
  recovery_rate: number;        // 0–1: proportion who recovered momentum within 14d
  avg_days_to_first_user: number;
  insight_text: string;         // pre-generated natural language insight
  updated_at: string;
}

// ── Minimum cohort size ────────────────────────────────────────────────────────
const MIN_COHORT = 10;

// ── Event ingestion ───────────────────────────────────────────────────────────

/**
 * recordBenchmarkEvent — write a single anonymized event to Supabase.
 * Call from task/reflection API routes. user_id is never written.
 *
 * @param supabase  Admin Supabase client (service role — bypasses RLS)
 * @param event     Anonymized event data
 */
export async function recordBenchmarkEvent(
  supabase: { from: (t: string) => { insert: (d: unknown) => Promise<{ error: unknown }> } },
  event: BenchmarkEvent,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("benchmark_events")
      .insert({
        signal_type:    event.signal_type,
        stage:          event.stage,
        category:       event.category ?? null,
        momentum_bucket: event.momentum_bucket,
        week_of_year:   event.week_of_year,
        // No user_id — privacy by design
        created_at:     new Date().toISOString(),
      });
    if (error) throw error;
  } catch {
    // non-critical — don't fail the main request
  }
}

/**
 * makeBenchmarkEvent — convenience builder from founder context fields.
 * Call this in route handlers instead of constructing BenchmarkEvent manually.
 */
export function makeBenchmarkEvent(
  signalType: BenchmarkSignalType,
  opts: { stage: string; momentumScore: number; category?: string },
): BenchmarkEvent {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff  = now.getTime() - start.getTime();
  const weekOfYear = Math.ceil(diff / (7 * 24 * 3600 * 1000));

  return {
    signal_type:    signalType,
    stage:          opts.stage,
    category:       opts.category,
    momentum_bucket: Math.round(opts.momentumScore / 10) * 10,
    week_of_year:   weekOfYear,
  };
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * getBenchmarkInsights — fetch 1–3 relevant cohort insights for a founder.
 * Returns empty array if no matching cohort or cohort is below MIN_COHORT.
 *
 * Used by the Reflexion pipeline to inject peer context:
 *   "Founders at your stage who avoided sales for 7+ days had a 68% pivot rate."
 */
export async function getBenchmarkInsights(
  supabase: { from: (t: string) => { select: (...a: unknown[]) => unknown } },
  opts: { stage: string; avoidanceCategory?: string; signalTypes?: BenchmarkSignalType[] },
): Promise<BenchmarkCohort[]> {
  const types = opts.signalTypes ?? ["avoidance", "task_completed", "momentum_recovery"];

  try {
    const query = (supabase
      .from("benchmark_cohorts")
      .select("*") as unknown as {
        eq: (...a: unknown[]) => unknown;
        in: (...a: unknown[]) => unknown;
        gte: (...a: unknown[]) => unknown;
        limit: (...a: unknown[]) => unknown;
        then: (cb: (v: { data: BenchmarkCohort[] | null }) => unknown) => unknown;
      });

    // TypeScript note: Supabase query builder is deeply chained — cast to any
    // for the multi-step filter chain, then parse the result strictly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (query as any)
      .eq("stage", opts.stage)
      .in("signal_type", types)
      .gte("sample_size", MIN_COHORT)
      .order("sample_size", { ascending: false })
      .limit(3) as { data: BenchmarkCohort[] | null; error: unknown };

    return result.data ?? [];
  } catch {
    return [];
  }
}

// ── Formatting ─────────────────────────────────────────────────────────────────

/**
 * buildBenchmarkPrompt — formats cohort insights into a concise Reflexion context block.
 * Injected at Stage 1 (Context Ingestion) of the Reflexion pipeline.
 *
 * Output example:
 * "PEER BENCHMARK DATA (anonymized — n=47 founders at MVP stage):
 *  - Founders who avoided sales conversations for 7+ days: 68% pivot rate within 60d.
 *  - Founders with momentum score 50–60: 42% recovered within 14d of engaging AI Coach.
 * Use this as context if directly relevant. Never cite the numbers unless founder asks."
 */
export function buildBenchmarkPrompt(cohorts: BenchmarkCohort[]): string {
  if (cohorts.length === 0) return "";

  const minN    = Math.min(...cohorts.map(c => c.sample_size));
  const maxN    = Math.max(...cohorts.map(c => c.sample_size));
  const nLabel  = minN === maxN ? `n=${minN}` : `n=${minN}–${maxN}`;
  const stage   = cohorts[0]?.stage ?? "your stage";

  const lines = cohorts
    .filter(c => c.insight_text)
    .map(c => `  - ${c.insight_text}`);

  if (lines.length === 0) return "";

  return [
    `PEER BENCHMARK DATA (anonymized — ${nLabel} founders at ${stage} stage):`,
    ...lines,
    "",
    "Use this as supporting context only if directly relevant to the founder's question. Never cite sample sizes or percentages unless the founder asks for data.",
  ].join("\n");
}

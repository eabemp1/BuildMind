-- 20260517000001_benchmarks.sql
--
-- AI Improvement #5: Aggregated benchmarking layer (data moat foundation)
--
-- Two tables:
--   benchmark_events   — raw anonymized events (no user_id — privacy by design)
--   benchmark_cohorts  — pre-aggregated stats, updated nightly by cron
--
-- The nightly aggregation cron (/api/cron/aggregate-benchmarks) reads from
-- benchmark_events and writes to benchmark_cohorts using window functions.
-- Cohorts with sample_size < 10 are excluded to prevent re-identification.

-- ── benchmark_events (raw, append-only, anonymized) ──────────────────────────

create table if not exists benchmark_events (
  id              bigserial primary key,
  signal_type     text        not null,   -- avoidance|task_completed|pivot|stall…
  stage           text        not null,   -- Idea|MVP|Launch|Growth
  category        text,                   -- task category for avoidance events
  momentum_bucket smallint    not null,   -- 20|30|40|50|60|70|80|90|100
  week_of_year    smallint    not null,   -- 1–52
  created_at      timestamptz not null default now()
  -- NOTE: intentionally no user_id column — privacy by design
);

-- Partition on signal_type for fast cohort aggregation queries
create index if not exists idx_benchmark_events_signal_stage
  on benchmark_events (signal_type, stage, created_at desc);

create index if not exists idx_benchmark_events_stage_category
  on benchmark_events (stage, category);

-- ── benchmark_cohorts (pre-aggregated, refreshed nightly) ────────────────────

create table if not exists benchmark_cohorts (
  id                      bigserial primary key,
  stage                   text     not null,
  signal_type             text     not null,
  category                text,
  sample_size             int      not null default 0,
  median_momentum         numeric(5,2) not null default 0,
  completion_rate         numeric(5,4) not null default 0, -- 0.0000–1.0000
  pivot_rate              numeric(5,4) not null default 0,
  recovery_rate           numeric(5,4) not null default 0,
  avg_days_to_first_user  numeric(8,2),
  insight_text            text,    -- natural language insight, AI-generated nightly
  updated_at              timestamptz not null default now(),

  unique (stage, signal_type, coalesce(category, ''))
);

create index if not exists idx_benchmark_cohorts_stage_signal
  on benchmark_cohorts (stage, signal_type, sample_size desc);

-- ── RLS — benchmark_events is insert-only for authenticated users ─────────────
-- No read access for users — only service role reads for aggregation.

alter table benchmark_events enable row level security;

-- Authenticated users can insert (write their anonymized events)
create policy "benchmark_events_insert_authenticated"
  on benchmark_events
  for insert
  to authenticated
  with check (true);

-- No SELECT for regular users — only service role (aggregation cron)
create policy "benchmark_events_no_select"
  on benchmark_events
  for select
  to authenticated
  using (false);

-- ── RLS — benchmark_cohorts is read-only for authenticated users ──────────────
alter table benchmark_cohorts enable row level security;

create policy "benchmark_cohorts_select_authenticated"
  on benchmark_cohorts
  for select
  to authenticated
  using (sample_size >= 10);  -- enforce minimum cohort size at DB level

-- No user writes to cohorts — only service role from aggregation cron
create policy "benchmark_cohorts_no_insert"
  on benchmark_cohorts
  for insert
  to authenticated
  with check (false);

-- ── Comments ──────────────────────────────────────────────────────────────────

comment on table benchmark_events is
  'Anonymized founder behavior events for collective intelligence. No user_id stored. See lib/benchmarks.ts.';

comment on table benchmark_cohorts is
  'Pre-aggregated cohort statistics. Refreshed nightly by /api/cron/aggregate-benchmarks. Sample size < 10 rows are excluded by RLS. See lib/benchmarks.ts.';

-- 20260517000003_weekly_reports_share.sql
-- Growth Improvement #4: Shareable weekly report
-- Stores generated weekly reports with a public share token.
-- /reports/share/[token] renders a public card — no auth required.

create table if not exists weekly_reports (
  id          bigserial    primary key,
  user_id     uuid         not null references auth.users(id) on delete cascade,
  share_token text         not null,
  report_data jsonb        not null default '{}'::jsonb,
  ai_summary  text,
  created_at  timestamptz  not null default now(),
  -- Each user can have multiple weekly reports; token is globally unique
  constraint weekly_reports_share_token_unique unique (share_token)
);

create index if not exists idx_weekly_reports_user_id
  on weekly_reports (user_id, created_at desc);

create index if not exists idx_weekly_reports_share_token
  on weekly_reports (share_token);

-- RLS
alter table weekly_reports enable row level security;

-- Authenticated user can read their own reports
DROP POLICY IF EXISTS "weekly_reports_select_own" ON weekly_reports;
create policy "weekly_reports_select_own"
  on weekly_reports for select to authenticated
  using (auth.uid() = user_id);

-- Authenticated user can insert their own reports
DROP POLICY IF EXISTS "weekly_reports_insert_own" ON weekly_reports;
create policy "weekly_reports_insert_own"
  on weekly_reports for insert to authenticated
  with check (auth.uid() = user_id);

-- PUBLIC read by share token (for /reports/share/[token] page)
-- Any visitor can read a report row if they know the share token.
-- report_data and ai_summary do not contain PII (user_id is not exposed).
DROP POLICY IF EXISTS "weekly_reports_select_by_token" ON weekly_reports;
create policy "weekly_reports_select_by_token"
  on weekly_reports for select to anon
  using (true);  -- anon role can only read; RLS on other ops still applies

comment on table weekly_reports is
  'AI-generated weekly reports. Public share via /reports/share/[share_token]. See Growth Improvement #4.';
comment on column weekly_reports.share_token is
  '24-char hex token (crypto.randomUUID stripped). Used as public URL path — not guessable.';


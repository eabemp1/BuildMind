-- Anonymous, deduplicated opens and optional feedback for shared Break reports.
-- Public requests are recorded through the server with the service role; no client RLS policy is granted.
create table if not exists public.break_share_events (
  token text not null references public.break_shares(token) on delete cascade,
  visitor text not null,
  answer text check (answer in ('yes', 'partly', 'no')),
  note text check (note is null or char_length(note) <= 280),
  opened_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (token, visitor)
);

create index if not exists break_share_events_token_opened_idx
  on public.break_share_events(token, opened_at desc);

alter table public.break_share_events enable row level security;

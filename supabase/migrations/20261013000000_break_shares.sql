-- Shareable Break My Startup results. The row holds ONLY a sanitised summary
-- (see lib/breakShare.ts), never the full result, user id is not exposed.
create table if not exists break_shares (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists idx_break_shares_user on break_shares (user_id, created_at desc);
alter table break_shares enable row level security;
-- No anon policy: public reads go through the server with the service role,
-- filtered by token and revoked_at. Owners manage their own rows.
drop policy if exists "break_shares_owner_all" on break_shares;
create policy "break_shares_owner_all" on break_shares for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

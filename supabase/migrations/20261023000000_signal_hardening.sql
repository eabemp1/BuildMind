-- Harder-to-fake signals. Requires 20261022040000_signal_trust_and_links.sql. Idempotent.
--   * Signups count only after the person clicks the confirmation link in an email (double opt-in).
--   * "confirm" links: the founder sends one to a person who replied or talked with them; that person
--     confirms on their own device. The link says what is being confirmed (reply / conversation / call).

alter table public.signal_events add column if not exists confirm_token text;
alter table public.signal_events add column if not exists confirmed_at  timestamptz;
create unique index if not exists signal_events_confirm_token_idx on public.signal_events (confirm_token) where confirm_token is not null;

alter table public.signal_links add column if not exists claim_kind text;

do $$
begin
  alter table public.signal_links drop constraint if exists signal_links_kind_check;
  alter table public.signal_links add constraint signal_links_kind_check check (kind in ('link','interest','confirm'));
  alter table public.signal_links drop constraint if exists signal_links_claim_kind_chk;
  alter table public.signal_links add constraint signal_links_claim_kind_chk
    check (claim_kind is null or claim_kind in ('reply','conversation','call'));
  alter table public.signal_events drop constraint if exists signal_events_event_check;
  alter table public.signal_events add constraint signal_events_event_check check (event in ('visit','signup','confirm'));
end $$;

-- One confirmation per device per link.
create unique index if not exists signal_events_one_confirm_per_visitor
  on public.signal_events (link_id, visitor_hash) where event = 'confirm' and visitor_hash is not null;

-- Signups recorded before this migration were never confirmed by the person, so they stay uncounted.

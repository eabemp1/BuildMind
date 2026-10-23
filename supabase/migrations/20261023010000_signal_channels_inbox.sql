-- Channel tags on links, and a reply-to inbox. Requires 20261023000000_signal_hardening.sql. Idempotent.
--   * signal_links.source: which channel a link was made for (x, linkedin, whatsapp, ...).
--   * kind 'inbound': a reply-to address (reply+<code>@domain). Authenticated replies arrive as 'reply' events.

alter table public.signal_links add column if not exists source text;

do $$
begin
  alter table public.signal_links drop constraint if exists signal_links_source_chk;
  alter table public.signal_links add constraint signal_links_source_chk
    check (source is null or source in ('x','linkedin','reddit','whatsapp','indiehackers','hn','devto','email','other'));
  alter table public.signal_links drop constraint if exists signal_links_kind_check;
  alter table public.signal_links add constraint signal_links_kind_check check (kind in ('link','interest','confirm','inbound'));
  alter table public.signal_events drop constraint if exists signal_events_event_check;
  alter table public.signal_events add constraint signal_events_event_check check (event in ('visit','signup','confirm','reply'));
end $$;

-- One counted reply per sender per address.
create unique index if not exists signal_events_one_reply_per_sender
  on public.signal_events (link_id, lower(email)) where event = 'reply' and email is not null;

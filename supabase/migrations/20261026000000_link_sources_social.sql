-- More channels for tracked links: TikTok, Instagram, YouTube. Idempotent.
do $$ begin
  alter table public.signal_links drop constraint if exists signal_links_source_chk;
  alter table public.signal_links add constraint signal_links_source_chk
    check (source is null or source in ('x','linkedin','reddit','whatsapp','indiehackers','hn','devto','email','tiktok','instagram','youtube','other'));
end $$;

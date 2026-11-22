-- The look and sections of a founder's published landing page. Null means the plain headline-and-form page.
alter table public.signal_links add column if not exists design jsonb;

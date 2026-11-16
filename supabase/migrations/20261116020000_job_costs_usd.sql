-- Approximate dollar cost per job, from published list prices (lib/modelPrices.ts). REVIEW BEFORE APPLYING. Idempotent.
alter table public.job_costs add column if not exists approx_usd numeric(12,6) not null default 0;
alter table public.job_costs add column if not exists unpriced_calls integer not null default 0;

-- An experiment can belong to one of the project's milestones. Reading only: results never complete a milestone.
-- REVIEW BEFORE APPLYING. Idempotent. Needs 20261116000000_customer_experiments.sql. Existing rows are untouched.
alter table public.customer_experiments add column if not exists milestone_id uuid references public.milestones(id) on delete set null;
create index if not exists customer_experiments_milestone_idx on public.customer_experiments (milestone_id) where milestone_id is not null;

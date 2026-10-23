-- Structured outcomes for the learning loop.
-- A resolved recommendation can now record WHAT it produced (a reply, signup, call, payment or
-- nothing) instead of relying only on word overlap between prediction and reflection.
-- Idempotent: safe to run more than once.

alter table public.reflexion_learning_log add column if not exists signal_kind text;
alter table public.reflexion_learning_log add column if not exists signal_count integer;
-- Who reported the signal: the founder on the Reflect form, or an automatic source (see signal ingest).
alter table public.reflexion_learning_log add column if not exists signal_source text;
-- How evidence_match_score was computed: 'structured' (from signal_kind) or 'text' (word overlap fallback).
alter table public.reflexion_learning_log add column if not exists score_basis text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reflexion_learning_log_signal_kind_chk') then
    alter table public.reflexion_learning_log
      add constraint reflexion_learning_log_signal_kind_chk
      check (signal_kind is null or signal_kind in ('none','reply','conversation','signup','call','payment','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reflexion_learning_log_signal_count_chk') then
    alter table public.reflexion_learning_log
      add constraint reflexion_learning_log_signal_count_chk
      check (signal_count is null or (signal_count >= 0 and signal_count <= 9999));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reflexion_learning_log_score_basis_chk') then
    alter table public.reflexion_learning_log
      add constraint reflexion_learning_log_score_basis_chk
      check (score_basis is null or score_basis in ('structured','text'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reflexion_learning_log_signal_source_chk') then
    alter table public.reflexion_learning_log
      add constraint reflexion_learning_log_signal_source_chk
      check (signal_source is null or signal_source in ('founder','auto'));
  end if;
end $$;

-- Existing rows were all scored by word overlap.
update public.reflexion_learning_log
   set score_basis = 'text'
 where evidence_match_score is not null and score_basis is null;

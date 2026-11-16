-- Two more things a founder can confirm in an experiment: someone said they would pay, and someone paid.
-- REVIEW BEFORE APPLYING. Idempotent. Replaces the check on experiment_events.kind.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.experiment_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.experiment_events drop constraint %I', c);
  end loop;
  alter table public.experiment_events add constraint experiment_events_kind_check
    check (kind in ('prepared','sent','replied','no_reply','blocked','would_pay','paid','note'));
end $$;

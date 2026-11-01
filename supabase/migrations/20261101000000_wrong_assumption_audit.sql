-- Let founders flag an untrue assumption and store deterministic audit findings.
alter table public.today_feedback
  drop constraint if exists today_feedback_reason_check;
alter table public.today_feedback
  add constraint today_feedback_reason_check
  check (reason in ('no_users', 'no_access', 'already_done', 'too_big', 'not_relevant', 'no_time', 'no_motivation', 'wrong_assumption'));

alter table public.today_quality_events
  drop constraint if exists today_quality_events_kind_check;
alter table public.today_quality_events
  add constraint today_quality_events_kind_check
  check (kind in ('rejected', 'fallback', 'outcome_adjusted', 'feedback', 'loop_recorded', 'audit'));

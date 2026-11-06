-- Evidence a founder attaches before a project moves to a later stage.
-- The code already reads and writes this table (app/api/project/stage-evidence); this migration makes
-- the schema rebuildable from the repo. Idempotent: if the table already exists it is left alone.
create table if not exists public.project_stage_evidence (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null,
  user_id               uuid not null,
  from_stage            text not null,
  to_stage              text not null,
  evidence_type         text not null check (evidence_type in ('metric','artifact','experiment','founder_judgment')),
  metric_name           text,
  metric_value          text,
  metric_date           text,
  artifact_description  text,
  artifact_url          text,
  experiment_channel    text,
  experiment_hypothesis text,
  experiment_outcome    text,
  judgment_text         text,
  created_at            timestamptz not null default now()
);
create index if not exists project_stage_evidence_idx
  on public.project_stage_evidence (project_id, from_stage, to_stage, created_at desc);
alter table public.project_stage_evidence enable row level security;

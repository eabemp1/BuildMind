-- Distribution Intelligence Studio (private founder workspace). Service-role only.
CREATE TABLE IF NOT EXISTS dist_drafts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  platform   text NOT NULL DEFAULT 'linkedin',
  audience   text,
  outcome    text,
  context    text,
  body       text NOT NULL,
  diagnosis  jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dist_drafts_user_idx ON dist_drafts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dist_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  platform          text NOT NULL DEFAULT 'reddit',
  url               text,
  excerpt           text,
  segment           text,
  relevance         text,
  suggested_reply   text,
  status            text NOT NULL DEFAULT 'queued',
  next_action       text,
  notes             text,
  last_contacted_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dist_conv_user_idx ON dist_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dist_experiments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  draft_id            uuid,
  hypothesis          text NOT NULL,
  segment             text,
  platform            text NOT NULL DEFAULT 'linkedin',
  variant             text,
  run_on              date,
  status              text NOT NULL DEFAULT 'planned',
  impressions         integer,
  replies             integer,
  meaningful_exchanges integer,
  profile_visits      integer,
  qualified_founders  integer,
  signups             integer,
  activations         integer,
  paid                integer,
  observations        text,
  ai_interpretation   text,
  learning            text,
  next_experiment     text,
  metrics_as_of       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dist_exp_user_idx ON dist_experiments (user_id, updated_at DESC);

ALTER TABLE dist_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dist_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dist_experiments ENABLE ROW LEVEL SECURITY;

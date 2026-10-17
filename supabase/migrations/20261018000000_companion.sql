-- Co-founder: one row per moment per day (status updated in place) and per-founder intensity.
CREATE TABLE IF NOT EXISTS public.companion_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  moment_key  text NOT NULL,
  kind        text,
  day         date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  status      text NOT NULL DEFAULT 'shown' CHECK (status IN ('shown','dismissed','acted')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moment_key, day)
);
CREATE INDEX IF NOT EXISTS companion_events_user_recent ON public.companion_events (user_id, day DESC);
ALTER TABLE public.companion_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.companion_settings (
  user_id    uuid PRIMARY KEY,
  intensity  text NOT NULL DEFAULT 'balanced' CHECK (intensity IN ('quiet','balanced','relentless')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companion_settings ENABLE ROW LEVEL SECURITY;

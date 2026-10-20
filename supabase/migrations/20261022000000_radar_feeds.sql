-- Private, revocable-by-deletion calendar feed tokens for Radar.
CREATE TABLE IF NOT EXISTS public.radar_feeds (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[a-f0-9]{48}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.radar_feeds ENABLE ROW LEVEL SECURITY;

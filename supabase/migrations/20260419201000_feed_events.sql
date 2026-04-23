-- Migration: feed_events table (public Explore feed)

CREATE TABLE IF NOT EXISTS feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag text NOT NULL,
  location text NOT NULL,
  stage text NOT NULL,
  stage_color text NOT NULL DEFAULT '#6366f1',
  action text NOT NULL,
  outcome text,
  streak int NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('done','reflect','launched','streak','report')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

-- Anonymous/public read for the Explore page
CREATE POLICY "public read"
  ON feed_events FOR SELECT
  USING (true);


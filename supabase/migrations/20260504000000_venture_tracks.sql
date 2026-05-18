-- Migration: 20260504000000_venture_tracks.sql
--
-- Adds the venture_tracks table so that roadmap track progress (decisions
-- marked done, track creation/deletion) is persisted server-side instead of
-- only in localStorage. This means progress survives new devices, browser
-- clears, and incognito sessions — consistent with how streak, XP, and
-- score history are already handled.
--
-- The localStorage layer is kept as a read-through cache (it still writes
-- locally for instant UI updates) but the server is the source of truth.

CREATE TABLE IF NOT EXISTS venture_tracks (
  id          text          PRIMARY KEY,                -- client-generated UUID
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb         NOT NULL DEFAULT '{}'::jsonb,  -- full UserTrack JSON
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- RLS: each user can only access their own tracks
ALTER TABLE venture_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venture_tracks_self_only" ON venture_tracks;

CREATE POLICY "venture_tracks_self_only"
  ON venture_tracks
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS venture_tracks_user_updated
  ON venture_tracks (user_id, updated_at DESC);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'venture_tracks_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS venture_tracks_updated_at ON venture_tracks;
    CREATE TRIGGER venture_tracks_updated_at
      BEFORE UPDATE ON venture_tracks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Also add blueprint_first_used flag to founder_context so the "free preview
-- used" gate survives across devices (was previously localStorage-only).
ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS blueprint_first_used boolean NOT NULL DEFAULT false;

COMMENT ON TABLE venture_tracks IS
  'Stores user roadmap track progress server-side. Data column holds the full UserTrack JSON including all paths and decision done states.';

COMMENT ON COLUMN venture_tracks.data IS
  'Full UserTrack JSON object. Replaced on every save (last-write-wins, same as the localStorage pattern it replaces).';



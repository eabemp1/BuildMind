-- Migration: founder_memory table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS founder_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  personality_tags text[] NOT NULL DEFAULT '{}',
  decision_patterns jsonb NOT NULL DEFAULT '[]',
  emotional_signals jsonb NOT NULL DEFAULT '[]',
  avoidance_zones text[] NOT NULL DEFAULT '{}',
  strengths text[] NOT NULL DEFAULT '{}',
  cofounder_style text NOT NULL DEFAULT 'execution-coach'
    CHECK (cofounder_style IN ('direct-challenger', 'strategic-partner', 'execution-coach', 'devil-advocate')),
  last_insight text,
  insight_history jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- RLS: users can only see their own memory
ALTER TABLE founder_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own memory"
  ON founder_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own memory"
  ON founder_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory"
  ON founder_memory FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS founder_memory_user_id_idx ON founder_memory (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_founder_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER founder_memory_updated_at
  BEFORE UPDATE ON founder_memory
  FOR EACH ROW EXECUTE FUNCTION update_founder_memory_timestamp();

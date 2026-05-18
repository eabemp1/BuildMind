-- Migration: 20260514000000_testimonials.sql
--
-- Creates the testimonials table for storing founder feedback.
-- Triggered from the TestimonialModal component after:
--   - 7-day streak (streak milestone in reflect/page.tsx)
--   - Completed outcome + confidence >= 4 (strong positive session)
--   - Manual prompt from admin
--
-- Columns:
--   id            — primary key
--   user_id       — FK to auth.users (nullable: allows pre-seeded testimonials)
--   display_name  — what to show publicly (full name or "Founder in Lagos")
--   avatar_url    — optional profile photo
--   streak        — streak at time of submission (social proof signal)
--   stage         — startup stage at time (Idea / Validation / MVP / Launch / Growth)
--   quote         — the testimonial text (required, max 400 chars)
--   rating        — 1–5 (optional, defaults to 5)
--   is_public     — founder opted in to public display (default false until confirmed)
--   source        — where the prompt was shown: 'streak_7' | 'streak_14' | 'high_confidence' | 'admin'
--   created_at
--   approved_at   — set by admin when approved for public use (nullable)

CREATE TABLE IF NOT EXISTS testimonials (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name  text        NOT NULL DEFAULT 'Anonymous founder',
  avatar_url    text,
  streak        int2        NOT NULL DEFAULT 0,
  stage         text        NOT NULL DEFAULT 'Idea',
  quote         text        NOT NULL CHECK (char_length(quote) BETWEEN 10 AND 400),
  rating        int2        NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  is_public     boolean     NOT NULL DEFAULT false,
  source        text        NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('streak_7', 'streak_14', 'high_confidence', 'streak_30', 'admin', 'manual')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Users can read their own testimonials
CREATE POLICY testimonials_read_own ON testimonials
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own testimonials
CREATE POLICY testimonials_insert_own ON testimonials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own (e.g. toggle is_public, edit quote)
CREATE POLICY testimonials_update_own ON testimonials
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public-approved testimonials are readable by everyone (for landing page)
CREATE POLICY testimonials_read_approved ON testimonials
  FOR SELECT
  USING (is_public = true AND approved_at IS NOT NULL);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_testimonials_user_id
  ON testimonials(user_id);

CREATE INDEX IF NOT EXISTS idx_testimonials_public_approved
  ON testimonials(is_public, approved_at DESC)
  WHERE is_public = true AND approved_at IS NOT NULL;

COMMENT ON TABLE testimonials IS
  'Founder testimonials collected in-product at high-engagement moments. '
  'is_public + approved_at must both be set before a testimonial appears on the landing page.';

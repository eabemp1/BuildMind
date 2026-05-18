-- ============================================================================
-- Migration: Audit Fixes — May 2026
-- Fixes the critical schema/TypeScript type misalignment identified in
-- the BuildMind v4 deep audit, and adds the processed_webhooks idempotency
-- table for billing webhook deduplication.
--
-- SAFE TO RUN ON EXISTING DATABASE: uses ALTER TABLE ADD COLUMN IF NOT EXISTS
-- and does not drop any existing columns (legacy columns kept for compatibility).
-- ============================================================================

-- ── 1. Fix founder_memory schema alignment with TypeScript FounderMemory type ──
--
-- Previous schema had: personality_profile jsonb, validation_receipts jsonb[]
-- TypeScript type expects: personality_tags text[], decision_patterns jsonb,
--   emotional_signals jsonb, avoidance_zones text[], strengths text[],
--   cofounder_style text, last_insight text, insight_history jsonb,
--   validationReceipts (camelCase → snake: validation_receipts jsonb),
--   competitorHistory (snake: competitor_history jsonb)
--
-- Any upsert using the TypeScript type against the old schema caused silent
-- data loss because the columns didn't exist.

ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS personality_tags      text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_patterns     jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS emotional_signals     jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS avoidance_zones       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strengths             text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cofounder_style       text    NOT NULL DEFAULT 'strategic-partner',
  ADD COLUMN IF NOT EXISTS last_insight          text,
  ADD COLUMN IF NOT EXISTS insight_history       jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS competitor_history    jsonb   NOT NULL DEFAULT '[]';

-- Migrate old personality_profile data into new columns where possible
-- personality_profile was a freeform jsonb; extract known keys if present.
UPDATE founder_memory
SET
  personality_tags  = COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(personality_profile->'personality_tags')),
    personality_tags
  ),
  avoidance_zones   = COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(personality_profile->'avoidance_zones')),
    avoidance_zones
  ),
  strengths         = COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(personality_profile->'strengths')),
    strengths
  ),
  cofounder_style   = COALESCE(
    (personality_profile->>'cofounder_style'),
    cofounder_style
  ),
  last_insight      = COALESCE(
    (personality_profile->>'last_insight'),
    last_insight
  )
WHERE personality_profile IS NOT NULL;

-- Migrate old validation_receipts jsonb[] → jsonb (array stored as jsonb)
-- The TypeScript type uses ValidationReceipt[] which maps to jsonb, not jsonb[].
-- We coerce the old jsonb[] to a jsonb array.
UPDATE founder_memory
SET validation_receipts = to_jsonb(validation_receipts)
WHERE validation_receipts IS NOT NULL;

-- ── 2. Add processed_webhooks table for billing idempotency ──────────────────
--
-- Paystack can fire the same webhook event twice. Without this table, a user
-- could theoretically be upgraded/downgraded twice from a single payment.
-- The webhook handler now inserts here before processing; a unique constraint
-- violation (23505) means the event was already handled → return 200 immediately.

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text        NOT NULL,
  event_key     text        NOT NULL,   -- Paystack reference or transaction id
  event_name    text,                   -- e.g. "charge.success"
  processed_at  timestamptz DEFAULT now(),
  UNIQUE (provider, event_key)
);

ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
-- No user-facing RLS policies — only accessible via service role key.

-- Auto-clean old records after 90 days to keep the table small.
-- Requires pg_cron extension (already enabled in schema).
SELECT cron.schedule(
  'cleanup-processed-webhooks',
  '0 3 * * *',  -- 3 AM daily
  $$DELETE FROM processed_webhooks WHERE processed_at < now() - interval '90 days'$$
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of migration
-- ============================================================================
